# Plan 1 of 3 — Foundation & Platform Core

> **How to use this file:** paste it as the prompt for a build session in the `eliascroesus/namzilabs` repo. Read `docs/BUILD_PLAN.md` first for locked decisions and verified platform constraints. Do not start Plan 2 until every acceptance criterion below passes on the production Vercel deployment.

## Context

We are building **Namzi** (working name), a SaaS that unifies event data from Calendly, Brevo, Instantly, Close CRM, Google Sheets, and generic webhooks into one event store, with a custom metric builder and a live dashboard. This plan builds the platform skeleton everything else stands on. **No integrations and no dashboard yet** — resist the urge; they are Plans 2 and 3.

Stack (locked): Next.js 15 App Router + TypeScript, Tailwind + shadcn/ui, Neon Postgres + Drizzle ORM (`@neondatabase/serverless` HTTP driver), Auth.js v5 with Google provider, Inngest for background jobs, Zod for validation. Deployed on Vercel (Hobby for now), domain namzilabs.co.

## Milestone 1.1 — Project scaffold & deploy pipeline

1. Scaffold Next.js 15 (App Router, TypeScript, Tailwind, ESLint, `src/` directory). Add shadcn/ui and Zod.
2. Set up scripts: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `db:generate`, `db:migrate`, `db:studio`.
3. Add a GitHub Actions CI workflow that runs lint + typecheck + build on every PR.
4. Connect the repo to Vercel; every push to `main` deploys to production; PRs get preview deployments. Point namzilabs.co at the Vercel project.
5. `.env.example` documenting every env var the app needs (never commit real values): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ENCRYPTION_KEY`.

**Acceptance:** clean deploy on Vercel at namzilabs.co, CI green on a test PR.

## Milestone 1.2 — Database schema & data layer

Create the full schema now (Plans 2–3 fill it with features). Use Drizzle migrations — never hand-edit the DB.

```
users                — managed by Auth.js Drizzle adapter (+ accounts, sessions, verification_tokens)
workspaces           — id, name, slug, created_at
workspace_members    — workspace_id, user_id, role ('owner'|'member'), UNIQUE(workspace_id, user_id)
connections          — id, workspace_id, provider ('calendly'|'brevo'|'instantly'|'close'|'google_sheets'|'webhook'),
                       name, status ('active'|'error'|'paused'|'pending'),
                       auth_data (jsonb, ENCRYPTED — see below), config (jsonb),
                       webhook_token (unique url-safe secret), external_webhook_id,
                       last_event_at, error_message, created_at
raw_events           — id, connection_id, external_id, payload (jsonb), headers (jsonb),
                       received_at, processed_at, status ('pending'|'processed'|'failed'|'skipped'), error
events               — id, workspace_id, connection_id, provider, event_type, external_id,
                       occurred_at, contact_email, contact_name, amount (numeric, null), metadata (jsonb), created_at
                       UNIQUE(connection_id, event_type, external_id)
                       INDEX (workspace_id, event_type, occurred_at), INDEX (workspace_id, occurred_at)
sync_state           — connection_id (PK), cursor (jsonb), last_synced_at, last_error
metrics              — id, workspace_id, name, description, definition (jsonb), created_at
dashboards           — id, workspace_id, name, is_default, created_at
dashboard_widgets    — id, dashboard_id, metric_id, widget_type ('number'|'line'|'bar'|'table'),
                       config (jsonb), position (jsonb)
goals                — id, metric_id, target (numeric), period ('day'|'week'|'month'|'quarter'), created_at
```

**Encryption requirement:** `connections.auth_data` (API keys, OAuth tokens) must be encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY` from env (use Node's built-in `crypto`; store iv+tag+ciphertext). Write `encryptJson()` / `decryptJson()` helpers in `src/lib/crypto.ts` with unit tests. Plaintext secrets must never appear in the DB or logs.

**Acceptance:** migrations run against Neon; a seed script creates a demo workspace with fake events; `db:studio` shows the data; crypto helpers round-trip in tests.

## Milestone 1.3 — Auth & multi-tenancy

1. Auth.js v5, Google provider only (the OAuth client for namzilabs.co exists — request only `openid email profile` scopes here; Sheets scopes are requested later, per-connection, in Plan 2).
2. On first sign-in: create the user, a personal workspace ("<first name>'s workspace"), and an owner membership, in one transaction.
3. Session strategy: database sessions via the Drizzle adapter.
4. Authorization helper `requireWorkspace(workspaceId)` used by **every** server action and API route: verifies session + membership, returns 404 (not 403) for foreign workspaces. All queries are always scoped by `workspace_id` — no exceptions, this is the tenancy boundary.
5. Middleware: unauthenticated users hitting app routes → `/login`. Login page: logo + one "Continue with Google" button. Nothing else.

**Acceptance:** sign in with Google on production, land in your workspace; a second account cannot see the first account's data (test this explicitly by URL manipulation).

## Milestone 1.4 — Inngest & background-job spine

1. Install Inngest SDK, serve it at `/api/inngest`, connect the Inngest Vercel integration (it registers functions on every deploy).
2. Create two proof functions: `demo/heartbeat` (cron every 10 min, writes a timestamp row — proves >daily-frequency scheduling works on Hobby via Inngest) and `demo/process-event` (triggered by a test event, with a step that fails once then succeeds on retry — proves durable retries).
3. Establish the convention Plan 2 depends on: **Vercel routes never do heavy work.** They validate, persist, emit an Inngest event, return. All processing lives in Inngest functions with named steps.

**Acceptance:** both proof functions visibly succeed in the Inngest dashboard against production; heartbeat fires ~every 10 min for at least an hour.

## Milestone 1.5 — App shell & design system

1. Layout: fixed left sidebar (Dashboard, Integrations, Metrics, Settings) + top bar (workspace name, user menu). Content area max-width ~1200px. This shell is the whole app chrome — keep it.
2. Design tokens: neutral background, one accent color, generous whitespace, `Inter` font. Light mode only in v1.
3. Build the shared components now: page header, empty state (icon + one sentence + one primary action), stat card, data table, wizard/stepper container, confirm dialog, toast.
4. Each nav section renders a real empty state (e.g. Integrations: "Connect your first tool" with a disabled-until-Plan-2 button style — no dead links, no lorem ipsum).

**Acceptance:** clicking through the deployed app feels like a finished product with no data — zero placeholder text, zero console errors, responsive down to tablet width.

## Guardrails

- Do not add: teams/invites UI, billing, dark mode, i18n, websockets, Redis, or any integration code. Plan 2/3 own those or they're cut from v1.
- Every server boundary validates input with Zod.
- Update `PROJECT_STATE.md` and keep `docs/` current before finishing.
