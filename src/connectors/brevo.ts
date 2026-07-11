import { createHash } from "crypto";
import type { Connector, NormalizedEvent, RawRecord } from "@/connectors/types";
import { apiFetch, ConnectorHttpError, parseDate } from "@/connectors/util";

const BASE = "https://api.brevo.com/v3";

function authHeaders(auth: Record<string, unknown>) {
  return { "api-key": auth.apiKey as string };
}

/** Brevo webhook event → our normalized event type. Unknown types are skipped. */
const EVENT_MAP: Record<string, string> = {
  delivered: "email_delivered",
  opened: "email_opened",
  uniqueOpened: "email_opened",
  unique_opened: "email_opened",
  click: "email_clicked",
  hardBounce: "email_bounced",
  hard_bounce: "email_bounced",
  unsubscribed: "email_unsubscribed",
};

/** Events we subscribe to at registration (transactional stream). */
const SUBSCRIBED_EVENTS = ["delivered", "opened", "click", "hardBounce", "unsubscribed"];

/**
 * Brevo (transactional email). Webhooks are available on ALL plans including
 * free. Brevo does not sign webhook payloads — the unguessable 128-bit
 * ingest-URL token is the authentication (same model Brevo's own docs use).
 */
export const brevoConnector: Connector = {
  provider: "brevo",
  authMethod: "api_key",
  label: "Brevo",
  description: "Track email deliveries, opens, clicks, bounces, and unsubscribes.",
  credentialsHelpUrl: "https://app.brevo.com/settings/keys/api",

  async testConnection(auth) {
    try {
      await apiFetch(`${BASE}/account`, { headers: authHeaders(auth) });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConnectorHttpError && (err.status === 401 || err.status === 403)) {
        return { ok: false, error: "Brevo rejected this API key. Create one under Settings → SMTP & API → API keys." };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },

  async fetchSample(auth) {
    try {
      const res = await apiFetch<{ events?: RawRecord[] }>(
        `${BASE}/smtp/statistics/events?limit=3`,
        { headers: authHeaders(auth) },
      );
      return res?.events ?? [];
    } catch {
      // Fresh accounts with no transactional activity 404 here — fine.
      return [];
    }
  },

  async registerWebhook(auth, _config, callbackUrl) {
    const res = await apiFetch<{ id: number }>(`${BASE}/webhooks`, {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({
        url: callbackUrl,
        events: SUBSCRIBED_EVENTS,
        type: "transactional",
        description: "Namzi data sync",
      }),
    });
    return { externalId: String(res.id) };
  },

  async unregisterWebhook(auth, externalId) {
    await apiFetch(`${BASE}/webhooks/${externalId}`, {
      method: "DELETE",
      headers: authHeaders(auth),
    });
  },

  normalize(raw: RawRecord): NormalizedEvent[] {
    const brevoEvent = raw.event as string | undefined;
    const eventType = brevoEvent ? EVENT_MAP[brevoEvent] : undefined;
    if (!eventType) return [];

    // message-id is Brevo's stable per-message identifier; the unique index
    // includes event_type, so one message can have one delivered + one opened
    // etc. Multiple opens of the same message dedupe to the first (unique
    // opens — the number a metric actually wants).
    const messageId =
      (raw["message-id"] as string | undefined) ??
      (raw.message_id as string | undefined) ??
      (raw.id !== undefined ? String(raw.id) : undefined) ??
      createHash("sha256").update(JSON.stringify(raw)).digest("hex");

    const occurredAt =
      parseDate(raw.ts_event) ?? parseDate(raw.ts) ?? parseDate(raw.date) ?? new Date();

    return [
      {
        eventType,
        externalId: messageId,
        occurredAt,
        contactEmail: typeof raw.email === "string" ? raw.email : undefined,
        metadata: {
          subject: typeof raw.subject === "string" ? raw.subject.slice(0, 200) : null,
          tag: raw.tag ?? null,
          link: typeof raw.link === "string" ? raw.link.slice(0, 300) : null,
          brevo_event: brevoEvent,
        },
      },
    ];
  },
};
