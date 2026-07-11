# Project State

- Repo: eliascroesus/namzilabs
- Source of truth: GitHub
- Agents: Codex Cloud and Claude Code Web
- Graphify: managed by GitHub Actions
- Domain to preserve later: namzilabs.co
- Google OAuth/domain setup to preserve later: namzilabs.co
- Current status: Plan 1 (foundation) CODE COMPLETE — Next.js 15 app scaffolded with schema, auth, Inngest spine, app shell; lint/typecheck/tests/build all green. NOT yet provisioned: Neon DB, Vercel project, Inngest integration, Google OAuth redirect URIs — manual steps in docs/SETUP.md. Next step: owner runs docs/SETUP.md, verifies Plan 1 acceptance on production, then execute Plan 2 (docs/plans/02-integration-engine.md).
- Build plan
  - Overview + locked stack decisions + verified platform constraints: docs/BUILD_PLAN.md
  - Plan 1 (foundation: Next.js/Neon/Auth.js/Inngest/app shell): docs/plans/01-foundation.md
  - Plan 2 (integration engine: 6 connectors, webhook+polling ingestion): docs/plans/02-integration-engine.md
  - Plan 3 (metric builder + unified live dashboard + go-live hardening): docs/plans/03-metrics-dashboard.md
- Recent changes
  - Plan 1 built: Next.js 15 + TS + Tailwind 4 + vendored shadcn/ui (registry blocked by proxy, components hand-vendored); Drizzle schema for all tables + generated migration; AES-256-GCM crypto helpers with 7 passing tests; Auth.js v5 Google + DB sessions + personal-workspace-on-signup + requireWorkspace tenancy guard; Inngest v4 spine (10-min heartbeat cron + retry-proof demo function) at /api/inngest; app shell (sidebar/topbar/empty states) for Dashboard, Integrations, Metrics, Settings; GitHub Actions CI; docs/SETUP.md for manual provisioning.
  - Added the three-phase build plan under docs/ (researched July 2026: Vercel Hobby/Neon Free limits, Calendly/Brevo/Instantly/Close webhook requirements, Google Sheets polling approach, Inngest for background jobs).
  - Added shared repo coordination files for Codex Cloud and Claude Code Web.
