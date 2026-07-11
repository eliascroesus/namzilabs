import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { ALL_CONNECTORS } from "@/connectors";
import { PageHeader } from "@/components/shared/page-header";
import { ProviderTile } from "@/components/shared/provider-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Integrations" };

const QUIET_AFTER_MS = 48 * 60 * 60 * 1000;

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="outline">Setup incomplete</Badge>;
}

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const connections = await db()
    .select()
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.workspaceId, workspace.id),
        ne(schema.connections.status, "deleted"),
      ),
    )
    .orderBy(desc(schema.connections.createdAt));

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect a tool and its data starts flowing in under a minute."
      />

      {connections.length > 0 ? (
        <section className="mb-10 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Your connections</h2>
          {connections.map((conn) => {
            const quiet =
              conn.status === "active" &&
              (!conn.lastEventAt || Date.now() - conn.lastEventAt.getTime() > QUIET_AFTER_MS);
            return (
              <Link key={conn.id} href={`/integrations/${conn.id}`} className="block">
                <Card className="transition-colors hover:bg-secondary/50">
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <ProviderTile provider={conn.provider} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{conn.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {conn.status === "error" && conn.errorMessage
                          ? conn.errorMessage
                          : conn.lastEventAt
                            ? `Last event ${conn.lastEventAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                            : "No events received yet"}
                        {quiet ? " · quiet for 48h+" : ""}
                      </p>
                    </div>
                    <StatusBadge status={conn.status} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {connections.length > 0 ? "Connect another tool" : "Connect your first tool"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_CONNECTORS.map((c) => (
            <Card key={c.provider}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <ProviderTile provider={c.provider} />
                  <p className="font-medium">{c.label}</p>
                </div>
                <p className="flex-1 text-sm text-muted-foreground">{c.description}</p>
                <Button asChild variant="outline" size="sm" className="self-start">
                  <Link href={`/integrations/new/${c.provider}`}>Connect</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
