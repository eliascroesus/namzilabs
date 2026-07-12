# Roadmap — deliberately NOT in v1

Features cut from v1 on purpose (see docs/plans/ guardrails). Add them here
instead of sneaking them into the codebase.

## Next up (post-launch)
- **Sentry error tracking** — free tier, `@sentry/nextjs` + `SENTRY_DSN` env; wire when a real DSN exists (Inngest dashboard already covers job observability; /api/health covers infra).
- **Google sign-in return** — the Credentials password wall is pre-launch only. Re-enable the Google provider in `src/auth.ts` (adapter + user model already compatible) once the OAuth consent screen is verified.
- **Raw-event retention enforcement** — Inngest cron deleting raw_events older than `RAW_EVENT_RETENTION_DAYS` (constant exists in `src/lib/config.ts`).
- **Team invites** — workspace_members already supports multiple members and roles; needs invite flow + email.

## Later
- Billing (Stripe) and plan limits
- Public/shared read-only dashboards
- Alerting/notifications (goal missed, connection quiet, error spikes)
- Calendly OAuth app (replace personal access tokens)
- Instantly per-event polling (if/when their API documents per-event listing semantics)
- Marketing-stream Brevo webhooks (campaign events) alongside transactional
- Per-metric caching if any dashboard exceeds the 2s budget (measure first)
