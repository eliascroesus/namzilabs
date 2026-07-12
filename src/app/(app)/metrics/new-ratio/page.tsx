import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { RatioBuilder } from "./ratio-builder";

export const metadata = { title: "Combine two metrics" };

export default async function NewRatioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const rows = await db()
    .select({ id: schema.metrics.id, name: schema.metrics.name, definition: schema.metrics.definition })
    .from(schema.metrics)
    .where(eq(schema.metrics.workspaceId, workspace.id))
    .orderBy(desc(schema.metrics.createdAt));

  // Only event metrics can feed a ratio (one level, no cycles).
  const eventMetrics = rows
    .filter((r) => (r.definition as { type?: string })?.type !== "ratio")
    .map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      <PageHeader
        title="Combine two metrics"
        description="A percentage of one metric over another — reply rates, show rates, close rates."
      />
      <RatioBuilder metrics={eventMetrics} />
    </>
  );
}
