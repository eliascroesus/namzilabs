"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { WIDGET_TYPES, GOAL_PERIODS } from "@/db/schema";
import type { ActionResult } from "../integrations/actions";

async function currentWorkspace() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) throw new Error("No workspace");
  return workspace;
}

/** The workspace's default dashboard, created on first use. */
export async function ensureDefaultDashboard(workspaceId: string) {
  const [existing] = await db()
    .select()
    .from(schema.dashboards)
    .where(and(eq(schema.dashboards.workspaceId, workspaceId), eq(schema.dashboards.isDefault, true)));
  if (existing) return existing;
  const [created] = await db()
    .insert(schema.dashboards)
    .values({ workspaceId, name: "Main dashboard", isDefault: true })
    .returning();
  return created;
}

export async function addWidget(input: {
  metricId: string;
  widgetType: (typeof WIDGET_TYPES)[number];
}): Promise<ActionResult<{ widgetId: string }>> {
  const workspace = await currentWorkspace();
  const parsed = z
    .object({ metricId: z.string().min(1), widgetType: z.enum(WIDGET_TYPES) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid widget" };

  const [metric] = await db()
    .select({ id: schema.metrics.id })
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, parsed.data.metricId), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) return { ok: false, error: "Metric not found" };

  const dashboard = await ensureDefaultDashboard(workspace.id);
  const [{ maxOrder }] = await db()
    .select({ maxOrder: sql<number>`coalesce(max((${schema.dashboardWidgets.position}->>'order')::int), -1)` })
    .from(schema.dashboardWidgets)
    .where(eq(schema.dashboardWidgets.dashboardId, dashboard.id));

  const [widget] = await db()
    .insert(schema.dashboardWidgets)
    .values({
      dashboardId: dashboard.id,
      metricId: metric.id,
      widgetType: parsed.data.widgetType,
      position: { order: (maxOrder ?? -1) + 1, size: 1 },
    })
    .returning({ id: schema.dashboardWidgets.id });
  revalidatePath("/dashboard");
  return { ok: true, data: { widgetId: widget.id } };
}

async function ownedWidget(widgetId: string, workspaceId: string) {
  const [row] = await db()
    .select({ widget: schema.dashboardWidgets })
    .from(schema.dashboardWidgets)
    .innerJoin(schema.dashboards, eq(schema.dashboards.id, schema.dashboardWidgets.dashboardId))
    .where(and(eq(schema.dashboardWidgets.id, widgetId), eq(schema.dashboards.workspaceId, workspaceId)));
  return row?.widget ?? null;
}

export async function removeWidget(widgetId: string): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const widget = await ownedWidget(widgetId, workspace.id);
  if (!widget) return { ok: false, error: "Widget not found" };
  await db().delete(schema.dashboardWidgets).where(eq(schema.dashboardWidgets.id, widget.id));
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function setWidgetSize(widgetId: string, size: 1 | 2): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const widget = await ownedWidget(widgetId, workspace.id);
  if (!widget) return { ok: false, error: "Widget not found" };
  await db()
    .update(schema.dashboardWidgets)
    .set({ position: { ...(widget.position as object), size } })
    .where(eq(schema.dashboardWidgets.id, widget.id));
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** Persist a full ordering after drag-reorder. */
export async function reorderWidgets(orderedIds: string[]): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const parsed = z.array(z.string()).max(50).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid order" };
  for (const [index, widgetId] of parsed.data.entries()) {
    const widget = await ownedWidget(widgetId, workspace.id);
    if (!widget) continue;
    await db()
      .update(schema.dashboardWidgets)
      .set({ position: { ...(widget.position as object), order: index } })
      .where(eq(schema.dashboardWidgets.id, widget.id));
  }
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function setGoal(input: {
  metricId: string;
  target: number;
  period: (typeof GOAL_PERIODS)[number];
}): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const parsed = z
    .object({
      metricId: z.string().min(1),
      target: z.number().positive().finite(),
      period: z.enum(GOAL_PERIODS),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a positive target." };

  const [metric] = await db()
    .select({ id: schema.metrics.id })
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, parsed.data.metricId), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) return { ok: false, error: "Metric not found" };

  // One goal per metric in v1: replace any existing.
  await db().delete(schema.goals).where(eq(schema.goals.metricId, metric.id));
  await db()
    .insert(schema.goals)
    .values({ metricId: metric.id, target: String(parsed.data.target), period: parsed.data.period });
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function removeGoal(metricId: string): Promise<ActionResult> {
  const workspace = await currentWorkspace();
  const [metric] = await db()
    .select({ id: schema.metrics.id })
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, metricId), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) return { ok: false, error: "Metric not found" };
  await db().delete(schema.goals).where(eq(schema.goals.metricId, metric.id));
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** Widgets + metric info + goals for the default dashboard, in order. */
export async function loadDashboard(workspaceId: string) {
  const dashboard = await ensureDefaultDashboard(workspaceId);
  const rows = await db()
    .select({
      id: schema.dashboardWidgets.id,
      widgetType: schema.dashboardWidgets.widgetType,
      position: schema.dashboardWidgets.position,
      metricId: schema.metrics.id,
      metricName: schema.metrics.name,
      definition: schema.metrics.definition,
      goalTarget: schema.goals.target,
      goalPeriod: schema.goals.period,
    })
    .from(schema.dashboardWidgets)
    .innerJoin(schema.metrics, eq(schema.metrics.id, schema.dashboardWidgets.metricId))
    .leftJoin(schema.goals, eq(schema.goals.metricId, schema.metrics.id))
    .where(eq(schema.dashboardWidgets.dashboardId, dashboard.id))
    .orderBy(asc(sql`(${schema.dashboardWidgets.position}->>'order')::int`));
  return rows.map((r) => ({
    id: r.id,
    widgetType: r.widgetType,
    size: ((r.position as { size?: number })?.size === 2 ? 2 : 1) as 1 | 2,
    metricId: r.metricId,
    metricName: r.metricName,
    isRatio: (r.definition as { type?: string })?.type === "ratio",
    goal: r.goalTarget ? { target: Number(r.goalTarget), period: r.goalPeriod! } : null,
  }));
}
