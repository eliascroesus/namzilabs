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
 * Instantly (API v2, Bearer key). One webhook subscribed to all_events;
 * normalize() filters to the tracked set. Instantly webhooks require the
 * customer's plan to be Hypergrowth or higher — registration failures are
 * surfaced as a human plan message.
 *
 * NOTE: the plan's polling fallback for lower Instantly plans is
 * deliberately NOT implemented yet — the analytics endpoints return
 * aggregates, not per-event records, and per-email listing semantics
 * couldn't be verified against the docs from this build environment.
 * Flagged in PROJECT_STATE.md rather than built on guessed endpoints.
 */
export const instantlyConnector: Connector = {
  provider: "instantly",
  authMethod: "api_key",
  label: "Instantly",
  description: "Track cold-email sends, opens, replies, and booked meetings.",
  credentialsHelpUrl: "https://app.instantly.ai/app/settings/integrations",

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

  normalize(raw: RawRecord): NormalizedEvent[] {
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
