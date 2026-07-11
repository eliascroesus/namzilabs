# Plan 2 of 3 — Integration Engine (Connectors & Ingestion)

> **How to use this file:** paste it as the prompt for a build session after Plan 1 is deployed and accepted. Read `docs/BUILD_PLAN.md` for locked decisions. This plan is the product's foundation-of-trust: **reliability beats features everywhere in this plan.**

## Context

Plan 1 delivered the app shell, auth/workspaces, the full DB schema (`connections`, `raw_events`, `events`, `sync_state`), encrypted credential storage, and the Inngest job spine. This plan builds the connector framework and all six integrations so that real external data flows into the normalized `events` table, idempotently, with visible health status. The metric builder and dashboard come in Plan 3 — here the only UI is the Integrations section.

**Use only the real, documented APIs listed at the bottom of `docs/BUILD_PLAN.md`. If a needed endpoint isn't in the provider's docs, stop and flag it — do not invent one.**

## Milestone 2.1 — Connector framework

One TypeScript interface every integration implements (`src/connectors/types.ts`):

```ts
interface Connector {
  provider: Provider;
  authMethod: 'api_key' | 'oauth' | 'none';        // 'none' = generic inbound webhook
  // Setup-time
  testConnection(auth: AuthData, config: Config): Promise<{ ok: boolean; error?: string }>;
  fetchSample(auth: AuthData, config: Config): Promise<RawRecord[]>;  // latest 2–3 real records for the wizard preview
  // Ingestion
  registerWebhook?(auth: AuthData, config: Config, callbackUrl: string): Promise<{ externalId: string; secret?: string }>;
  unregisterWebhook?(auth: AuthData, externalId: string): Promise<void>;
  verifyRequest?(req: { headers: Headers; rawBody: string }, conn: Connection): boolean;  // provider signature check
  poll?(auth: AuthData, config: Config, cursor: Cursor): Promise<{ records: RawRecord[]; nextCursor: Cursor }>;
  // Normalization — pure function, unit-tested against real captured payloads
  normalize(raw: RawRecord, conn: Connection): NormalizedEvent[];
}
```

`NormalizedEvent` maps 1:1 to the `events` table: `{ event_type, external_id, occurred_at, contact_email?, contact_name?, amount?, metadata }`. Rules:
- `external_id` must be the provider's stable ID for the underlying object (invitee URI, message ID, event-log ID, row fingerprint). Never a timestamp or random value — it is the idempotency key.
- `metadata` keeps only fields useful for filtering in the metric builder (campaign name, event type name, status, UTM fields) — not the whole payload. Keep rows lean; the full payload lives in `raw_events`.

## Milestone 2.2 — Ingestion pipeline (build once, all connectors share it)

**Inbound webhook route** `POST /api/ingest/[webhookToken]` (the per-connection unique token from Plan 1):
1. Look up connection by token (constant-time compare); unknown → 404.
2. If the connector has `verifyRequest`, verify the provider signature against the raw body; fail → 401 and increment a rejected counter. Never process unverified payloads.
3. Insert into `raw_events` (`status='pending'`), send Inngest event `ingest/raw_event.received`, return `200` — total under 1 second, no parsing beyond JSON.

**Inngest processor** `ingest/process-raw-event`:
1. Load raw event → run connector `normalize()` → upsert into `events` with `ON CONFLICT (connection_id, event_type, external_id) DO NOTHING`.
2. Mark raw event `processed` (or `skipped` for event types we don't track), update `connections.last_event_at`.
3. On error: Inngest retries with backoff (4 attempts); final failure marks raw event `failed` with the error and sets connection status `error`. Failed raws stay queryable for reprocessing.
4. Add Inngest function `ingest/reprocess-failed` (manually triggerable per connection) that re-runs normalization on `failed`/`pending` raws — the recovery path after a normalize bug fix.

**Polling loop** (for Google Sheets + Instantly fallback): Inngest cron every 5 minutes fans out one job per active polling connection (concurrency-limited). Each job: `poll(auth, config, cursor)` → insert results as `raw_events` → same processor as webhooks → save `nextCursor` in `sync_state`. One shared code path; polls are idempotent by design because of the upsert.

**Acceptance for 2.1+2.2:** unit tests cover the crypto/token lookup, signature rejection, idempotent double-delivery (send the same payload twice → one `events` row), and failed→reprocess recovery.

## Milestone 2.3 — The six connectors

Ship in this order (each one fully working, with `normalize()` unit-tested against real captured payloads, before starting the next):

1. **Generic Webhook** (`authMethod: 'none'`) — the universal escape hatch. User gets a unique URL + optional shared-secret header check. Config lets the user name the `event_type` and map JSON paths to `occurred_at`/`contact_email`/`amount` (with sensible defaults: body received-time, autodetected `email` field). This connector also becomes the internal testing tool for the whole pipeline.
2. **Calendly** — API key (Personal Access Token) auth in v1 (OAuth app later). `testConnection`: `GET /users/me`. `fetchSample`: list recent scheduled events. `registerWebhook`: create webhook subscription for `invitee.created` + `invitee.canceled` at org/user scope; store the signing key; `verifyRequest` checks the `Calendly-Webhook-Signature` header. Event types produced: `booking_created`, `booking_canceled`. **Note in the UI:** Calendly webhooks require the customer to be on a paid Calendly plan — detect the 403 on subscription creation and show a human message.
3. **Brevo** — API key auth. `registerWebhook` via Brevo's webhooks API for transactional events (`delivered`, `opened`, `click`, `hardBounce`, `unsubscribed`) and marketing events; available on all Brevo plans. Event types: `email_delivered`, `email_opened`, `email_clicked`, `email_bounced`, `email_unsubscribed`.
4. **Close CRM** — API key auth. `registerWebhook` via Webhook Subscriptions API filtered to: lead created, opportunity created/updated (status changes, `amount` → our `amount` column), activity call/sms/email logged. `verifyRequest` per Close's signature docs. `fetchSample` from the Event Log API. Event types: `lead_created`, `opportunity_created`, `opportunity_status_changed`, `call_logged`, `sms_sent`, `email_sent`.
5. **Google Sheets** — OAuth (the existing namzilabs.co Google client) requesting `spreadsheets.readonly` + `drive.metadata.readonly` scopes, refresh token stored encrypted. Config: spreadsheet picker → sheet/tab → header row confirmation → which column is the timestamp (optional). Ingestion is **polling only** (no webhooks exist for Sheets; Drive push channels expire and batch ~3 min — not worth the complexity in v1): the 5-min cron reads the sheet, computes a stable per-row fingerprint (hash of row values + row index strategy documented in code), and emits `row_added` events for new fingerprints. Cursor = set of known fingerprints (or last-row-count + hash chain — pick one, document why).
6. **Instantly** — API key (v2, Bearer) auth. Primary: `registerWebhook` for `email_sent`, `email_opened`, `reply_received`, `lead_interested`, `lead_meeting_booked` (requires customer's Instantly plan ≥ Hypergrowth — detect failure, show human message and fall back). Fallback: `poll` campaign analytics via API v2. Event types mirror the webhook names.

## Milestone 2.4 — Integrations UI (the Zapier feel starts here)

1. **Catalog page:** grid of 6 provider cards (logo, name, one-line description, Connect button).
2. **Connect wizard** (shared stepper from Plan 1): ① credentials (API key field with provider-specific help link, or Google OAuth button, or "here's your URL" for generic webhook) → ② `testConnection` with instant feedback → ③ provider-specific config (Calendly: which event types; Sheets: spreadsheet picker; etc.) → ④ **live preview: `fetchSample` renders the user's real latest 2–3 records** → ⑤ name it & finish (webhook registration happens here).
3. **Connection detail page:** status badge (active/error/paused), last event received, 7-day sparkline of event counts, table of the 50 latest events, error banner with the actual message + "Retry/Reprocess" button, pause/resume, delete (unregisters the webhook remotely, keeps historical events, confirm dialog).
4. **Health surfacing:** a connection with no events for 48h shows a "quiet" hint; `error` status shows on the catalog page too. Never a silent failure.

**Acceptance for the whole plan (test each on production):** connect a real account of each provider; trigger a real action (book a Calendly meeting, send a Brevo email, add a Sheet row, create a Close lead, fire the generic webhook with `curl`); the event appears in the connection detail within 1 min (webhooks) / 6 min (polling); duplicate webhook delivery creates no duplicate event; an invalid signature is rejected; deleting a connection removes the remote webhook.

## Guardrails

- No metric or dashboard code — Plan 3.
- Never log payload bodies or credentials; log IDs and statuses.
- Raw events get a retention policy stub (config constant, e.g. 30 days) — enforcement can be a later Inngest cron, but the constant and comment exist now.
- Update `PROJECT_STATE.md` before finishing.
