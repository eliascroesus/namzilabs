import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { eventMetricSchema } from "@/lib/metrics/types";
import { PageHeader } from "@/components/shared/page-header";
import { getEventTypeOptions } from "../../actions";
import { MetricBuilder } from "../../metric-builder";

export const metadata = { title: "Edit metric" };

export default async function EditMetricPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const [metric] = await db()
    .select()
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, id), eq(schema.metrics.workspaceId, workspace.id)));
  if (!metric) notFound();

  const parsed = eventMetricSchema.safeParse(metric.definition);
  // Ratio metrics are edited by recreating them — redirect to the ratio builder.
  if (!parsed.success) redirect("/metrics/new-ratio");

  const options = await getEventTypeOptions();
  return (
    <>
      <PageHeader title={`Edit “${metric.name}”`} description="Changes apply everywhere this metric is used." />
      <MetricBuilder
        options={options.ok ? options.data : []}
        initial={{ id: metric.id, name: metric.name, definition: parsed.data }}
      />
    </>
  );
}
