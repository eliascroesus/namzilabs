import { createHmac, timingSafeEqual } from "crypto";
import type { Connector, NormalizedEvent, RawRecord } from "@/connectors/types";
import { apiFetch, ConnectorHttpError, parseDate } from "@/connectors/util";

const BASE = "https://api.close.com/api/v1";

function authHeaders(auth: Record<string, unknown>) {
  const key = Buffer.from(`${auth.apiKey as string}:`).toString("base64");
  return { authorization: `Basic ${key}` };
}

/** Close event-log entries we subscribe to and how they map to event types. */
const SUBSCRIBED = [
  { object_type: "lead", action: "created" },
  { object_type: "opportunity", action: "created" },
  { object_type: "opportunity", action: "updated" },
  { object_type: "activity.call", action: "created" },
  { object_type: "activity.sms", action: "created" },
  { object_type: "activity.email", action: "created" },
];

/** Close serializes UTC datetimes without a timezone suffix — pin them to UTC. */
function closeDate(value: unknown): Date | null {
  if (typeof value !== "string") return parseDate(value);
  const pinned = /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  return parseDate(pinned);
}

/**
 * Close CRM. Webhook Subscriptions API delivers event-log entries; each has
 * a globally unique event id (`ev_...`) — ideal idempotency key.
 * Signature: `close-sig-hash` = HMAC-SHA256(hex-decoded signature_key,
 * close-sig-timestamp + rawBody), hex-encoded.
 */
export const closeConnector: Connector = {
  provider: "close",
  authMethod: "api_key",
  label: "Close CRM",
  description: "Track new leads, opportunity changes, and logged calls, SMS, and emails.",
  credentialsHelpUrl: "https://app.close.com/settings/developer/api-keys/",

  async testConnection(auth) {
    try {
      await apiFetch(`${BASE}/me/`, { headers: authHeaders(auth) });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConnectorHttpError && err.status === 401) {
        return { ok: false, error: "Close rejected this API key. Create one under Settings → Developer → API Keys." };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },

  async fetchSample(auth) {
    const res = await apiFetch<{ data?: RawRecord[] }>(`${BASE}/event/?_limit=3`, {
      headers: authHeaders(auth),
    });
    return res?.data ?? [];
  },

  async registerWebhook(auth, _config, callbackUrl) {
    const res = await apiFetch<{ id: string; signature_key: string }>(`${BASE}/webhook/`, {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({ url: callbackUrl, events: SUBSCRIBED }),
    });
    return { externalId: res.id, secret: res.signature_key };
  },

  async unregisterWebhook(auth, externalId) {
    await apiFetch(`${BASE}/webhook/${externalId}/`, {
      method: "DELETE",
      headers: authHeaders(auth),
    });
  },

  verifyRequest({ headers, rawBody }, conn) {
    if (!conn.webhookSecret) return false;
    const hash = headers.get("close-sig-hash");
    const timestamp = headers.get("close-sig-timestamp");
    if (!hash || !timestamp) return false;
    // Close's signature_key is hex — the HMAC key is its decoded bytes.
    const expected = createHmac("sha256", Buffer.from(conn.webhookSecret, "hex"))
      .update(timestamp + rawBody, "utf8")
      .digest("hex");
    const a = Buffer.from(hash, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  },

  normalize(raw: RawRecord): NormalizedEvent[] {
    const event = raw.event as Record<string, unknown> | undefined;
    if (!event || typeof event.id !== "string") return [];

    const objectType = event.object_type as string;
    const action = event.action as string;
    const data = (event.data ?? {}) as Record<string, unknown>;
    const changed = (event.changed_fields ?? []) as string[];
    const occurredAt = closeDate(event.date_created) ?? new Date();

    const base = { externalId: event.id, occurredAt };

    if (objectType === "lead" && action === "created") {
      return [
        {
          ...base,
          eventType: "lead_created",
          metadata: {
            lead_name: data.display_name ?? data.name ?? null,
            status: data.status_label ?? null,
          },
        },
      ];
    }

    if (objectType === "opportunity") {
      // Close opportunity `value` is in cents.
      const amount =
        typeof data.value === "number" ? String(data.value / 100) : undefined;
      const metadata = {
        status: data.status_label ?? null,
        pipeline: data.pipeline_name ?? null,
        lead_name: data.lead_name ?? null,
        value_period: data.value_period ?? null,
      };
      if (action === "created") {
        return [{ ...base, eventType: "opportunity_created", amount, metadata }];
      }
      if (action === "updated" && (changed.includes("status_id") || changed.includes("status_label"))) {
        return [
          {
            ...base,
            eventType: "opportunity_status_changed",
            amount,
            metadata: { ...metadata, status_type: data.status_type ?? null },
          },
        ];
      }
      return []; // other opportunity updates aren't tracked
    }

    if (objectType === "activity.call" && action === "created") {
      return [
        {
          ...base,
          eventType: "call_logged",
          metadata: {
            direction: data.direction ?? null,
            duration: data.duration ?? null,
            disposition: data.disposition ?? null,
          },
        },
      ];
    }

    if (objectType === "activity.sms" && action === "created") {
      const direction = data.direction === "inbound" ? "sms_received" : "sms_sent";
      return [
        { ...base, eventType: direction, metadata: { direction: data.direction ?? null } },
      ];
    }

    if (objectType === "activity.email" && action === "created") {
      const direction = data.direction === "incoming" ? "email_received" : "email_sent";
      return [
        {
          ...base,
          eventType: direction,
          contactEmail: Array.isArray(data.to) && typeof data.to[0] === "string" ? data.to[0] : undefined,
          metadata: {
            subject: typeof data.subject === "string" ? data.subject.slice(0, 200) : null,
            direction: data.direction ?? null,
          },
        },
      ];
    }

    return [];
  },
};
