# Graph Report - .  (2026-07-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 599 nodes · 1473 edges · 30 communities (22 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b2d55b74`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- db
- schema.ts
- devDependencies
- dashboard-client.tsx
- dependencies
- page.tsx
- metric-builder.tsx
- compilerOptions
- google-oauth.ts
- google-sheets.ts
- calendly.ts
- close.ts
- index.ts
- instantly.ts
- brevo.ts
- Connector
- util.ts
- eslint.config.mjs
- layout.tsx
- middleware.ts
- page.tsx
- page.tsx
- next.config.ts
- next-env.d.ts
- postcss.config.mjs
- { GET, POST }

## God Nodes (most connected - your core abstractions)
1. `db()` - 88 edges
2. `cn()` - 55 edges
3. `getWorkspaceForUser()` - 29 edges
4. `react` - 21 edges
5. `Button()` - 20 edges
6. `Connector` - 17 edges
7. `compilerOptions` - 16 edges
8. `getConnector()` - 15 edges
9. `formatValue()` - 13 edges
10. `ownedConnection()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `WidgetMenu()` --references--> `react`  [EXTRACTED]
  src/app/(app)/dashboard/dashboard-client.tsx → package.json
- `ConnectionActions()` --references--> `react`  [EXTRACTED]
  src/app/(app)/integrations/[id]/connection-actions.tsx → package.json
- `CalendlyConfigStep()` --references--> `react`  [EXTRACTED]
  src/app/(app)/integrations/new/[provider]/connect-wizard.tsx → package.json
- `ConnectWizard()` --references--> `react`  [EXTRACTED]
  src/app/(app)/integrations/new/[provider]/connect-wizard.tsx → package.json
- `CredentialsStep()` --references--> `react`  [EXTRACTED]
  src/app/(app)/integrations/new/[provider]/connect-wizard.tsx → package.json

## Import Cycles
- None detected.

## Communities (30 total, 8 thin omitted)

### Community 0 - "cn"
Cohesion: 0.06
Nodes (55): metadata, RefreshButton(), ConnectionDetailPage(), fmt(), metadata, Meta, Resume, metadata (+47 more)

### Community 1 - "db"
Cohesion: 0.08
Nodes (53): GET(), GET(), ActivityPage(), addWidget(), currentWorkspace(), ensureDefaultDashboard(), loadDashboard(), ownedWidget() (+45 more)

### Community 2 - "schema.ts"
Cohesion: 0.06
Nodes (44): POST(), { GET, POST, PUT }, POLLING_PROVIDERS, setDbForTests(), accounts, CONNECTION_STATUSES, connections, ConnectionStatus (+36 more)

### Community 3 - "devDependencies"
Cohesion: 0.04
Nodes (45): dotenv, drizzle-kit, @electric-sql/pglite, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, dotenv (+37 more)

### Community 4 - "dashboard-client.tsx"
Cohesion: 0.09
Nodes (36): react, react, AddWidgetDialog(), DashboardClient(), goalPeriodBounds(), MetricOption, NumberBody(), Preset (+28 more)

### Community 5 - "dependencies"
Cohesion: 0.05
Nodes (43): @auth/drizzle-adapter, class-variance-authority, clsx, drizzle-orm, @fontsource-variable/inter, inngest, lucide-react, @neondatabase/serverless (+35 more)

### Community 6 - "page.tsx"
Cohesion: 0.10
Nodes (31): bodySchema, POST(), metadata, MetricsPage(), EmptyState(), Sparkline(), AGG_LABEL, aggregateSql() (+23 more)

### Community 7 - "metric-builder.tsx"
Cohesion: 0.11
Nodes (29): currentWorkspace(), deleteMetric(), duplicateMetric(), EventTypeOption, FilterFieldOption, getEventTypeOptions(), getFilterFields(), getMetadataKeys() (+21 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, ./src/*, **/*.ts (+20 more)

### Community 9 - "google-oauth.ts"
Cohesion: 0.16
Nodes (20): GET(), finalizeConnection(), saveConfig(), ConnectWizard(), stepsFor(), buildAuthUrl(), exchangeCode(), GOOGLE_SHEETS_SCOPES (+12 more)

### Community 10 - "google-sheets.ts"
Cohesion: 0.19
Nodes (11): getSheetsOptions(), SheetsPickerStep(), bearer(), fingerprintRows(), getHeaderRow(), googleSheetsConnector, listSheetTabs(), listSpreadsheets() (+3 more)

### Community 11 - "calendly.ts"
Cohesion: 0.18
Nodes (7): calendlyConnector, CalendlyMe, NOTE: webhook subscriptions require a paid Calendly plan — a 403 at, conn, inviteeCreated, ConnectorHttpError, hmacSha256Hex()

### Community 12 - "close.ts"
Cohesion: 0.22
Nodes (7): closeConnector, closeDate(), SUBSCRIBED, conn, opportunityCreated, sigKey, parseDate()

### Community 13 - "index.ts"
Cohesion: 0.24
Nodes (7): ALL_CONNECTORS, REGISTRY, Config, ConnectionCtx, Cursor, webhookConnector, Provider

### Community 14 - "instantly.ts"
Cohesion: 0.22
Nodes (6): DAILY_METRICS, instantlyConnector, conn, replyReceived, TRACKED, NormalizedEvent

### Community 15 - "brevo.ts"
Cohesion: 0.25
Nodes (6): brevoConnector, EVENT_MAP, SUBSCRIBED_EVENTS, conn, delivered, RawRecord

### Community 17 - "util.ts"
Cohesion: 0.36
Nodes (4): getPath(), parseAmount(), safeEqual(), ID_CANDIDATES

### Community 18 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 20 - "middleware.ts"
Cohesion: 0.67
Nodes (3): config, middleware(), PUBLIC_PATHS

## Knowledge Gaps
- **179 isolated node(s):** `__filename`, `__dirname`, `compat`, `eslintConfig`, `nextConfig` (+174 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`, `dashboard-client.tsx`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Why does `react` connect `dashboard-client.tsx` to `cn`, `db`, `dependencies`, `metric-builder.tsx`, `google-oauth.ts`, `google-sheets.ts`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Why does `db()` connect `db` to `cn`, `schema.ts`, `dashboard-client.tsx`, `page.tsx`, `metric-builder.tsx`, `google-oauth.ts`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **What connects `__filename`, `__dirname`, `compat` to the rest of the system?**
  _179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05822267620020429 - nodes in this community are weakly interconnected._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.08289738430583501 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05576441102756892 - nodes in this community are weakly interconnected._