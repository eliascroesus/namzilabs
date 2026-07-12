import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { loadDashboard } from "./actions";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const [widgets, [{ connectionCount }], metrics] = await Promise.all([
    loadDashboard(workspace.id),
    db()
      .select({ connectionCount: sql<number>`count(*)::int` })
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.workspaceId, workspace.id),
          ne(schema.connections.status, "deleted"),
        ),
      ),
    db()
      .select({ id: schema.metrics.id, name: schema.metrics.name, definition: schema.metrics.definition })
      .from(schema.metrics)
      .where(eq(schema.metrics.workspaceId, workspace.id)),
  ]);

  return (
    <DashboardClient
      widgets={widgets}
      metrics={metrics.map((m) => ({
        id: m.id,
        name: m.name,
        isRatio: (m.definition as { type?: string })?.type === "ratio",
      }))}
      checklist={{
        hasConnection: connectionCount > 0,
        hasMetric: metrics.length > 0,
        hasWidget: widgets.length > 0,
      }}
    />
  );
}
