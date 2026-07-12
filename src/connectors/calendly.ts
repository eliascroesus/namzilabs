import { randomBytes } from "crypto";
import type { Connector, NormalizedEvent, RawRecord } from "@/connectors/types";
import { apiFetch, ConnectorHttpError, hmacSha256Hex, parseDate, safeEqual } from "@/connectors/util";

const BASE = "https://api.calendly.com";
/**
 * Reject signatures older than this. Generous on purpose: Calendly retries
 * failed deliveries for a long time, and replays are harmless here anyway —
 * the idempotent upsert dedupes any repeated payload. The signature's real
 * job is preventing forgery, which this fully preserves.
 */
const SIGNATURE_TOLERANCE_SECONDS = 24 * 60 * 60;

type CalendlyMe = {
  resource: { uri: string; current_organization: string; name: string };
};

function authHeaders(auth: Record<string, unknown>) {
  return { authorization: `Bearer ${auth.apiKey as string}` };
}

/**
 * Calendly (API v2, Personal Access Token).
 * Webhooks: invitee.created / invitee.canceled → booking_created / booking_canceled.
 * Signature: `Calendly-Webhook-Signature: t=...,v1=HMAC_SHA256(signing_key, t + "." + body)`.
 * NOTE: webhook subscriptions require a paid Calendly plan — a 403 at
 * registration is surfaced as a human-readable plan message.
 */
export const calendlyConnector: Connector = {
  provider: "calendly",
  authMethod: "api_key",
  label: "Calendly",
  description: "Track bookings and cancellations the moment they happen.",
  credentialsHelpUrl: "https://calendly.com/integrations/api_webhooks",
  producedEventTypes: ["booking_created", "booking_canceled"],
  metadataFields: ["event_name", "start_time", "end_time", "status", "rescheduled", "utm_source", "utm_medium", "utm_campaign"],

  async testConnection(auth) {
    try {
      await apiFetch<CalendlyMe>(`${BASE}/users/me`, { headers: authHeaders(auth) });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConnectorHttpError && err.status === 401) {
        return { ok: false, error: "Calendly rejected this token. Check that you copied the full Personal Access Token." };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },

  async fetchSample(auth) {
    const me = await apiFetch<CalendlyMe>(`${BASE}/users/me`, { headers: authHeaders(auth) });
    const events = await apiFetch<{ collection: RawRecord[] }>(
      `${BASE}/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&sort=start_time:desc&count=3`,
      { headers: authHeaders(auth) },
    );
    return events.collection ?? [];
  },

  async registerWebhook(auth, config, callbackUrl) {
    const me = await apiFetch<CalendlyMe>(`${BASE}/users/me`, { headers: authHeaders(auth) });
    const signingKey = randomBytes(32).toString("hex");
    const events = (config.events as string[] | undefined) ?? ["invitee.created", "invitee.canceled"];
    try {
      const res = await apiFetch<{ resource: { uri: string } }>(`${BASE}/webhook_subscriptions`, {
        method: "POST",
        headers: authHeaders(auth),
        body: JSON.stringify({
          url: callbackUrl,
          events,
          organization: me.resource.current_organization,
          user: me.resource.uri,
          scope: "user",
          signing_key: signingKey,
        }),
      });
      return { externalId: res.resource.uri, secret: signingKey };
    } catch (err) {
      if (err instanceof ConnectorHttpError && (err.status === 403 || err.status === 402)) {
        throw new Error(
          "Calendly only allows webhooks on paid plans (Standard and up). Upgrade the Calendly account, then try connecting again.",
        );
      }
      throw err;
    }
  },

  async unregisterWebhook(auth, externalId) {
    // externalId is the full subscription URI returned by Calendly.
    await apiFetch(externalId, { method: "DELETE", headers: authHeaders(auth) });
  },

  verifyRequest({ headers, rawBody }, conn) {
    if (!conn.webhookSecret) return false;
    const header = headers.get("calendly-webhook-signature");
    if (!header) return false;
    const parts = Object.fromEntries(
      header.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]),
    );
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) return false;
    const age = Math.abs(Date.now() / 1000 - Number(t));
    if (!isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;
    return safeEqual(v1, hmacSha256Hex(conn.webhookSecret, `${t}.${rawBody}`));
  },

  normalize(raw: RawRecord): NormalizedEvent[] {
    const eventName = raw.event as string | undefined;
    const map: Record<string, string> = {
      "invitee.created": "booking_created",
      "invitee.canceled": "booking_canceled",
    };
    const eventType = eventName ? map[eventName] : undefined;
    if (!eventType) return [];

    const payload = (raw.payload ?? {}) as Record<string, unknown>;
    const scheduledEvent = (payload.scheduled_event ?? {}) as Record<string, unknown>;
    const tracking = (payload.tracking ?? {}) as Record<string, unknown>;

    const inviteeUri = payload.uri as string | undefined;
    if (!inviteeUri) return [];

    const occurredAt =
      parseDate(raw.created_at) ?? parseDate(scheduledEvent.start_time) ?? new Date();

    return [
      {
        eventType,
        externalId: inviteeUri,
        occurredAt,
        contactEmail: typeof payload.email === "string" ? payload.email : undefined,
        contactName: typeof payload.name === "string" ? payload.name : undefined,
        metadata: {
          event_name: scheduledEvent.name,
          start_time: scheduledEvent.start_time,
          end_time: scheduledEvent.end_time,
          status: payload.status,
          rescheduled: payload.rescheduled ?? false,
          utm_source: tracking.utm_source ?? null,
          utm_medium: tracking.utm_medium ?? null,
          utm_campaign: tracking.utm_campaign ?? null,
        },
      },
    ];
  },
};
