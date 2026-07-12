"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getConnector } from "@/connectors";
import type { Provider } from "@/db/schema";
import { PROVIDERS } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { getFreshAuth } from "@/lib/connection-auth";
import { requireWorkspace } from "@/lib/workspace";
import { auth } from "@/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { inngest } from "@/inngest/client";
import {
  getHeaderRow,
  listSheetTabs,
  listSpreadsheets,
} from "@/connectors/google-sheets";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "namzilabs.co";
  return `${proto}://${host}`;
}

/** Load a connection and prove the caller's workspace owns it (404 if not). */
async function ownedConnection(connectionId: string) {
  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, connectionId), ne(schema.connections.status, "deleted")));
  if (!conn) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  await requireWorkspace(conn.workspaceId);
  return conn;
}

// ---------------------------------------------------------------------------
// Wizard step 1 — create the connection (draft) per auth method
// ---------------------------------------------------------------------------

const beginSchema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().trim().optional(),
});

export async function beginConnection(input: {
  provider: Provider;
  apiKey?: string;
}): Promise<ActionResult<{ connectionId: string; webhookUrl?: string; oauthUrl?: string }>> {
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { provider, apiKey } = parsed.data;

  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) return { ok: false, error: "No workspace" };

  const connector = getConnector(provider);

  let authData: string | null = null;
  if (connector.authMethod === "api_key") {
    if (!apiKey) return { ok: false, error: "Enter your API key first." };
    const test = await connector.testConnection({ apiKey }, {});
    if (!test.ok) return { ok: false, error: test.error ?? "Connection test failed." };
    authData = encryptJson({ apiKey });
  }

  const [conn] = await db()
    .insert(schema.connections)
    .values({
      workspaceId: workspace.id,
      provider,
      name: connector.label,
      status: "pending",
      authData,
    })
    .returning();

  const base = await getBaseUrl();
  const result: { connectionId: string; webhookUrl?: string; oauthUrl?: string } = {
    connectionId: conn.id,
  };
  if (provider === "webhook") {
    result.webhookUrl = `${base}/api/ingest/${conn.webhookToken}`;
  }
  if (connector.authMethod === "oauth") {
    result.oauthUrl = `${base}/api/oauth/google/start?cid=${conn.id}`;
  }
  return { ok: true, data: result };
}

// ---------------------------------------------------------------------------
// Wizard step 3 — provider-specific configuration
// ---------------------------------------------------------------------------

const CONFIG_SCHEMAS: Partial<Record<Provider, z.ZodType<Record<string, unknown>>>> = {
  webhook: z
    .object({
      eventType: z.string().trim().min(1).max(60).default("webhook_event"),
      idPath: z.string().trim().max(200).optional(),
      occurredAtPath: z.string().trim().max(200).optional(),
      emailPath: z.string().trim().max(200).optional(),
      amountPath: z.string().trim().max(200).optional(),
      secret: z.string().trim().max(200).optional(),
    })
    .strip(),
  calendly: z
    .object({
      events: z.array(z.enum(["invitee.created", "invitee.canceled"])).min(1),
    })
    .strip(),
  google_sheets: z
    .object({
      spreadsheetId: z.string().min(1),
      spreadsheetName: z.string().min(1),
      sheetTitle: z.string().min(1),
      headerRow: z.array(z.string()),
      timestampColumn: z.string().optional(),
      emailColumn: z.string().optional(),
      amountColumn: z.string().optional(),
    })
    .strip(),
};

export async function saveConfig(
  connectionId: string,
  rawConfig: Record<string, unknown>,
): Promise<ActionResult> {
  const conn = await ownedConnection(connectionId);
  const schemaFor = CONFIG_SCHEMAS[conn.provider];
  let config = rawConfig;
  if (schemaFor) {
    const parsed = schemaFor.safeParse(rawConfig);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid configuration" };
    }
    config = parsed.data;
  }

  // The generic-webhook shared secret is a credential → encrypted store.
  if (conn.provider === "webhook" && typeof config.secret === "string" && config.secret) {
    const existing = conn.authData ? decryptJson<Record<string, unknown>>(conn.authData) : {};
    await db()
      .update(schema.connections)
      .set({ authData: encryptJson({ ...existing, webhookSecret: config.secret }) })
      .where(eq(schema.connections.id, conn.id));
    delete config.secret;
  }

  await db()
    .update(schema.connections)
    .set({ config })
    .where(eq(schema.connections.id, conn.id));
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Google Sheets picker data
// ---------------------------------------------------------------------------

export async function getSheetsOptions(
  connectionId: string,
  spreadsheetId?: string,
  sheetTitle?: string,
): Promise<
  ActionResult<{
    spreadsheets?: { id: string; name: string }[];
    tabs?: string[];
    headerRow?: string[];
  }>
> {
  const conn = await ownedConnection(connectionId);
  if (conn.provider !== "google_sheets" || !conn.authData) {
    return { ok: false, error: "Google account not connected yet." };
  }
  try {
    const authData = await getFreshAuth(conn);
    if (!spreadsheetId) {
      const files = await listSpreadsheets(authData);
      return { ok: true, data: { spreadsheets: files.map((f) => ({ id: f.id, name: f.name })) } };
    }
    if (!sheetTitle) {
      const tabs = await listSheetTabs(authData, spreadsheetId);
      return { ok: true, data: { tabs } };
    }
    const headerRow = await getHeaderRow(authData, spreadsheetId, sheetTitle);
    return { ok: true, data: { headerRow } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Google API error" };
  }
}

// ---------------------------------------------------------------------------
// Wizard step 4 — live sample preview
// ---------------------------------------------------------------------------

export async function fetchSampleAction(
  connectionId: string,
): Promise<ActionResult<Record<string, unknown>[]>> {
  const conn = await ownedConnection(connectionId);
  try {
    if (conn.provider === "webhook") {
      // For inbound webhooks the "sample" is whatever the user just sent us.
      const raws = await db()
        .select({ payload: schema.rawEvents.payload })
        .from(schema.rawEvents)
        .where(eq(schema.rawEvents.connectionId, conn.id))
        .orderBy(desc(schema.rawEvents.receivedAt))
        .limit(3);
      return { ok: true, data: raws.map((r) => r.payload as Record<string, unknown>) };
    }
    const connector = getConnector(conn.provider);
    const authData = await getFreshAuth(conn);
    const records = await connector.fetchSample(authData, conn.config);
    return { ok: true, data: records.slice(0, 3) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not fetch sample data" };
  }
}

// ---------------------------------------------------------------------------
// Wizard step 5 — name it, register the webhook, activate
// ---------------------------------------------------------------------------

export async function finalizeConnection(
  connectionId: string,
  name: string,
): Promise<ActionResult<{ connectionId: string; notice?: string }>> {
  const conn = await ownedConnection(connectionId);
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return { ok: false, error: "Give this connection a name." };

  const connector = getConnector(conn.provider);
  let webhookRegistered = Boolean(conn.externalWebhookId);
  let notice: string | undefined;

  try {
    if (connector.registerWebhook && !conn.externalWebhookId) {
      const authData = await getFreshAuth(conn);
      const base = await getBaseUrl();
      const callbackUrl = `${base}/api/ingest/${conn.webhookToken}`;
      try {
        const { externalId, secret } = await connector.registerWebhook(
          authData,
          conn.config,
          callbackUrl,
        );
        const merged = { ...authData, ...(secret ? { webhookSecret: secret } : {}) };
        await db()
          .update(schema.connections)
          .set({ externalWebhookId: externalId, authData: encryptJson(merged) })
          .where(eq(schema.connections.id, conn.id));
        webhookRegistered = true;
      } catch (err) {
        // Instantly restricts webhooks to Hypergrowth+ — fall back to the
        // documented daily-analytics polling instead of blocking setup.
        if (conn.provider === "instantly" && connector.poll) {
          await db()
            .update(schema.connections)
            .set({ config: { ...conn.config, webhookUnavailable: true } })
            .where(eq(schema.connections.id, conn.id));
          notice =
            "This Instantly plan doesn't allow webhooks, so data arrives as daily rollups (previous day) instead of real-time events.";
        } else {
          throw err;
        }
      }
    }

    // Polling providers: snapshot the current state so history doesn't flood
    // in as "new" events — only activity after connect counts. Skipped when
    // a live webhook covers ingestion.
    if (connector.poll && !webhookRegistered) {
      const authData = await getFreshAuth(conn);
      const { nextCursor } = await connector.poll(authData, conn.config, {});
      await db()
        .insert(schema.syncState)
        .values({ connectionId: conn.id, cursor: nextCursor, lastSyncedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.syncState.connectionId,
          set: { cursor: nextCursor, lastSyncedAt: new Date() },
        });
    }

    await db()
      .update(schema.connections)
      .set({ name: trimmed, status: "active", errorMessage: null })
      .where(eq(schema.connections.id, conn.id));

    revalidatePath("/integrations");
    return { ok: true, data: { connectionId: conn.id, notice } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not finish setup" };
  }
}

// ---------------------------------------------------------------------------
// Detail-page operations
// ---------------------------------------------------------------------------

export async function pauseConnection(connectionId: string): Promise<ActionResult> {
  const conn = await ownedConnection(connectionId);
  await db()
    .update(schema.connections)
    .set({ status: conn.status === "paused" ? "active" : "paused" })
    .where(eq(schema.connections.id, conn.id));
  revalidatePath(`/integrations/${conn.id}`);
  revalidatePath("/integrations");
  return { ok: true, data: undefined };
}

export async function deleteConnection(connectionId: string): Promise<ActionResult> {
  const conn = await ownedConnection(connectionId);
  const connector = getConnector(conn.provider);

  // Best-effort remote cleanup — the connection is removed either way.
  if (connector.unregisterWebhook && conn.externalWebhookId && conn.authData) {
    try {
      const authData = await getFreshAuth(conn);
      await connector.unregisterWebhook(authData, conn.externalWebhookId);
    } catch {
      // Remote hook may already be gone; the token URL 404s from now on.
    }
  }

  // Soft delete: historical events stay queryable for metrics; credentials
  // are wiped and the ingest URL stops accepting.
  await db()
    .update(schema.connections)
    .set({ status: "deleted", authData: null, externalWebhookId: null })
    .where(eq(schema.connections.id, conn.id));
  revalidatePath("/integrations");
  return { ok: true, data: undefined };
}

export async function reprocessConnection(connectionId: string): Promise<ActionResult> {
  const conn = await ownedConnection(connectionId);
  await inngest.send({ name: "ingest/reprocess.requested", data: { connectionId: conn.id } });
  return { ok: true, data: undefined };
}

/** Live check used by the webhook wizard's "waiting for first request" step. */
export async function countRawEvents(connectionId: string): Promise<ActionResult<number>> {
  const conn = await ownedConnection(connectionId);
  const rows = await db()
    .select({ id: schema.rawEvents.id })
    .from(schema.rawEvents)
    .where(eq(schema.rawEvents.connectionId, conn.id))
    .limit(50);
  return { ok: true, data: rows.length };
}
