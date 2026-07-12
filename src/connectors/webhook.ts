import { createHash } from "crypto";
import type { Connector, ConnectionCtx, NormalizedEvent, RawRecord } from "@/connectors/types";
import { getPath, parseAmount, parseDate, safeEqual } from "@/connectors/util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Common places tools put an identifier, checked in order. */
const ID_CANDIDATES = ["id", "event_id", "uuid", "message_id", "messageId"];

function detectEmail(raw: RawRecord): string | undefined {
  for (const key of ["email", "contact_email", "user_email", "customer_email"]) {
    const v = raw[key];
    if (typeof v === "string" && EMAIL_RE.test(v)) return v;
  }
  return undefined;
}

/** Top-level scalars make useful metric filters; cap size to keep rows lean. */
function scalarMetadata(raw: RawRecord, max = 10): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= max) break;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = typeof v === "string" ? v.slice(0, 200) : v;
      n++;
    }
  }
  return out;
}

/**
 * Generic inbound webhook — the universal escape hatch and the internal
 * testing tool for the whole pipeline.
 *
 * config: { eventType?, idPath?, occurredAtPath?, emailPath?, namePath?, amountPath? }
 * Optional shared secret (authData.webhookSecret) is checked against the
 * `x-namzi-secret` header.
 */
export const webhookConnector: Connector = {
  provider: "webhook",
  authMethod: "none",
  label: "Webhook",
  description: "Receive events from any tool that can send an HTTP webhook.",
  producedEventTypes: [], // derived from config.eventType at read time

  async testConnection() {
    return { ok: true };
  },

  // The wizard shows the URL and live-polls received raw events instead.
  async fetchSample() {
    return [];
  },

  verifyRequest({ headers }, conn) {
    if (!conn.webhookSecret) return true;
    const provided = headers.get("x-namzi-secret");
    return provided !== null && safeEqual(provided, conn.webhookSecret);
  },

  normalize(raw: RawRecord, conn: ConnectionCtx): NormalizedEvent[] {
    const cfg = conn.config as {
      eventType?: string;
      idPath?: string;
      occurredAtPath?: string;
      emailPath?: string;
      namePath?: string;
      amountPath?: string;
    };

    // Idempotency key: the sender's own ID when available; otherwise a
    // content hash — identical retried deliveries dedupe, distinct payloads
    // always differ.
    let externalId: string | undefined;
    if (cfg.idPath) {
      const v = getPath(raw, cfg.idPath);
      if (typeof v === "string" || typeof v === "number") externalId = String(v);
    }
    if (!externalId) {
      for (const key of ID_CANDIDATES) {
        const v = raw[key];
        if (typeof v === "string" || typeof v === "number") {
          externalId = String(v);
          break;
        }
      }
    }
    if (!externalId) {
      externalId = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
    }

    const occurredAt =
      (cfg.occurredAtPath ? parseDate(getPath(raw, cfg.occurredAtPath)) : null) ??
      parseDate(raw.timestamp) ??
      parseDate(raw.created_at) ??
      new Date();

    const email = cfg.emailPath
      ? (() => {
          const v = getPath(raw, cfg.emailPath!);
          return typeof v === "string" && EMAIL_RE.test(v) ? v : undefined;
        })()
      : detectEmail(raw);

    const name = cfg.namePath ? getPath(raw, cfg.namePath) : raw.name;
    const amount = cfg.amountPath ? parseAmount(getPath(raw, cfg.amountPath)) : undefined;

    return [
      {
        eventType: cfg.eventType?.trim() || "webhook_event",
        externalId,
        occurredAt,
        contactEmail: email,
        contactName: typeof name === "string" ? name.slice(0, 200) : undefined,
        amount,
        metadata: scalarMetadata(raw),
      },
    ];
  },
};
