# Project State

- Repo: eliascroesus/namzilabs
- Source of truth: GitHub
- Agents: Codex Cloud and Claude Code Web
- Graphify: managed by GitHub Actions
- Domain to preserve later: namzilabs.co
- Google OAuth/domain setup to preserve later: namzilabs.co
- Current status: build plan written; app not built yet. Next step: execute Plan 1 (docs/plans/01-foundation.md).
- Build plan
  - Overview + locked stack decisions + verified platform constraints: docs/BUILD_PLAN.md
  - Plan 1 (foundation: Next.js/Neon/Auth.js/Inngest/app shell): docs/plans/01-foundation.md
  - Plan 2 (integration engine: 6 connectors, webhook+polling ingestion): docs/plans/02-integration-engine.md
  - Plan 3 (metric builder + unified live dashboard + go-live hardening): docs/plans/03-metrics-dashboard.md
- Recent changes
  - Added the three-phase build plan under docs/ (researched July 2026: Vercel Hobby/Neon Free limits, Calendly/Brevo/Instantly/Close webhook requirements, Google Sheets polling approach, Inngest for background jobs).
  - Added shared repo coordination files for Codex Cloud and Claude Code Web.
