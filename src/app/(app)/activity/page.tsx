import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ActivityIcon } from "lucide-react";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { eventTypeLabel } from "@/lib/event-labels";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProviderTile } from "@/components/shared/provider-tile";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RefreshButton } from "./refresh-button";

export const metadata = { title: "Activity Feed" };

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const rows = await db()
    .select({
      id: schema.events.id,
      provider: schema.events.provider,
      eventType: schema.events.eventType,
      contactEmail: schema.events.contactEmail,
      contactName: schema.events.contactName,
      amount: schema.events.amount,
      occurredAt: schema.events.occurredAt,
      connectionName: schema.connections.name,
    })
    .from(schema.events)
    .innerJoin(schema.connections, eq(schema.connections.id, schema.events.connectionId))
    .where(eq(schema.events.workspaceId, workspace.id))
    .orderBy(desc(schema.events.occurredAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Activity Feed"
        description="Every event from every connected tool, newest first."
        action={<RefreshButton />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Events appear here the moment a connected tool sends one."
          action={
            <Button asChild>
              <Link href="/integrations">Connect a tool</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(e) => e.id}
          columns={[
            {
              key: "source",
              header: "Source",
              render: (e) => (
                <span className="flex items-center gap-2">
                  <ProviderTile provider={e.provider} size="sm" />
                  <span className="text-muted-foreground">{e.connectionName}</span>
                </span>
              ),
            },
            { key: "event", header: "Event", render: (e) => <span className="font-medium">{eventTypeLabel(e.eventType)}</span> },
            { key: "who", header: "Contact", render: (e) => e.contactEmail ?? e.contactName ?? "—" },
            { key: "amount", header: "Amount", render: (e) => (e.amount ? `$${e.amount}` : "—") },
            {
              key: "when",
              header: "When",
              render: (e) =>
                e.occurredAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
            },
          ]}
        />
      )}
    </>
  );
}
