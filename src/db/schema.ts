import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Auth.js tables (shape required by @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_members_workspace_user_idx").on(t.workspaceId, t.userId)],
);

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const PROVIDERS = ["calendly", "brevo", "instantly", "close", "google_sheets", "webhook"] as const;
export type Provider = (typeof PROVIDERS)[number];

// "deleted" is a soft state: the row (and its historical events) survive,
// ingestion stops, and the UI hides it. Text column — no DB migration needed.
export const CONNECTION_STATUSES = ["active", "error", "paused", "pending", "deleted"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const connections = pgTable(
  "connections",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: PROVIDERS }).notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: CONNECTION_STATUSES }).notNull().default("pending"),
    /** Encrypted with src/lib/crypto.ts — never store plaintext credentials. */
    authData: text("auth_data"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    webhookToken: text("webhook_token")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID().replaceAll("-", "")),
    externalWebhookId: text("external_webhook_id"),
    lastEventAt: timestamp("last_event_at", { mode: "date" }),
    errorMessage: text("error_message"),
    rejectedCount: integer("rejected_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("connections_workspace_idx").on(t.workspaceId)],
);

export const RAW_EVENT_STATUSES = ["pending", "processed", "failed", "skipped"] as const;

export const rawEvents = pgTable(
  "raw_events",
  {
    id: id(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    payload: jsonb("payload").notNull(),
    headers: jsonb("headers").$type<Record<string, string>>(),
    receivedAt: timestamp("received_at", { mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { mode: "date" }),
    status: text("status", { enum: RAW_EVENT_STATUSES }).notNull().default("pending"),
    error: text("error"),
  },
  (t) => [index("raw_events_connection_status_idx").on(t.connectionId, t.status)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: PROVIDERS }).notNull(),
    eventType: text("event_type").notNull(),
    externalId: text("external_id").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull(),
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    amount: numeric("amount"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency: duplicate deliveries of the same provider object are no-ops.
    uniqueIndex("events_connection_type_external_idx").on(t.connectionId, t.eventType, t.externalId),
    index("events_workspace_type_occurred_idx").on(t.workspaceId, t.eventType, t.occurredAt),
    index("events_workspace_occurred_idx").on(t.workspaceId, t.occurredAt),
  ],
);

export const syncState = pgTable("sync_state", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  cursor: jsonb("cursor").$type<Record<string, unknown>>().notNull().default({}),
  lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
  lastError: text("last_error"),
});

// ---------------------------------------------------------------------------
// Metrics & dashboards
// ---------------------------------------------------------------------------

export const metrics = pgTable(
  "metrics",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("metrics_workspace_idx").on(t.workspaceId)],
);

export const dashboards = pgTable(
  "dashboards",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("dashboards_workspace_idx").on(t.workspaceId)],
);

export const WIDGET_TYPES = ["number", "line", "bar", "table"] as const;

export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    id: id(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    metricId: text("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    widgetType: text("widget_type", { enum: WIDGET_TYPES }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    position: jsonb("position").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("dashboard_widgets_dashboard_idx").on(t.dashboardId)],
);

export const GOAL_PERIODS = ["day", "week", "month", "quarter"] as const;

export const goals = pgTable("goals", {
  id: id(),
  metricId: text("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  target: numeric("target").notNull(),
  period: text("period", { enum: GOAL_PERIODS }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Demo (Milestone 1.4 proof artifacts — safe to drop after Plan 2 lands)
// ---------------------------------------------------------------------------

export const demoHeartbeats = pgTable("demo_heartbeats", {
  id: id(),
  firedAt: timestamp("fired_at", { mode: "date" }).notNull().defaultNow(),
  note: text("note"),
});
