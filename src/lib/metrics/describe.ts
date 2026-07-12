import { eventTypeLabel } from "@/lib/event-labels";
import type { MetricDefinition } from "@/lib/metrics/types";

const AGG_LABEL: Record<string, string> = {
  count: "Count of",
  unique_count: "Unique people from",
  sum: "Sum of amount across",
  average: "Average amount across",
};

/** Plain-English summary shown in the builder and the metric list. */
export function describeDefinition(
  def: MetricDefinition,
  metricNames?: Map<string, string>,
): string {
  if (def.type === "ratio") {
    const num = metricNames?.get(def.numeratorMetricId) ?? "one metric";
    const den = metricNames?.get(def.denominatorMetricId) ?? "another";
    return `${num} as a percentage of ${den}`;
  }
  const types = def.source.eventTypes.map(eventTypeLabel).join(" + ");
  const agg = AGG_LABEL[def.aggregation.type] ?? "Count of";
  const filters = def.filters
    .map((f) => {
      const field = f.field.startsWith("metadata.") ? f.field.slice(9) : f.field.replace("_", " ");
      switch (f.op) {
        case "exists":
          return `${field} exists`;
        case "contains":
          return `${field} contains “${f.value}”`;
        case "not_equals":
          return `${field} isn't “${f.value}”`;
        case "gt":
          return `${field} > ${f.value}`;
        case "lt":
          return `${field} < ${f.value}`;
        default:
          return `${field} is “${f.value}”`;
      }
    })
    .join(" and ");
  return `${agg} ${types}${filters ? ` where ${filters}` : ""}`;
}
