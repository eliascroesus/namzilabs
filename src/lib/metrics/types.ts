import { z } from "zod";

/**
 * Metadata keys and event types come from user-influenced data, so they are
 * validated to a safe charset AND always bound as SQL parameters — never
 * interpolated. The charset check is defense in depth, not the only guard.
 */
const safeKey = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_. -]+$/);

export const filterSchema = z.object({
  field: z.union([
    z.literal("contact_email"),
    z.literal("provider"),
    z.literal("amount"),
    z.string().regex(/^metadata\.[a-zA-Z0-9_. -]{1,80}$/),
  ]),
  op: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "exists",
    "gt",
    "lt",
  ]),
  value: z.union([z.string().max(500), z.number()]).optional(),
});
export type Filter = z.infer<typeof filterSchema>;

export const eventMetricSchema = z.object({
  type: z.literal("event").default("event"),
  source: z.object({
    connectionIds: z.union([z.literal("all"), z.array(z.string().uuid().or(safeKey)).min(1)]),
    eventTypes: z.array(safeKey).min(1),
  }),
  filters: z.array(filterSchema).max(10).default([]),
  aggregation: z.discriminatedUnion("type", [
    z.object({ type: z.literal("count") }),
    z.object({ type: z.literal("unique_count"), field: z.enum(["contact_email", "external_id"]) }),
    z.object({
      type: z.literal("sum"),
      field: z.union([z.literal("amount"), z.string().regex(/^metadata\.[a-zA-Z0-9_. -]{1,80}$/)]),
    }),
    z.object({
      type: z.literal("average"),
      field: z.union([z.literal("amount"), z.string().regex(/^metadata\.[a-zA-Z0-9_. -]{1,80}$/)]),
    }),
  ]),
  /** Display hint: how the number is formatted in the UI. */
  unit: z.enum(["number", "currency", "percent"]).optional(),
  /** Graph colour token (hex) chosen in the builder. */
  color: z.string().max(9).optional(),
});
export type EventMetricDefinition = z.infer<typeof eventMetricSchema>;

/**
 * Ratio metrics reference two EVENT metrics by id (one level only — a ratio
 * of ratios is rejected at run time, which also makes cycles impossible).
 */
export const ratioMetricSchema = z.object({
  type: z.literal("ratio"),
  numeratorMetricId: z.string().min(1),
  denominatorMetricId: z.string().min(1),
  format: z.literal("percent").default("percent"),
});
export type RatioMetricDefinition = z.infer<typeof ratioMetricSchema>;

export const metricDefinitionSchema = z.union([eventMetricSchema, ratioMetricSchema]);
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

export const GRAINS = ["hour", "day", "week", "month"] as const;
export type Grain = (typeof GRAINS)[number];

export type MetricRange = { from: Date; to: Date };

export type MetricResult = {
  total: number | null;
  series: { bucket: string; value: number | null }[];
  /** Set for ratio metrics so the UI formats as a percentage. */
  format?: "percent";
};
