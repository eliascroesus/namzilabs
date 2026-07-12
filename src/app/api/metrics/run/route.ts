import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import { grainForRange, recentEvents, runMetric } from "@/lib/metrics/engine";
import { GRAINS, metricDefinitionSchema } from "@/lib/metrics/types";

const bodySchema = z
  .object({
    metricId: z.string().optional(),
    definition: z.unknown().optional(),
    from: z.coerce.date(),
    to: z.coerce.date(),
    grain: z.enum(GRAINS).optional(),
    compare: z.boolean().default(false),
    includeEvents: z.boolean().default(false),
  })
  .refine((b) => b.metricId || b.definition, { message: "metricId or definition required" });

/**
 * Runs a metric (saved by id, or an unsaved definition for builder preview)
 * over a range. Powers every dashboard widget and the live preview.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 },
    );
  }

  let definition: unknown = body.definition;
  if (body.metricId) {
    const [metric] = await db()
      .select()
      .from(schema.metrics)
      .where(and(eq(schema.metrics.id, body.metricId), eq(schema.metrics.workspaceId, workspace.id)));
    if (!metric) return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    definition = metric.definition;
  }

  const range = { from: body.from, to: body.to };
  const grain = body.grain ?? grainForRange(range);

  try {
    // Unsaved definitions are validated here before touching the engine.
    const parsed = metricDefinitionSchema.parse(definition);
    const result = await runMetric(parsed, workspace.id, range, grain);

    let previousTotal: number | null | undefined;
    if (body.compare) {
      const span = range.to.getTime() - range.from.getTime();
      const prev = await runMetric(
        parsed,
        workspace.id,
        { from: new Date(range.from.getTime() - span), to: range.from },
        grain,
      );
      previousTotal = prev.total;
    }

    const events = body.includeEvents
      ? await recentEvents(parsed, workspace.id, range, 10)
      : undefined;

    return NextResponse.json({ ...result, grain, previousTotal, events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 300) : "Could not run metric" },
      { status: 400 },
    );
  }
}
