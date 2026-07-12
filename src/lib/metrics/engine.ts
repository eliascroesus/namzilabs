import { eq, and, inArray } from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  metricDefinitionSchema,
  GRAINS,
  type EventMetricDefinition,
  type Grain,
  type MetricDefinition,
  type MetricRange,
  type MetricResult,
} from "@/lib/metrics/types";

const TZ_RE = /^[A-Za-z0-9_+\-/:]{1,50}$/;

/**
 * Compiles a validated metric definition to one parameterized SQL query.
 * Injection safety, layered:
 *  1. definitions are Zod-validated (field names from closed unions,
 *     metadata keys charset-checked),
 *  2. every user-influenced VALUE (event types, connection ids, metadata
 *     keys, filter values, timezone) is bound as a parameter,
 *  3. the only inlined token is the grain, checked against the GRAINS enum.
 */

function aggregateSql(agg: EventMetricDefinition["aggregation"]): SQL {
  switch (agg.type) {
    case "count":
      return sql`count(*)::float8`;
    case "unique_count":
      return agg.field === "contact_email"
        ? sql`count(distinct ${schema.events.contactEmail})::float8`
        : sql`count(distinct ${schema.events.externalId})::float8`;
    case "sum":
    case "average": {
      const fn = agg.type === "sum" ? sql`sum` : sql`avg`;
      if (agg.field === "amount") {
        return sql`${fn}(${schema.events.amount})::float8`;
      }
      const key = agg.field.slice("metadata.".length);
      // Non-numeric metadata values are ignored rather than erroring.
      return sql`${fn}(case when ${schema.events.metadata}->>${key} ~ '^-?[0-9]+\\.?[0-9]*$' then (${schema.events.metadata}->>${key})::numeric end)::float8`;
    }
  }
}

const NUMERIC_RE = /^-?[0-9]+\.?[0-9]*$/;

function filterSql(filters: EventMetricDefinition["filters"]): SQL[] {
  const out: SQL[] = [];
  for (const f of filters) {
    const isAmount = f.field === "amount";
    // The amount column is numeric; everything else compares as text.
    const column = isAmount
      ? sql`${schema.events.amount}::text`
      : f.field.startsWith("metadata.")
        ? sql`${schema.events.metadata}->>${f.field.slice("metadata.".length)}`
        : f.field === "contact_email"
          ? sql`${schema.events.contactEmail}`
          : sql`${schema.events.provider}`;
    const value = f.value === undefined ? null : String(f.value);

    switch (f.op) {
      case "equals":
        if (isAmount) {
          if (value === null || !NUMERIC_RE.test(value)) throw new Error("Amount filters need a number");
          out.push(sql`${schema.events.amount} = ${value}::numeric`);
        } else {
          out.push(sql`${column} = ${value}`);
        }
        break;
      case "not_equals":
        out.push(sql`(${column} is distinct from ${value})`);
        break;
      case "contains":
        out.push(sql`${column} ilike ${"%" + (value ?? "") + "%"}`);
        break;
      case "not_contains":
        // Null-inclusive: a missing field genuinely doesn't contain the value.
        out.push(sql`(${column} is null or ${column} not ilike ${"%" + (value ?? "") + "%"})`);
        break;
      case "starts_with":
        out.push(sql`${column} ilike ${(value ?? "") + "%"}`);
        break;
      case "exists":
        out.push(sql`${column} is not null`);
        break;
      case "gt":
      case "lt": {
        if (value === null || !NUMERIC_RE.test(value)) {
          throw new Error("Greater/less-than filters need a number");
        }
        const cmp = f.op === "gt" ? sql`>` : sql`<`;
        if (isAmount) {
          out.push(sql`${schema.events.amount} ${cmp} ${value}::numeric`);
        } else {
          out.push(
            sql`(${column} ~ '^-?[0-9]+\\.?[0-9]*$' and (${column})::numeric ${cmp} ${value}::numeric)`,
          );
        }
        break;
      }
    }
  }
  return out;
}

/** IN-list with each value bound as its own parameter. */
function inList(column: SQL, values: string[]): SQL {
  return sql`${column} in (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
}

function whereSql(def: EventMetricDefinition, workspaceId: string, range: MetricRange): SQL {
  const conditions: SQL[] = [
    sql`${schema.events.workspaceId} = ${workspaceId}`,
    inList(sql`${schema.events.eventType}`, def.source.eventTypes),
    sql`${schema.events.occurredAt} >= ${range.from}`,
    sql`${schema.events.occurredAt} < ${range.to}`,
  ];
  if (def.source.connectionIds !== "all") {
    conditions.push(inList(sql`${schema.events.connectionId}`, def.source.connectionIds));
  }
  conditions.push(...filterSql(def.filters));
  return sql.join(conditions, sql` and `);
}

type Row = Record<string, unknown>;
async function execRows(query: SQL): Promise<Row[]> {
  const res = await db().execute(query);
  return ((res as { rows?: Row[] }).rows ?? (res as unknown as Row[])) as Row[];
}

async function runEventMetric(
  def: EventMetricDefinition,
  workspaceId: string,
  range: MetricRange,
  grain: Grain,
  timezone: string,
): Promise<MetricResult> {
  const tz = TZ_RE.test(timezone) ? timezone : "UTC";
  const grainSql = sql.raw(`'${GRAINS.includes(grain) ? grain : "day"}'`);
  const agg = aggregateSql(def.aggregation);
  const where = whereSql(def, workspaceId, range);

  // Bucket in the workspace's local time; occurred_at is stored as UTC.
  const bucketExpr = sql`date_trunc(${grainSql}, ${schema.events.occurredAt} at time zone 'UTC' at time zone ${tz})`;

  const [totalRows, seriesRows] = await Promise.all([
    execRows(sql`select ${agg} as value from ${schema.events} where ${where}`),
    execRows(
      sql`select to_char(${bucketExpr}, 'YYYY-MM-DD"T"HH24:MI:SS') as bucket, ${agg} as value
          from ${schema.events} where ${where} group by 1 order by 1`,
    ),
  ]);

  const rawTotal = totalRows[0]?.value;
  return {
    total: rawTotal === null || rawTotal === undefined ? null : Number(rawTotal),
    series: seriesRows.map((r) => ({
      bucket: String(r.bucket),
      value: r.value === null ? null : Number(r.value),
    })),
  };
}

async function loadEventDefinition(
  metricId: string,
  workspaceId: string,
): Promise<EventMetricDefinition> {
  const [row] = await db()
    .select()
    .from(schema.metrics)
    .where(and(eq(schema.metrics.id, metricId), eq(schema.metrics.workspaceId, workspaceId)));
  if (!row) throw new Error("Referenced metric not found");
  const parsed = metricDefinitionSchema.parse(row.definition);
  if (parsed.type === "ratio") {
    throw new Error("Ratio metrics can only combine event metrics, not other ratios");
  }
  return parsed;
}

export async function runMetric(
  definition: MetricDefinition | unknown,
  workspaceId: string,
  range: MetricRange,
  grain: Grain,
): Promise<MetricResult> {
  const def = metricDefinitionSchema.parse(definition);

  const [ws] = await db()
    .select({ timezone: schema.workspaces.timezone })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  const timezone = ws?.timezone ?? "UTC";

  if (def.type === "ratio") {
    if (def.numeratorMetricId === def.denominatorMetricId) {
      throw new Error("A ratio needs two different metrics");
    }
    const [num, den] = await Promise.all([
      loadEventDefinition(def.numeratorMetricId, workspaceId),
      loadEventDefinition(def.denominatorMetricId, workspaceId),
    ]);
    const [numRes, denRes] = await Promise.all([
      runEventMetric(num, workspaceId, range, grain, timezone),
      runEventMetric(den, workspaceId, range, grain, timezone),
    ]);
    const denByBucket = new Map(denRes.series.map((p) => [p.bucket, p.value]));
    const buckets = [...new Set([...numRes.series, ...denRes.series].map((p) => p.bucket))].sort();
    const numByBucket = new Map(numRes.series.map((p) => [p.bucket, p.value]));
    return {
      total:
        numRes.total !== null && denRes.total ? (numRes.total / denRes.total) * 100 : null,
      series: buckets.map((bucket) => {
        const n = numByBucket.get(bucket) ?? 0;
        const d = denByBucket.get(bucket);
        return { bucket, value: d ? ((n ?? 0) / d) * 100 : null };
      }),
      format: "percent",
    };
  }

  return runEventMetric(def, workspaceId, range, grain, timezone);
}

/** Grain that reads well for a given range span. */
export function grainForRange(range: MetricRange): Grain {
  const spanMs = range.to.getTime() - range.from.getTime();
  if (spanMs <= 2 * 86_400_000) return "hour";
  if (spanMs <= 92 * 86_400_000) return "day";
  return "week";
}

/** Recent raw matching events for table widgets. */
export async function recentEvents(
  definition: MetricDefinition | unknown,
  workspaceId: string,
  range: MetricRange,
  limit = 10,
) {
  const def = metricDefinitionSchema.parse(definition);
  if (def.type === "ratio") return [];
  const where = whereSql(def, workspaceId, range);
  return db()
    .select({
      id: schema.events.id,
      eventType: schema.events.eventType,
      contactEmail: schema.events.contactEmail,
      contactName: schema.events.contactName,
      amount: schema.events.amount,
      occurredAt: schema.events.occurredAt,
    })
    .from(schema.events)
    .where(and(sql`${where}`, inArray(schema.events.eventType, def.source.eventTypes)))
    .orderBy(sql`${schema.events.occurredAt} desc`)
    .limit(limit);
}
