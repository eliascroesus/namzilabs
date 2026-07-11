import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getConnector } from "@/connectors";
import type { ConnectionCtx, RawRecord } from "@/connectors/types";

/** Headers worth keeping on a raw event (signature debugging). Nothing else. */
const KEPT_HEADERS = [
  "content-type",
  "user-agent",
  "calendly-webhook-signature",
  "close-sig-hash",
  "close-sig-timestamp",
];

export function pickHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const v = headers.get(name);
    if (v) out[name] = v;
  }
  return out;
}

/** Store raw records (from a webhook body or a poll) as pending raw_events. */
export async function insertRawEvents(
  connectionId: string,
  records: RawRecord[],
  headers?: Record<string, string>,
): Promise<string[]> {
  if (records.length === 0) return [];
  const rows = await db()
    .insert(schema.rawEvents)
    .values(records.map((payload) => ({ connectionId, payload, headers })))
    .returning({ id: schema.rawEvents.id });
  return rows.map((r) => r.id);
}

export type ProcessResult = {
  status: "processed" | "skipped";
  inserted: number;
};

/**
 * Normalize one raw event into events rows. Idempotent: the unique index on
 * (connection_id, event_type, external_id) makes duplicate deliveries no-ops.
 * Throws on failure so the caller (Inngest) can retry with backoff.
 */
export async function processRawEvent(rawEventId: string): Promise<ProcessResult> {
  const [raw] = await db()
    .select()
    .from(schema.rawEvents)
    .where(eq(schema.rawEvents.id, rawEventId));
  if (!raw) throw new Error(`raw_event ${rawEventId} not found`);
  if (raw.status === "processed") return { status: "processed", inserted: 0 };

  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.id, raw.connectionId));
  if (!conn) throw new Error(`connection ${raw.connectionId} not found`);

  const connector = getConnector(conn.provider);
  const ctx: ConnectionCtx = {
    id: conn.id,
    provider: conn.provider,
    config: conn.config,
    webhookToken: conn.webhookToken,
  };

  const normalized = connector.normalize(raw.payload as RawRecord, ctx);

  let inserted = 0;
  if (normalized.length > 0) {
    const rows = await db()
      .insert(schema.events)
      .values(
        normalized.map((n) => ({
          workspaceId: conn.workspaceId,
          connectionId: conn.id,
          provider: conn.provider,
          eventType: n.eventType,
          externalId: n.externalId,
          occurredAt: n.occurredAt,
          contactEmail: n.contactEmail ?? null,
          contactName: n.contactName ?? null,
          amount: n.amount ?? null,
          metadata: n.metadata,
        })),
      )
      .onConflictDoNothing({
        target: [schema.events.connectionId, schema.events.eventType, schema.events.externalId],
      })
      .returning({ id: schema.events.id });
    inserted = rows.length;
  }

  const status = normalized.length === 0 ? "skipped" : "processed";
  await db()
    .update(schema.rawEvents)
    .set({ status, processedAt: new Date(), error: null })
    .where(eq(schema.rawEvents.id, rawEventId));

  // A successful run is proof the connection works: refresh health fields.
  await db()
    .update(schema.connections)
    .set({
      lastEventAt: new Date(),
      ...(conn.status === "error" ? { status: "active" as const, errorMessage: null } : {}),
    })
    .where(eq(schema.connections.id, conn.id));

  return { status, inserted };
}

/** Terminal-failure bookkeeping (called after Inngest exhausts retries). */
export async function markRawEventFailed(rawEventId: string, message: string): Promise<void> {
  const [raw] = await db()
    .select({ connectionId: schema.rawEvents.connectionId })
    .from(schema.rawEvents)
    .where(eq(schema.rawEvents.id, rawEventId));
  if (!raw) return;
  await db()
    .update(schema.rawEvents)
    .set({ status: "failed", error: message.slice(0, 1000), processedAt: new Date() })
    .where(eq(schema.rawEvents.id, rawEventId));
  await db()
    .update(schema.connections)
    .set({ status: "error", errorMessage: `Event processing failed: ${message.slice(0, 300)}` })
    .where(eq(schema.connections.id, raw.connectionId));
}

/**
 * Recovery path after a normalize bug fix: re-run failed/pending raws for a
 * connection. Returns per-status counts.
 */
export async function reprocessFailed(connectionId: string, limit = 200) {
  const raws = await db()
    .select({ id: schema.rawEvents.id })
    .from(schema.rawEvents)
    .where(
      and(
        eq(schema.rawEvents.connectionId, connectionId),
        inArray(schema.rawEvents.status, ["failed", "pending"]),
      ),
    )
    .limit(limit);

  let ok = 0;
  let failed = 0;
  for (const { id } of raws) {
    try {
      await processRawEvent(id);
      ok++;
    } catch (err) {
      await markRawEventFailed(id, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }
  if (failed === 0 && ok > 0) {
    await db()
      .update(schema.connections)
      .set({ status: "active", errorMessage: null })
      .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.status, "error")));
  }
  return { attempted: raws.length, ok, failed };
}

export async function incrementRejectedCount(connectionId: string): Promise<void> {
  await db()
    .update(schema.connections)
    .set({ rejectedCount: sql`${schema.connections.rejectedCount} + 1` })
    .where(eq(schema.connections.id, connectionId));
}
