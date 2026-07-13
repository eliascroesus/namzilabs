import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SigmaIcon } from "lucide-react";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { runMetric } from "@/lib/metrics/engine";
import { describeDefinition } from "@/lib/metrics/describe";
import { metricDefinitionSchema } from "@/lib/metrics/types";
import { formatValue } from "@/components/charts/chart-utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Sparkline } from "@/components/shared/sparkline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricRowActions } from "./metric-row-actions";

export const metadata = { title: "Metrics" };

export default async function MetricsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) redirect("/login");

  const metrics = await db()
    .select()
    .from(schema.metrics)
    .where(eq(schema.metrics.workspaceId, workspace.id))
    .orderBy(desc(schema.metrics.createdAt));

  const names = new Map(metrics.map((m) => [m.id, m.name]));
  const range = { from: new Date(Date.now() - 30 * 86_400_000), to: new Date() };

  const withData = await Promise.all(
    metrics.map(async (m) => {
      try {
        const parsed = metricDefinitionSchema.parse(m.definition);
        const result = await runMetric(parsed, workspace.id, range, "day");
        const unit =
          parsed.type === "ratio"
            ? ("percent" as const)
            : ((parsed.unit ?? "number") as "number" | "currency" | "percent");
        const color = parsed.type === "ratio" ? undefined : parsed.color;
        return { metric: m, description: describeDefinition(parsed, names), result, unit, color, error: null };
      } catch {
        return { metric: m, description: "Invalid definition", result: null, unit: "number" as const, color: undefined, error: "Could not compute" };
      }
    }),
  );

  const newButtons = (
    <div className="flex gap-2">
      <Button asChild variant="outline">
        <Link href="/metrics/new-ratio">Combine two metrics</Link>
      </Button>
      <Button asChild>
        <Link href="/metrics/new">New metric</Link>
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Metrics"
        description="Define what you want to measure — every widget on your dashboard starts here."
        action={metrics.length > 0 ? newButtons : undefined}
      />
      {metrics.length === 0 ? (
        <EmptyState
          icon={SigmaIcon}
          title="Create your first metric"
          description="Pick an event from your connected tools, add optional filters, choose how to measure it. Takes under a minute."
          action={newButtons}
        />
      ) : (
        <div className="space-y-3">
          {withData.map(({ metric, description, result, unit, color, error }) => {
            const points = (result?.series ?? []).slice(-14).map((p) => ({
              label: p.bucket.slice(0, 10),
              value: p.value ?? 0,
            }));
            return (
              <Card key={metric.id}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? "var(--color-primary)" }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/metrics/${metric.id}/edit`} className="font-medium hover:underline">
                      {metric.name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">{description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold tabular-nums">
                      {error ? "—" : formatValue(result!.total, result!.format ?? unit)}
                    </p>
                    <p className="text-xs text-muted-foreground">last 30 days</p>
                  </div>
                  {points.length > 0 ? (
                    <Sparkline points={points} barWidth={6} gap={2} height={32} ariaLabel={`${metric.name}, last 14 days`} />
                  ) : null}
                  <MetricRowActions metricId={metric.id} metricName={metric.name} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
