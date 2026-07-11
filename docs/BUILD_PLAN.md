# Namzi — Unified Data Tracking Platform: Master Build Plan

**Product in one sentence:** A Zapier-simple integrations platform whose only job is to pull event data from the tools a business already uses (Calendly, Brevo, Instantly, Close CRM, Google Sheets, plus a generic webhook) into one reliable event store, let users build custom metrics on top of that data with a visual rule builder, and show everything live on one clean dashboard.

**Domain:** namzilabs.co (Google OAuth for Drive & Sheets already approved for this domain — preserve it).

---

## How to use this plan

The build is split into **three self-contained plan documents**, each written to be pasted directly as a prompt into a build session. Build them **in order** — each one depends on the previous:

| # | Plan | File | What it delivers |
|---|------|------|------------------|
| 1 | Foundation & Platform Core | `docs/plans/01-foundation.md` | Next.js app, auth, database schema, background-job infrastructure, design system, deployed to Vercel |
| 2 | Integration Engine | `docs/plans/02-integration-engine.md` | The connector framework + all 6 integrations, webhook ingestion, polling, reliability guarantees |
| 3 | Metric Builder & Dashboard | `docs/plans/03-metrics-dashboard.md` | Zapier-style connection wizard with live data preview, visual metric builder, unified live dashboard |

Rule for every phase: **do not start the next plan until the previous plan's acceptance criteria all pass in production on Vercel.**

---

## Locked technical decisions (do not re-litigate these mid-build)

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 15 (App Router, TypeScript)** — single app, no monorepo | Vercel-native, one deployable unit, simplest possible operational surface |
| UI | **Tailwind CSS + shadcn/ui** | Clean, consistent, fast to build the Zapier-grade simple UX |
| Database | **Neon Postgres** via **Drizzle ORM** + `@neondatabase/serverless` driver | Serverless-friendly (HTTP driver, no connection-pool exhaustion), typed schema, easy migrations |
| Auth | **Auth.js (NextAuth v5)** with Google provider | The Google OAuth client for namzilabs.co already exists; sessions in Postgres |
| Background jobs | **Inngest** (free tier: 50k runs/month, first-class Vercel integration) | This is the reliability linchpin — see below |
| Charts | **Recharts** | Simple, good-looking, React-native |
| Validation | **Zod** everywhere data crosses a boundary (webhook payloads, API routes, forms) | No unvalidated data enters the system |

### Why Inngest is non-negotiable on the current plans

Verified platform constraints this architecture must respect:

- **Vercel Hobby:** cron jobs may run at most **once per day** (more frequent schedules fail at deploy), and invocation time is only guaranteed within the hour. Function max duration defaults to 30s. That makes Vercel cron useless for polling Google Sheets or renewing watch channels.
- **Neon Free:** 0.5 GB storage, 100 compute-hours/month, autosuspends after 5 min idle (first query after idle has ~1s cold start — acceptable).
- **Inngest free tier** gives us: cron at any frequency, automatic retries with backoff, step-level durability (a multi-step sync resumes from the failed step, not from zero), concurrency limits, and a dashboard showing every failed run. All invoked as normal Vercel API routes, so nothing new to host.

Every webhook is therefore handled in two stages: the Vercel route **only verifies the signature, stores the raw payload, and returns 200 in <1s**; an Inngest function then normalizes and processes it with retries. Ingestion never loses data because acknowledgment is decoupled from processing.

### Cost / plan-upgrade triggers (verified, tell the user before going live)

| Service | Free-tier status | Upgrade trigger |
|---------|-----------------|-----------------|
| Vercel Hobby | Fine for entire build & beta | Commercial use requires Pro ($20/mo) — upgrade at launch |
| Neon Free | Fine for build & beta (0.5 GB ≈ several million normalized events if payload JSONB is kept lean; raw payloads get a retention window) | Launch plan ($5/mo+) when storage or compute nears limits |
| Inngest free | 50k runs/month — fine for beta | Paid tier when event volume grows |
| **Calendly** | **Webhooks require a paid Calendly plan** (not available on free) — this is the *customer's* Calendly account | Customers must have a paid Calendly plan to connect it |
| Brevo | Webhooks available **on all plans including free** (transactional + marketing events, up to 40 endpoints) | None |
| **Instantly** | **Webhooks require Hypergrowth ($97/mo) or higher** — again, the customer's plan. API v2 polling is the fallback for lower plans | Handled in-product via polling fallback |
| Close CRM | Webhook Subscriptions API available with standard API access; event log retains 30 days | None |
| Google Sheets | No webhooks exist at all. Drive API push channels expire and batch notifications (~3 min). We poll on an Inngest cron instead — simplest reliable option | None |

---

## Canonical data model (all three plans build on this)

One normalized `events` table is the heart of the product. Every integration, no matter how different its payloads, produces rows in this one shape:

```
events:
  id, workspace_id, connection_id, provider, event_type,
  external_id, occurred_at, contact_email, contact_name,
  amount (numeric, nullable), metadata (jsonb), created_at
  UNIQUE (connection_id, event_type, external_id)   ← idempotency
```

Raw payloads are stored separately (`raw_events`) before any processing, so nothing is ever lost to a normalization bug — reprocessing is always possible.

Metrics are stored as declarative rules (provider/event-type selection + filter conditions + aggregation) and computed with plain SQL over `events` at query time. No pre-aggregation pipelines until real scale demands it.

---

## Product principles (bake into every UI decision)

1. **Zapier-grade simplicity.** Every flow is a short wizard: pick app → connect → see your real latest 2–3 records → done. If a screen needs explanation, it's wrong.
2. **Show real data immediately.** The moment a connection is made, pull sample records and display them. Users trust what they can see.
3. **Never silently lose data.** Idempotent ingestion, raw payload storage, retries, and a visible per-connection health status (last event received, error count).
4. **One dashboard.** All metrics from all tools on one screen, live, with date-range control and goal tracking.
5. **Boring technology, no speculative features.** No queues we host, no websockets in v1 (30s polling refresh is indistinguishable for this use case), no multi-region anything.

---

## Reference documentation (verified July 2026 — use these, don't invent APIs)

- Calendly webhooks: https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions (paid plan required)
- Brevo webhooks: https://developers.brevo.com/docs/how-to-use-webhooks (transactional: https://developers.brevo.com/docs/transactional-webhooks, marketing: https://developers.brevo.com/docs/marketing-webhooks)
- Instantly API v2 + webhooks: https://developer.instantly.ai/guides/webhook-events (Hypergrowth+ for webhooks)
- Close CRM webhooks & event log: https://developer.close.com/resources/webhook-subscriptions/ and https://developer.close.com/resources/event-log/
- Google Drive push notifications (reference only — we poll instead): https://developers.google.com/workspace/drive/api/guides/push
- Google Sheets API: https://developers.google.com/sheets/api
- Vercel limits: https://vercel.com/docs/limits · Cron pricing/limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Neon plans: https://neon.com/docs/introduction/plans
- Inngest + Vercel: https://vercel.com/marketplace/inngest
