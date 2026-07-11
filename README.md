# Namzi (namzilabs)

All your business data, one live dashboard. Namzi pulls event data from the
tools you already use — Calendly, Brevo, Instantly, Close CRM, Google Sheets,
or any webhook — into one reliable event store, lets you build custom metrics
on top with a visual builder, and shows everything live in one place.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Neon
Postgres + Drizzle ORM · Auth.js v5 (Google) · Inngest (background jobs) ·
Vercel · Zod

## Getting started

```bash
cp .env.example .env   # see docs/SETUP.md for where each value comes from
npm install
npm run db:migrate
npm run dev
```

- **Provisioning (Neon / Google OAuth / Vercel / Inngest):** `docs/SETUP.md`
- **Build plan & architecture decisions:** `docs/BUILD_PLAN.md` and `docs/plans/`
- **Current status:** `PROJECT_STATE.md`

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
