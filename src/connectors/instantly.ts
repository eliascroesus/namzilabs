import type { Connector, NormalizedEvent, RawRecord } from "@/connectors/types";
import { apiFetch, ConnectorHttpError, parseDate } from "@/connectors/util";

const BASE = "https://api.instantly.ai/api/v2";

function bearer(auth: Record<string, unknown>) {
  return { authorization: `Bearer ${auth.apiKey as string}` };
}

/** Instantly webhook event types we track (payload names kept 1:1). */
const TRACKED = new Set([
  "email_sent",
  "email_opened",
  "reply_received",
  "lead_interested",
  "lead_meeting_booked",
]);

/**
 * Daily-rollup metrics for the polling fallback (documented endpoint:
 * GET /campaigns/analytics/daily → [{ date, sent, unique_opened, ... }]).
 * Unique variants are used so a rollup approximates per-event semantics.
 */
const DAILY_METRICS: Array<[apiField: string, eventType: string]> = [
  ["sent", "email_sent_daily"],
  ["unique_opened", "email_opened_daily"],
  ["unique_replies", "reply_received_daily"],
  ["unique_clicks", "email_clicked_daily"],
];

/** Yesterday in UTC (YYYY-MM-DD) — the newest FINALIZED analytics day. */
function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Instantly (API v2, Bearer key). Primary path: one webhook subscribed to
 * all_events; normalize() filters to the tracked set. Instantly webhooks
 * require the customer's plan to be Hypergrowth or higher — when
 * registration fails, the connection falls back to POLLING the documented
 * daily campaign analytics endpoint.
 *
 * Fallback semantics (deliberate): only FINALIZED days (yesterday and
 * earlier, UTC) are emitted, as one event per (day, metric) with the count
 * in `amount` and event types suffixed `_daily`. Finalized-only keeps the
 * DO-NOTHING idempotent upsert correct (a day's count never changes after
 * emission); the suffix keeps rollups from being mistaken for per-event
 * rows in metrics (count the rollups via sum(amount), not count(*)).
 */
export const instantlyConnector: Connector = {
  provider: "instantly",
  authMethod: "api_key",
  label: "Instantly",
  description: "Track cold-email sends, opens, replies, and booked meetings.",
  credentialsHelpUrl: "https://app.instantly.ai/app/settings/integrations",
  producedEventTypes: ["email_sent", "email_opened", "reply_received", "lead_interested", "lead_meeting_booked", "email_sent_daily", "email_opened_daily", "reply_received_daily", "email_clicked_daily"],
  metadataFields: ["campaign_name", "campaign_id", "email_account", "date", "scope"],

  async testConnection(auth) {
    try {
      await apiFetch(`${BASE}/campaigns?limit=1`, { headers: bearer(auth) });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConnectorHttpError && (err.status === 401 || err.status === 403)) {
        return { ok: false, error: "Instantly rejected this API key. Create one under Settings → Integrations → API." };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },

  async fetchSample(auth) {
    const res = await apiFetch<{ items?: RawRecord[] }>(`${BASE}/campaigns?limit=3`, {
      headers: bearer(auth),
    });
    return res?.items ?? [];
  },

  async registerWebhook(auth, _config, callbackUrl) {
    try {
      const res = await apiFetch<{ id: string }>(`${BASE}/webhooks`, {
        method: "POST",
        headers: bearer(auth),
        body: JSON.stringify({
          target_hook_url: callbackUrl,
          event_type: "all_events",
          name: "Namzi data sync",
        }),
      });
      return { externalId: String(res.id) };
    } catch (err) {
      if (err instanceof ConnectorHttpError && [402, 403].includes(err.status)) {
        throw new Error(
          "Instantly only allows webhooks on the Hypergrowth plan or higher. Upgrade the Instantly workspace, then try connecting again.",
        );
      }
      throw err;
    }
  },

  async unregisterWebhook(auth, externalId) {
    await apiFetch(`${BASE}/webhooks/${externalId}`, {
      method: "DELETE",
      headers: bearer(auth),
    });
  },

  async poll(auth, _config, cursor) {
    const yesterday = yesterdayUtc();
    const last = typeof cursor.lastFinalizedDate === "string" ? cursor.lastFinalizedDate : null;

    // First poll (at connect): snapshot the cursor so history doesn't flood
    // in — only days completed after connecting produce events.
    if (!last) return { records: [], nextCursor: { lastFinalizedDate: yesterday } };
    if (last >= yesterday) return { records: [], nextCursor: cursor };

    const startDate = new Date(new Date(`${last}T00:00:00Z`).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const res = await apiFetch<unknown>(
      `${BASE}/campaigns/analytics/daily?start_date=${startDate}&end_date=${yesterday}`,
      { headers: bearer(auth) },
    );
    const days = Array.isArray(res)
      ? (res as Record<string, unknown>[])
      : ((res as { items?: Record<string, unknown>[] })?.items ?? []);

    const records: RawRecord[] = [];
    for (const day of days) {
      const date = day.date as string | undefined;
      if (!date || date > yesterday) continue; // never emit a still-changing day
      for (const [apiField, eventType] of DAILY_METRICS) {
        const count = day[apiField];
        if (typeof count === "number" && count > 0) {
          records.push({ kind: "daily_analytics", date, metric: eventType, count });
        }
      }
    }
    return { records, nextCursor: { lastFinalizedDate: yesterday } };
  },

  normalize(raw: RawRecord): NormalizedEvent[] {
    // Polling-fallback rollups (see connector doc comment).
    if (raw.kind === "daily_analytics") {
      const date = raw.date as string;
      const metric = raw.metric as string;
      const count = raw.count as number;
      if (!date || !metric || typeof count !== "number") return [];
      return [
        {
          eventType: metric,
          externalId: `daily:${date}:${metric}`,
          // Noon UTC keeps the event on the right calendar day in most zones.
          occurredAt: new Date(`${date}T12:00:00Z`),
          amount: String(count),
          metadata: { scope: "all_campaigns", date, daily_rollup: true },
        },
      ];
    }

    const eventType = raw.event_type as string | undefined;
    if (!eventType || !TRACKED.has(eventType)) return [];

    const occurredAt = parseDate(raw.timestamp) ?? new Date();
    const leadEmail = typeof raw.lead_email === "string" ? raw.lead_email : undefined;
    const campaignId = raw.campaign_id ?? raw.campaign ?? "";

    // Instantly webhook payloads carry no per-event ID. The idempotency key
    // is built from provider-supplied identity fields (event type, campaign,
    // lead, provider timestamp) so retried deliveries of the same payload
    // dedupe. This is provider data, not local time.
    const externalId = `${eventType}:${campaignId}:${leadEmail ?? "unknown"}:${raw.timestamp ?? ""}`;

    return [
      {
        eventType,
        externalId,
        occurredAt,
        contactEmail: leadEmail,
        metadata: {
          campaign_name: raw.campaign_name ?? null,
          campaign_id: campaignId || null,
          email_account: raw.email_account ?? null,
        },
      },
    ];
  },
};
