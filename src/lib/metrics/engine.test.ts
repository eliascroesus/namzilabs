import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDb, seedConnection } from "@/test/pglite";
import { grainForRange, runMetric } from "@/lib/metrics/engine";
import type { EventMetricDefinition } from "@/lib/metrics/types";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let workspaceId: string;
let connectionId: string;

const range = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-08-01T00:00:00Z") };

function def(partial: Partial<EventMetricDefinition>): EventMetricDefinition {
  return {
    type: "event",
    source: { connectionIds: "all", eventTypes: ["booking_created"] },
    filters: [],
    aggregation: { type: "count" },
    ...partial,
  } as EventMetricDefinition;
}

beforeAll(async () => {
  testDb = await createTestDb();
  const seeded = await seedConnection(testDb);
  workspaceId = seeded.workspace.id;
  connectionId = seeded.connection.id;

  const mk = (
    eventType: string,
    externalId: string,
    occurredAt: string,
    extra: Partial<typeof schema.events.$inferInsert> = {},
  ) => ({
    workspaceId,
    connectionId,
    provider: "webhook" as const,
    eventType,
    externalId,
    occurredAt: new Date(occurredAt),
    metadata: {},
    ...extra,
  });

  await testDb.insert(schema.events).values([
    mk("booking_created", "b1", "2026-07-05T10:00:00Z", {
      contactEmail: "ava@x.io",
      metadata: { campaign: "q3-launch", score: "8" },
    }),
    mk("booking_created", "b2", "2026-07-06T11:00:00Z", {
      contactEmail: "liam@x.io",
      metadata: { campaign: "q3-launch", score: "3" },
    }),
    mk("booking_created", "b3", "2026-07-06T12:00:00Z", {
      contactEmail: "ava@x.io", // repeat contact
      metadata: { campaign: "evergreen" },
    }),
    // 23:30 UTC on the 10th = 01:30 on the 11th in Stockholm (UTC+2 in July)
    mk("booking_created", "b4", "2026-07-10T23:30:00Z", { contactEmail: "zoe@x.io" }),
    mk("opportunity_created", "o1", "2026-07-07T09:00:00Z", { amount: "100" }),
    mk("opportunity_created", "o2", "2026-07-08T09:00:00Z", { amount: "250" }),
  ]);
});

describe("metric engine (real SQL via PGlite)", () => {
  it("count with a day series", async () => {
    const res = await runMetric(def({}), workspaceId, range, "day");
    expect(res.total).toBe(4);
    const byBucket = Object.fromEntries(res.series.map((p) => [p.bucket.slice(0, 10), p.value]));
    expect(byBucket["2026-07-05"]).toBe(1);
    expect(byBucket["2026-07-06"]).toBe(2);
  });

  it("unique_count of contacts", async () => {
    const res = await runMetric(
      def({ aggregation: { type: "unique_count", field: "contact_email" } }),
      workspaceId,
      range,
      "day",
    );
    expect(res.total).toBe(3); // ava counted once
  });

  it("sum and average of amount", async () => {
    const sum = await runMetric(
      def({ source: { connectionIds: "all", eventTypes: ["opportunity_created"] }, aggregation: { type: "sum", field: "amount" } }),
      workspaceId,
      range,
      "day",
    );
    expect(sum.total).toBe(350);
    const avg = await runMetric(
      def({ source: { connectionIds: "all", eventTypes: ["opportunity_created"] }, aggregation: { type: "average", field: "amount" } }),
      workspaceId,
      range,
      "day",
    );
    expect(avg.total).toBe(175);
  });

  it("metadata filters: contains, equals, exists, numeric gt", async () => {
    const contains = await runMetric(
      def({ filters: [{ field: "metadata.campaign", op: "contains", value: "q3" }] }),
      workspaceId,
      range,
      "day",
    );
    expect(contains.total).toBe(2);

    const equals = await runMetric(
      def({ filters: [{ field: "metadata.campaign", op: "equals", value: "evergreen" }] }),
      workspaceId,
      range,
      "day",
    );
    expect(equals.total).toBe(1);

    const exists = await runMetric(
      def({ filters: [{ field: "metadata.score", op: "exists" }] }),
      workspaceId,
      range,
      "day",
    );
    expect(exists.total).toBe(2);

    const gt = await runMetric(
      def({ filters: [{ field: "metadata.score", op: "gt", value: 5 }] }),
      workspaceId,
      range,
      "day",
    );
    expect(gt.total).toBe(1);
  });

  it("returns zero/empty for event types with no data", async () => {
    const res = await runMetric(
      def({ source: { connectionIds: "all", eventTypes: ["nothing_here"] } }),
      workspaceId,
      range,
      "day",
    );
    expect(res.total).toBe(0);
    expect(res.series).toEqual([]);
  });

  it("is workspace-scoped (another workspace sees nothing)", async () => {
    const other = await seedConnection(testDb);
    const res = await runMetric(def({}), other.workspace.id, range, "day");
    expect(res.total).toBe(0);
  });

  it("buckets in the workspace timezone", async () => {
    const { eq } = await import("drizzle-orm");
    await testDb
      .update(schema.workspaces)
      .set({ timezone: "Europe/Stockholm" })
      .where(eq(schema.workspaces.id, workspaceId));

    const res = await runMetric(def({}), workspaceId, range, "day");
    const byBucket = Object.fromEntries(res.series.map((p) => [p.bucket.slice(0, 10), p.value]));
    // b4 was 23:30 UTC on the 10th → 01:30 local on the 11th
    expect(byBucket["2026-07-11"]).toBe(1);
    expect(byBucket["2026-07-10"]).toBeUndefined();

    await testDb
      .update(schema.workspaces)
      .set({ timezone: "UTC" })
      .where(eq(schema.workspaces.id, workspaceId));
  });

  it("computes ratio metrics as percentages with divide-by-zero → null", async () => {
    const [numRow] = await testDb
      .insert(schema.metrics)
      .values({ workspaceId, name: "Bookings", definition: def({}) })
      .returning();
    const [denRow] = await testDb
      .insert(schema.metrics)
      .values({
        workspaceId,
        name: "Opps",
        definition: def({ source: { connectionIds: "all", eventTypes: ["opportunity_created"] } }),
      })
      .returning();

    const res = await runMetric(
      { type: "ratio", numeratorMetricId: numRow.id, denominatorMetricId: denRow.id, format: "percent" },
      workspaceId,
      range,
      "day",
    );
    expect(res.format).toBe("percent");
    expect(res.total).toBe(200); // 4 bookings / 2 opportunities

    const [emptyDen] = await testDb
      .insert(schema.metrics)
      .values({
        workspaceId,
        name: "None",
        definition: def({ source: { connectionIds: "all", eventTypes: ["nothing_here"] } }),
      })
      .returning();
    const zero = await runMetric(
      { type: "ratio", numeratorMetricId: numRow.id, denominatorMetricId: emptyDen.id, format: "percent" },
      workspaceId,
      range,
      "day",
    );
    expect(zero.total).toBeNull();
  });

  it("rejects self-referencing ratios and ratios of ratios", async () => {
    const [numRow] = await testDb
      .insert(schema.metrics)
      .values({ workspaceId, name: "A", definition: def({}) })
      .returning();
    await expect(
      runMetric(
        { type: "ratio", numeratorMetricId: numRow.id, denominatorMetricId: numRow.id, format: "percent" },
        workspaceId,
        range,
        "day",
      ),
    ).rejects.toThrow(/different/);

    const [ratioRow] = await testDb
      .insert(schema.metrics)
      .values({
        workspaceId,
        name: "R",
        definition: { type: "ratio", numeratorMetricId: numRow.id, denominatorMetricId: numRow.id, format: "percent" },
      })
      .returning();
    await expect(
      runMetric(
        { type: "ratio", numeratorMetricId: ratioRow.id, denominatorMetricId: numRow.id, format: "percent" },
        workspaceId,
        range,
        "day",
      ),
    ).rejects.toThrow();
  });

  it("rejects hostile definitions before any SQL runs", async () => {
    await expect(
      runMetric(
        def({ source: { connectionIds: "all", eventTypes: ["x'; drop table events; --"] } }),
        workspaceId,
        range,
        "day",
      ),
    ).rejects.toThrow();
    await expect(
      runMetric(
        def({ filters: [{ field: "metadata.a'||'b", op: "equals", value: "x" }] }),
        workspaceId,
        range,
        "day",
      ),
    ).rejects.toThrow();
    // Values (not keys) may contain anything — bound as parameters.
    const safe = await runMetric(
      def({ filters: [{ field: "metadata.campaign", op: "equals", value: "'; drop table events; --" }] }),
      workspaceId,
      range,
      "day",
    );
    expect(safe.total).toBe(0);
  });

  it("picks a readable grain per range", () => {
    expect(grainForRange({ from: new Date("2026-07-01"), to: new Date("2026-07-02") })).toBe("hour");
    expect(grainForRange({ from: new Date("2026-07-01"), to: new Date("2026-07-31") })).toBe("day");
    expect(grainForRange({ from: new Date("2026-01-01"), to: new Date("2026-07-01") })).toBe("week");
  });
});
