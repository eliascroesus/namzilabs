# Setup — manual provisioning steps (one-time)

The code in this repo is complete for Plan 1, but four cloud services need
one-time manual setup by the repo owner. Do them in this order; each takes a
few minutes.

## 1. Neon (database)

1. In the [Neon console](https://console.neon.tech), create a project (e.g. `namzilabs`, region close to your Vercel region).
2. Copy the **pooled** connection string → this is `DATABASE_URL`.
3. Locally: `cp .env.example .env`, paste `DATABASE_URL`, then run:
   ```bash
   npm install
   npm run db:migrate   # applies drizzle/ migrations
   npm run db:seed      # optional: demo workspace with fake events
   npm run db:studio    # optional: browse the data
   ```

## 2. Google OAuth (Sheets connector) + login password

Login currently uses a shared password (`APP_PASSWORD`, defaults to `Namzilabs123` if unset —
set your own). Google OAuth is used by the **Google Sheets integration**, and the public
homepage /terms /privacy pages exist to satisfy Google's OAuth verification requirements.

Using the existing Google Cloud OAuth client for namzilabs.co:

1. In Google Cloud Console → APIs & Services → Credentials → your OAuth client, add **Authorized redirect URIs**:
   - `https://namzilabs.co/api/oauth/google/callback` (Sheets connector)
   - `http://localhost:3000/api/oauth/google/callback` (local dev)
   - `https://namzilabs.co/api/auth/callback/google` (Google sign-in, for when it returns)
2. In APIs & Services → Library, **enable the Google Sheets API and the Google Drive API** for the project — the Sheets connector calls both.
3. On the OAuth consent screen, add scopes `spreadsheets.readonly` and `drive.metadata.readonly`, set the homepage to `https://namzilabs.co`, privacy policy to `https://namzilabs.co/privacy`, and terms to `https://namzilabs.co/terms`.
4. Copy the client ID/secret → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
5. Generate `AUTH_SECRET` and `ENCRYPTION_KEY`:
   ```bash
   openssl rand -base64 32   # run twice, one value for each
   ```

## 3. Vercel (hosting)

1. In Vercel, **Add New → Project** → import `eliascroesus/namzilabs` (framework auto-detects Next.js; no custom settings needed).
2. Project → Settings → Environment Variables: add `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ENCRYPTION_KEY`, `APP_PASSWORD` (Production + Preview).
3. Project → Settings → Domains: add `namzilabs.co` and follow the DNS instructions shown (A record / nameservers at your registrar).
4. Production deploys track `main`; every PR gets a preview URL automatically.

## 4. Inngest (background jobs)

1. Create an account at [inngest.com](https://www.inngest.com) (free tier).
2. Install the **Inngest integration** from the [Vercel Marketplace](https://vercel.com/marketplace/inngest) and connect it to the project — this injects `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` and syncs functions on every deploy.
3. Redeploy once after installing so the app registers its functions.

## Verify Plan 1 acceptance (after the above)

- [ ] `main` deploys cleanly; site loads at namzilabs.co
- [ ] CI (GitHub Actions) green on a test PR
- [ ] Sign in with Google → lands on the dashboard in "<name>'s workspace"
- [ ] Second Google account cannot reach the first account's data (workspace IDs 404)
- [ ] Inngest dashboard: `demo-heartbeat` fires every ~10 minutes
- [ ] Settings → "Run retry-proof test job" → Inngest shows one failed attempt, then success
- [ ] Clicking through Dashboard / Integrations / Metrics / Settings: real empty states, no console errors

## Local development

```bash
cp .env.example .env   # fill in values from steps 1–2
npm install
npm run dev            # app on http://localhost:3000
```

For local background jobs, run the Inngest dev server alongside:

```bash
INNGEST_DEV=1 npm run dev        # app in dev mode for Inngest
npx inngest-cli@latest dev       # local Inngest dashboard on :8288
```

Checks that CI runs on every PR: `npm run lint && npm run typecheck && npm test && npm run build`.
