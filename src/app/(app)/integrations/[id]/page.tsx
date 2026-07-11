import { notFound } from "next/navigation";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { ProviderTile } from "@/components/shared/provider-tile";
import { Sparkline } from "@/components/shared/sparkline";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectionActions } from "./connection-actions";

export const metadata = { title: "Connection" };

function fmt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, id), ne(schema.connections.status, "deleted")));
  if (!conn) notFound();
  await requireWorkspace(conn.workspaceId);

  const sevenDaysAgo = new Date(Date.now() - 6 * 86_400_000);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [daily, latest, [{ failedCount }]] = await Promise.all([
    db()
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.events.occurredAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.events)
      .where(and(eq(schema.events.connectionId, conn.id), gte(schema.events.occurredAt, sevenDaysAgo)))
      .groupBy(sql`1`),
    db()
      .select()
      .from(schema.events)
      .where(eq(schema.events.connectionId, conn.id))
      .orderBy(desc(schema.events.occurredAt))
      .limit(50),
    db()
      .select({ failedCount: sql<number>`count(*)::int` })
      .from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.connectionId, conn.id), eq(schema.rawEvents.status, "failed"))),
  ]);

  const byDay = new Map(daily.map((d) => [d.day, d.count]));
  const points = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: byDay.get(key) ?? 0,
    };
  });
  const weekTotal = points.reduce((sum, p) => sum + p.value, 0);
  const quiet =
    conn.status === "active" &&
    (!conn.lastEventAt || Date.now() - conn.lastEventAt.getTime() > 48 * 60 * 60 * 1000);

  return (
    <>
      <PageHeader
        title={conn.name}
        description={undefined}
        action={<ConnectionActions connectionId={conn.id} status={conn.status} hasFailures={failedCount > 0} />}
      />

      <div className="mb-6 flex items-center gap-3">
        <ProviderTile provider={conn.provider} size="sm" />
        {conn.status === "active" && <Badge variant="success">Active</Badge>}
        {conn.status === "paused" && <Badge variant="secondary">Paused</Badge>}
        {conn.status === "error" && <Badge variant="destructive">Error</Badge>}
        {conn.status === "pending" && <Badge variant="outline">Setup incomplete</Badge>}
        {quiet ? (
          <span className="text-sm text-muted-foreground">No events for 48h+ — is the source tool active?</span>
        ) : null}
      </div>

      {conn.status === "error" && conn.errorMessage ? (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {conn.errorMessage}
          {failedCount > 0 ? ` · ${failedCount} raw event${failedCount === 1 ? "" : "s"} awaiting reprocess.` : ""}
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events · last 7 days" value={String(weekTotal)} />
        <StatCard label="Last event" value={fmt(conn.lastEventAt)} />
        <StatCard label="Failed payloads" value={String(failedCount)} hint={failedCount > 0 ? "Use Reprocess after a fix" : undefined} />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Daily volume</p>
            <div className="mt-3">
              <Sparkline points={points} ariaLabel={`Events per day over the last 7 days, total ${weekTotal}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Latest events</h2>
      <DataTable
        rows={latest}
        rowKey={(e) => e.id}
        emptyMessage="No events yet — they appear here the moment the source tool sends one."
        columns={[
          { key: "type", header: "Event", render: (e) => <span className="font-medium">{e.eventType}</span> },
          { key: "who", header: "Contact", render: (e) => e.contactEmail ?? e.contactName ?? "—" },
          { key: "amount", header: "Amount", render: (e) => (e.amount ? `$${e.amount}` : "—") },
          { key: "when", header: "Occurred", render: (e) => fmt(e.occurredAt) },
        ]}
      />
    </>
  );
}
