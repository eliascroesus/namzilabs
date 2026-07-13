import { and, eq, inArray, lt } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db, schema } from "@/db";
import { getConnector, POLLING_PROVIDERS } from "@/connectors";
import {
  insertRawEvents,
  markRawEventFailed,
  processRawEvent,
  reprocessFailed,
} from "@/lib/ingest";

/**
 * Normalizes one raw event into events rows. Retries with backoff; after the
 * final attempt fails, onFailure marks the raw event failed and flags the
 * connection so the UI surfaces it (never a silent failure).
 */
export const processRawEventFn = inngest.createFunction(
  {
    id: "ingest-process-raw-event",
    retries: 4,
    triggers: [{ event: "ingest/raw_event.received" }],
    onFailure: async ({ event, error }) => {
      const original = event.data.event.data as { rawEventId: string };
      await markRawEventFailed(original.rawEventId, error.message);
    },
  },
  async ({ event, step }) => {
    const { rawEventId } = event.data as { rawEventId: string };
    return step.run("process", () => processRawEvent(rawEventId));
  },
);

/** Recovery path: re-run failed/pending raws for one connection. */
export const reprocessFailedFn = inngest.createFunction(
  { id: "ingest-reprocess-failed", retries: 1, triggers: [{ event: "ingest/reprocess.requested" }] },
  async ({ event, step }) => {
    const { connectionId } = event.data as { connectionId: string };
    return step.run("reprocess", () => reprocessFailed(connectionId));
  },
);

/**
 * Poll fan-out: every 5 minutes, one poll job per active polling connection.
 * (Vercel Hobby cron can't run faster than daily — this is why Inngest owns
 * all scheduling.)
 */
export const pollCronFn = inngest.createFunction(
  { id: "ingest-poll-cron", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const targets = await step.run("find-connections", async () => {
      const rows = await db()
        .select({ id: schema.connections.id })
        .from(schema.connections)
        .where(
          and(
            inArray(schema.connections.provider, POLLING_PROVIDERS),
            eq(schema.connections.status, "active"),
          ),
        );
      return rows.map((r) => r.id);
    });

    if (targets.length > 0) {
      await step.sendEvent(
        "fan-out",
        targets.map((connectionId) => ({
          name: "ingest/poll.connection" as const,
          data: { connectionId },
        })),
      );
    }

    // Safety net: re-drive raw events stuck in 'pending' (e.g. the webhook
    // stored the payload but the queue send failed). Nothing is ever lost.
    const stalePending = await step.run("find-stale-pending", async () => {
      const cutoff = new Date(Date.now() - 10 * 60 * 1000);
      const rows = await db()
        .select({ id: schema.rawEvents.id, connectionId: schema.rawEvents.connectionId })
        .from(schema.rawEvents)
        .where(
          and(
            eq(schema.rawEvents.status, "pending"),
            lt(schema.rawEvents.receivedAt, cutoff),
          ),
        )
        .limit(100);
      return rows;
    });
    if (stalePending.length > 0) {
      await step.sendEvent(
        "sweep-pending",
        stalePending.map((r) => ({
          name: "ingest/raw_event.received" as const,
          data: { rawEventId: r.id, connectionId: r.connectionId },
        })),
      );
    }

    return { polled: targets.length, sweptPending: stalePending.length };
  },
);

/** One poll: fetch new records since cursor, store raws, hand to processor. */
export const pollConnectionFn = inngest.createFunction(
  {
    id: "ingest-poll-connection",
    retries: 2,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "ingest/poll.connection" }],
    onFailure: async ({ event, error }) => {
      const { connectionId } = event.data.event.data as { connectionId: string };
      await db()
        .update(schema.connections)
        .set({ status: "error", errorMessage: `Polling failed: ${error.message.slice(0, 300)}` })
        .where(eq(schema.connections.id, connectionId));
      await db()
        .update(schema.syncState)
        .set({ lastError: error.message.slice(0, 1000) })
        .where(eq(schema.syncState.connectionId, connectionId));
    },
  },
  async ({ event, step }) => {
    const { connectionId } = event.data as { connectionId: string };

    const rawIds = await step.run("poll", async () => {
      const [conn] = await db()
        .select()
        .from(schema.connections)
        .where(eq(schema.connections.id, connectionId));
      if (!conn || conn.status !== "active") return [] as string[];

      const connector = getConnector(conn.provider);
      if (!connector.poll) return [] as string[];
      // Webhooks are the primary path; polling only covers connections
      // where webhook registration wasn't possible (e.g. Instantly plans
      // below Hypergrowth).
      if (connector.registerWebhook && conn.externalWebhookId) return [] as string[];

      const { getFreshAuth } = await import("@/lib/connection-auth");
      const auth = await getFreshAuth(conn);

      const [state] = await db()
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.connectionId, conn.id));
      const cursor = state?.cursor ?? {};

      const { records, nextCursor } = await connector.poll(auth, conn.config, cursor);
      const ids = await insertRawEvents(conn.id, records);

      await db()
        .insert(schema.syncState)
        .values({ connectionId: conn.id, cursor: nextCursor, lastSyncedAt: new Date(), lastError: null })
        .onConflictDoUpdate({
          target: schema.syncState.connectionId,
          set: { cursor: nextCursor, lastSyncedAt: new Date(), lastError: null },
        });
      return ids;
    });

    if (rawIds.length > 0) {
      await step.sendEvent(
        "process",
        rawIds.map((rawEventId) => ({
          name: "ingest/raw_event.received" as const,
          data: { rawEventId, connectionId },
        })),
      );
    }
    return { newRecords: rawIds.length };
  },
);

/**
 * One-shot historical import: pull all past records from the provider's API
 * and feed them through the same idempotent processor. Fired on connect and
 * whenever the user hits "Import history". Safe to re-run (upsert dedupes).
 */
export const backfillConnectionFn = inngest.createFunction(
  {
    id: "ingest-backfill-connection",
    retries: 2,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "ingest/backfill.requested" }],
    onFailure: async ({ event, error }) => {
      const { connectionId } = event.data.event.data as { connectionId: string };
      await db()
        .update(schema.connections)
        .set({ errorMessage: `History import issue: ${error.message.slice(0, 300)}` })
        .where(eq(schema.connections.id, connectionId));
    },
  },
  async ({ event, step }) => {
    const { connectionId } = event.data as { connectionId: string };

    const rawIds = await step.run("fetch-history", async () => {
      const [conn] = await db()
        .select()
        .from(schema.connections)
        .where(eq(schema.connections.id, connectionId));
      if (!conn || conn.status === "deleted") return [] as string[];
      const connector = getConnector(conn.provider);
      if (!connector.backfill || !conn.authData) return [] as string[];

      const { getFreshAuth } = await import("@/lib/connection-auth");
      const auth = await getFreshAuth(conn);
      const records = await connector.backfill(auth, conn.config);
      return insertRawEvents(conn.id, records);
    });

    // Chunk the fan-out so a big history doesn't exceed one event batch.
    for (let i = 0; i < rawIds.length; i += 200) {
      const chunk = rawIds.slice(i, i + 200);
      await step.sendEvent(
        `process-${i}`,
        chunk.map((rawEventId) => ({
          name: "ingest/raw_event.received" as const,
          data: { rawEventId, connectionId },
        })),
      );
    }
    return { imported: rawIds.length };
  },
);

export const ingestFunctions = [
  processRawEventFn,
  reprocessFailedFn,
  pollCronFn,
  pollConnectionFn,
  backfillConnectionFn,
];
