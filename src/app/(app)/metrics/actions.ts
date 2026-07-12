"use server";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { metricDefinitionSchema } from "@/lib/metrics/types";
import { eventTypeLabel } from "@/lib/event-labels";
import type { ActionResult } from "../integrations/actions";

async function currentWorkspace() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) throw new Error("No workspace");
  return workspace;
}

export type EventTypeOption = {
  eventType: string;
  label: string;
  provider: string;
  connectionName: string;
  connectionId: string;
  count: number;
};

/**
 * Everything the workspace CAN measure: each connection's declared event
 * types (so the builder works before any data arrives) merged with live
 * counts of what has actually been ingested — plus any extra types found in
 * the data that the declarations don't know about.
 */
export async function getEventTypeOptions(): Promise<ActionResult<EventTypeOption[]>> {
  const workspace = await currentWorkspace();
  const { getConnector } = await import("@/connectors");
  const { ne } = await import("drizzle-orm");

  const [connections, counts] = await Promise.all([
    db()
      .select({
        id: schema.connections.id,
        name: schema.connections.name,
        provider: schema.connections.provider,
        config: schema.connections.config,
      })
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.workspaceId, workspace.id),
          ne(schema.connections.status, "deleted"),
        ),
      ),
    db()
      .select({
        eventType: schema.events.eventType,
        connectionId: schema.events.connectionId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.events)
      .where(eq(schema.events.workspaceId, workspace.id))
      .groupBy(schema.events.eventType, schema.events.connectionId),
  ]);

  const countFor = new Map(counts.map((c) => [`${c.connectionId}:${c.eventType}`, c.count]));
  const options: EventTypeOption[] = [];
  const seen = new Set<string>();

  for (const conn of connections) {
    const connector = getConnector(conn.provider);
    // The generic webhook connector's type comes from its configuration.
    const declared =
      conn.provider === "webhook"
        ? [((conn.config as { eventType?: string })?.eventType ?? "webhook_event")]
        : connector.producedEventTypes;
    for (const eventType of declared) {
      const key = `${conn.id}:${eventType}`;
      seen.add(key);
      options.push({
        eventType,
        label: eventTypeLabel(eventType),
        provider: conn.provider,
        connectionId: conn.id,
        connectionName: conn.name,
        count: countFor.get(key) ?? 0,
      });
    }
  }
  // Data can contain types the declarations don't know (e.g. renamed webhook
  // event types) — surface them too, never hide real data.
  const connById = new Map(connections.map((c) => [c.id, c]));
  for (const c of counts) {
    const key = `${c.connectionId}:${c.eventType}`;
    if (seen.has(key)) continue;
    const conn = connById.get(c.connectionId);
    if (!conn) continue;
    options.push({
      eventType: c.eventType,
      label: eventTypeLabel(c.eventType),
      provider: conn.provider,
      connectionId: conn.id,
      connectionName: conn.name,
      count: c.count,
    });
  }

  options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { ok: true, data: options };
}

export type FilterFieldOption = {
  /** Engine field id: "contact_email" | "provider" | "amount" | "metadata.<key>" */
  field: string;
  label: string;
  group: "Built-in" | "Fields from your data";
};

const SAFE_KEY_RE = /^[a-zA-Z0-9_. -]{1,80}$/;

/**
 * Every field the selected event types can be filtered on — Zapier-style:
 * built-ins + each connector's declared metadata fields + Google Sheets
 * column headers (from config) + keys sampled from real ingested events.
 */
export async function getFilterFields(
  eventTypes: string[],
): Promise<ActionResult<FilterFieldOption[]>> {
  const workspace = await currentWorkspace();
  const { getConnector } = await import("@/connectors");
  const { ne } = await import("drizzle-orm");

  const builtins: FilterFieldOption[] = [
    { field: "contact_email", label: "Contact email", group: "Built-in" },
    { field: "provider", label: "Source tool", group: "Built-in" },
    { field: "amount", label: "Amount", group: "Built-in" },
  ];

  const keys = new Set<string>();

  const connections = await db()
    .select({
      id: schema.connections.id,
      provider: schema.connections.provider,
      config: schema.connections.config,
    })
    .from(schema.connections)
    .where(
      and(eq(schema.connections.workspaceId, workspace.id), ne(schema.connections.status, "deleted")),
    );

  for (const conn of connections) {
    const connector = getConnector(conn.provider);
    const declared =
      conn.provider === "webhook"
        ? [((conn.config as { eventType?: string })?.eventType ?? "webhook_event")]
        : connector.producedEventTypes;
    if (eventTypes.length > 0 && !declared.some((t) => eventTypes.includes(t))) continue;

    for (const key of connector.metadataFields) {
      if (SAFE_KEY_RE.test(key)) keys.add(key);
    }
    // Google Sheets: every column header is a filterable field.
    if (conn.provider === "google_sheets") {
      const header = (conn.config as { headerRow?: string[] })?.headerRow ?? [];
      for (const raw of header) {
        const key = String(raw).slice(0, 60).trim();
        if (key && SAFE_KEY_RE.test(key)) keys.add(key);
      }
    }
  }

  // Merge in whatever real events actually carry (sampled last 100).
  if (eventTypes.length > 0) {
    const sampled = await getMetadataKeys(eventTypes);
    if (sampled.ok) for (const k of sampled.data) keys.add(k);
  }

  const dataFields: FilterFieldOption[] = [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ field: `metadata.${k}`, label: k, group: "Fields from your data" as const }));

  return { ok: true, data: [...builtins, ...dataFields] };
}

/** Metadata keys present on recent matching events (sampled last 100). */
export async function getMetadataKeys(eventTypes: string[]): Promise<ActionResult<string[]>> {
  const workspace = await currentWorkspace();
  if (eventTypes.length === 0) return { ok: true, data: [] };
  const parsed = z.array(z.string().max(80)).max(20).parse(eventTypes);
  const sample = await db()
    .select({ metadata: schema.events.metadata })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.workspaceId, workspace.id),
        sql`${schema.events.eventType} in (${sql.join(parsed.map((t) => sql`${t}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(schema.events.occurredAt))
    .limit(100);
  const counts = new Map<string, number>();
  for (const row of sample) {
    for (const key of Object.keys(row.metadata ?? {})) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const keys = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k]) => k);
  return { ok: true, data: keys };
}

/** Real values for a metadata key — autocomplete for the filter builder. */
export async function getMetadataValues(
  eventTypes: string[],
  key: string,
): Promise<ActionResult<string[]>> {
  const workspace = await currentWorkspace();
  const safeKeyRe = /^[a-zA-Z0-9_. -]{1,80}$/;
  if (!safeKeyRe.test(key) || eventTypes.length === 0) return { ok: true, data: [] };
  const parsed = z.array(z.string().max(80)).max(20).parse(eventTypes);
  const rows = await db()
    .select({ value: sql<string>`distinct ${schema.events.metadata}->>${key}` })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.workspaceId, workspace.id),
        sql`${schema.events.eventType} in (${sql.join(parsed.map((t) => sql`${t}`), sql`, `)})`,
        sql`${schema.events.metadata}->>${key} is not null`,
      ),
    )
    .limit(15);
  return { ok: true, data: rows.map((r) => r.value).filter(Boolean) };
}

const saveSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  definition: z.unknown(),
});

export async function saveMetric(input: {
  id: string | null;
  name: string;
  description?: string;
  definition: unknown;
}): Promise<ActionResult<{ metricId: string }>> {
  const workspace = await currentWorkspace();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the metric a name." };
  const defParsed = metricDefinitionSchema.safeParse(parsed.data.definition);
  if (!defParsed.success) {
    return { ok: false, error: "The metric definition is incomplete." };
  }

  if (parsed.data.id) {
    const [existing] = await db()
      .select({ id: schema.metrics.id })
      .from(schema.metrics)
      .where(and(eq(schema.metrics.id, parsed.data.id), eq(schema.metrics.workspaceId, workspace.id)));
    if (!existing) return { ok: false, error: "Metric not found" };
    await db()
      .update(schema.metrics)
      .set({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        definition: defParsed.data,
      })
      .where(eq(schema.metrics.id, existing.id));
    revalidatePath("/metrics");
    return { ok: true, data: { metricId: existing.id } };
  }

  const [row] = await db()
    .insert(schema.metrics)
    .values({
      workspaceId: workspace.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      definition: defParsed.data,
    })
    .returning({ id: schema.metrics.id });
  revalidatePath("/metrics");
  return { ok: true, data: { metricId: row.id } };
}

export async function duplicateMetric(metricId: string): Promise<ActionResult<{ metricId: string }>> {
  const workspace = await currentWorkspace();
  const [metric] = await db()
    .select()
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, metricId), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) return { ok: false, error: "Metric not found" };
  const [copy] = await db()
    .insert(schema.metrics)
    .values({
      workspaceId: workspace.id,
      name: `${metric.name} (copy)`.slice(0, 80),
      description: metric.description,
      definition: metric.definition,
    })
    .returning({ id: schema.metrics.id });
  revalidatePath("/metrics");
  return { ok: true, data: { metricId: copy.id } };
}

export async function deleteMetric(metricId: string): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const [metric] = await db()
    .select({ id: schema.metrics.id })
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, metricId), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) return { ok: false, error: "Metric not found" };
  // Widgets cascade-delete with the metric (FK) — the UI warns beforehand.
  await db().delete(schema.metrics).where(eq(schema.metrics.id, metric.id));
  revalidatePath("/metrics");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** How many dashboard widgets use this metric (for the delete warning). */
export async function metricUsage(metricId: string): Promise<ActionResult<number>> {
  await currentWorkspace();
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.dashboardWidgets)
    .where(eq(schema.dashboardWidgets.metricId, metricId));
  return { ok: true, data: row?.count ?? 0 };
}

/** True when the workspace already has events (drives builder empty state). */
export async function hasAnyEvents(): Promise<ActionResult<boolean>> {
  const workspace = await currentWorkspace();
  const rows = await db()
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.workspaceId, workspace.id),
        gte(schema.events.occurredAt, new Date(0)),
      ),
    )
    .limit(1);
  return { ok: true, data: rows.length > 0 };
}
