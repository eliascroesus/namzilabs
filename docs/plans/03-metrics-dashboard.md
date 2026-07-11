# Plan 3 of 3 — Metric Builder & Unified Dashboard

> **How to use this file:** paste it as the prompt for a build session after Plan 2 is deployed and accepted (real events flowing from real providers). Read `docs/BUILD_PLAN.md` for locked decisions. This plan is where the product becomes valuable — and where **UX simplicity is the whole game.** Every screen must pass the test: *could a non-technical founder use this without documentation?*

## Context

Plans 1–2 delivered: app shell, auth/workspaces, six working connectors, and a normalized `events` table filling with real data (`provider`, `event_type`, `occurred_at`, `contact_email`, `amount`, `metadata`). This plan builds: the visual metric builder, the unified live dashboard, and goals/KPIs. Schema already exists (`metrics.definition` jsonb, `dashboards`, `dashboard_widgets`, `goals`).

## Milestone 3.1 — Metric definition model & query engine

A metric is a **declarative JSON definition**, validated by Zod, compiled to one SQL query over `events`. No stored results, no pipelines — compute at read time (fast at this scale with the Plan 1 indexes), cache per-request.

```ts
type MetricDefinition = {
  source: { connectionIds: string[] | 'all'; eventTypes: string[] };   // e.g. all Calendly connections, 'booking_created'
  filters: Filter[];          // AND of: { field, op, value }
                              // field: 'contact_email' | 'provider' | 'metadata.<key>'
                              // op: 'equals' | 'not_equals' | 'contains' | 'exists' | 'gt' | 'lt'
  aggregation:
    | { type: 'count' }
    | { type: 'unique_count'; field: 'contact_email' | 'external_id' }
    | { type: 'sum' | 'average'; field: 'amount' | `metadata.${string}` };
};
```

Build `runMetric(def, workspaceId, range, grain)` in `src/lib/metrics/engine.ts`:
- Returns `{ total, series: [{ bucket, value }] }` using `date_trunc(grain, occurred_at)` buckets.
- **Every query is parameterized and workspace-scoped.** `metadata` access via `->>` only on whitelisted, Zod-validated keys — the definition can never inject SQL.
- Unit-test the compiler: each aggregation type, metadata filters, empty results, timezone handling (store UTC, bucket in the workspace timezone — add `workspaces.timezone`, default UTC, settable in Settings).

**Derived (ratio) metrics** — the killer feature for KPIs (show rate, reply rate): a second definition type `{ type: 'ratio'; numeratorMetricId; denominatorMetricId; format: 'percent' }`. Guard against divide-by-zero and self-reference/cycles.

**Acceptance:** engine unit tests green; a hand-written definition over real Plan 2 data returns correct numbers verified against the source platform's own UI.

## Milestone 3.2 — Metric builder UI (the Zapier moment)

One page, two columns: **left = builder steps, right = live preview that updates on every change.** The preview is what makes it feel magic — reuse the chart components from 3.3.

Builder steps (progressive disclosure — each appears when the previous is answered):
1. **What do you want to count?** Pick event type(s), shown as human cards grouped by connected tool with logos and live counts ("Calendly — Booking created · 214 events"). Only event types that actually exist in this workspace appear. No jargon: never show raw `event_type` strings without the human label.
2. **Narrow it down (optional).** Filter rows: field dropdown (populated from the *actual* metadata keys present in matching events — sample the last 100), operator, value (with autocomplete from real values). Plain-English summary line renders above: "Count booking_created where campaign contains 'Q3'".
3. **How to measure it?** Count / Unique people / Sum of amount / Average of amount — four radio cards with one-line explanations. (Ratio metrics: a separate "Combine two metrics" choice on the New Metric screen: pick numerator, denominator, done.)
4. **Name & save.** Suggest a name from the definition ("Booked calls"). Save → toast → offer "Add to dashboard".

Also on this page: metric list (name, plain-English description, current 30-day value, sparkline), edit (same builder pre-filled), duplicate, delete (warn if used on a dashboard).

**Acceptance:** a non-technical user can create "Booked calls this month", "Email reply rate" (ratio), and "Revenue from won opportunities" (sum of amount) in under 2 minutes each, no docs. Preview matches saved result exactly.

## Milestone 3.3 — Unified dashboard

The home screen (`/`) of the app.

1. **Layout:** responsive grid of widgets. v1 arrangement: drag to reorder + two sizes (1x and 2x width) — persisted in `dashboard_widgets.position`. No free-form drag-resize canvas; that's complexity without value.
2. **Widget types:** Number card (big value, delta vs previous period, tiny sparkline, goal progress bar if a goal exists) · Line chart · Bar chart · Table (recent matching events). Each widget = one metric + type + config, added via "Add widget" → pick metric → pick type → preview → add.
3. **Global controls (top bar):** date-range picker (Today / 7d / 30d / This month / Custom) and comparison toggle (vs previous period). All widgets obey them.
4. **Live:** SWR polling every 30 seconds with a subtle "Updated just now" indicator. No websockets in v1.
5. **Goals:** on any number widget, "Set goal" → target + period (from `goals` table). Progress bar + on-pace indicator (linear pace vs elapsed period). Goal state readable at a glance: green on-pace, amber behind.
6. **Empty & loading states:** dashboard with no widgets shows a friendly setup checklist (Connect a tool → Create a metric → Add a widget) with live checkmarks driven by real state. Widgets skeleton-load; a widget whose metric hits an errored connection shows an inline warning, not a crash.
7. Follow the repo's chart/design conventions for color and accessibility; one accent color, consistent series colors per provider.

**Acceptance:** dashboard with 6+ widgets across ≥3 real providers loads in under 2s (measure), updates within 30s of a new real event (book a Calendly meeting, watch the number tick up), date-range switching is instant (<500ms perceived), and looks clean at laptop and tablet widths.

## Milestone 3.4 — Production hardening pass (go-live checklist)

1. **Onboarding:** first-login flow drops the user into the dashboard's setup checklist; each step deep-links to the right screen.
2. **Performance:** verify indexes cover the metric queries (`EXPLAIN ANALYZE` the 3 slowest); add `(workspace_id, event_type, occurred_at)` covering variants if needed. If any dashboard load exceeds 2s, add per-metric HTTP cache (30s) — not before.
3. **Error observability:** Sentry (free tier) for the app; Inngest dashboard already covers jobs. A `/api/health` endpoint checks DB connectivity.
4. **The upgrade moment:** document in `PROJECT_STATE.md` the go-live switches — Vercel Hobby→Pro (commercial use + faster crons as backup), Neon Free→Launch, custom-domain email for auth. No code should need to change.
5. **Full E2E walkthrough on production:** new Google account → sign up → connect 2 real providers → build 3 metrics (incl. one ratio) → build dashboard → set a goal → trigger real events → watch them land. Record a Loom-style script of this path in `docs/DEMO_SCRIPT.md`; it becomes the sales demo.

## Guardrails

- No billing, no team invites, no public/shared dashboards, no alerting/notifications in v1 — write them in `docs/ROADMAP.md` instead.
- Metric queries must be provably injection-safe (tests attempt hostile definitions).
- Keep the dashboard boring and fast over clever and slow. Every widget answers a question a founder actually asks.
- Update `PROJECT_STATE.md` before finishing.
