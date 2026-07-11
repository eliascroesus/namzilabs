import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createTestDb, seedConnection } from "@/test/pglite";
import {
  incrementRejectedCount,
  insertRawEvents,
  markRawEventFailed,
  processRawEvent,
  reprocessFailed,
} from "@/lib/ingest";

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  testDb = await createTestDb();
});

describe("ingestion pipeline (real Postgres via PGlite)", () => {
  it("processes a raw event into a normalized events row", async () => {
    const { connection, workspace } = await seedConnection(testDb, {
      config: { eventType: "lead_created" },
    });
    const [rawId] = await insertRawEvents(connection.id, [
      { id: "rec-1", email: "ava@example.com", name: "Ava", plan: "pro" },
    ]);

    const result = await processRawEvent(rawId);
    expect(result).toEqual({ status: "processed", inserted: 1 });

    const events = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.connectionId, connection.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workspaceId: workspace.id,
      provider: "webhook",
      eventType: "lead_created",
      externalId: "rec-1",
      contactEmail: "ava@example.com",
    });

    const [raw] = await testDb.select().from(schema.rawEvents).where(eq(schema.rawEvents.id, rawId));
    expect(raw.status).toBe("processed");
  });

  it("is idempotent: the same payload delivered twice yields ONE events row", async () => {
    const { connection } = await seedConnection(testDb);
    const payload = { id: "dup-1", email: "liam@example.com" };

    const [raw1] = await insertRawEvents(connection.id, [payload]);
    const [raw2] = await insertRawEvents(connection.id, [payload]);
    const r1 = await processRawEvent(raw1);
    const r2 = await processRawEvent(raw2);

    expect(r1.inserted).toBe(1);
    expect(r2.inserted).toBe(0); // conflict → no duplicate

    const events = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.connectionId, connection.id));
    expect(events).toHaveLength(1);
  });

  it("recovers failed raws via reprocessFailed and restores connection health", async () => {
    const { connection } = await seedConnection(testDb);
    const [rawId] = await insertRawEvents(connection.id, [{ id: "retry-1", email: "z@x.io" }]);

    await markRawEventFailed(rawId, "simulated normalize crash");
    let [conn] = await testDb
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connection.id));
    expect(conn.status).toBe("error");

    const result = await reprocessFailed(connection.id);
    expect(result).toMatchObject({ attempted: 1, ok: 1, failed: 0 });

    [conn] = await testDb
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connection.id));
    expect(conn.status).toBe("active");
    expect(conn.errorMessage).toBeNull();

    const events = await testDb
      .select()
      .from(schema.events)
      .where(eq(schema.events.connectionId, connection.id));
    expect(events).toHaveLength(1);
  });

  it("marks re-delivery of an already-processed raw as a no-op", async () => {
    const { connection } = await seedConnection(testDb);
    const [rawId] = await insertRawEvents(connection.id, [{ id: "once-1" }]);
    await processRawEvent(rawId);
    const again = await processRawEvent(rawId);
    expect(again).toEqual({ status: "processed", inserted: 0 });
  });

  it("tracks rejected (bad-signature) deliveries per connection", async () => {
    const { connection } = await seedConnection(testDb);
    await incrementRejectedCount(connection.id);
    await incrementRejectedCount(connection.id);
    const [conn] = await testDb
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connection.id));
    expect(conn.rejectedCount).toBe(2);
  });
});
