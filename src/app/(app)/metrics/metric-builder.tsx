"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart } from "@/components/charts/bar-chart";
import { formatValue } from "@/components/charts/chart-utils";
import { ProviderTile } from "@/components/shared/provider-tile";
import { describeDefinition } from "@/lib/metrics/describe";
import type { EventMetricDefinition, Filter } from "@/lib/metrics/types";
import type { Provider } from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  getFilterFields,
  getMetadataValues,
  saveMetric,
  type EventTypeOption,
  type FilterFieldOption,
} from "./actions";
import { addWidget } from "../dashboard/actions";
import { RecordInspector } from "./record-inspector";

const AGG_CARDS = [
  { value: "count", title: "Count", hint: "How many times this happened" },
  { value: "unique_count", title: "Unique", hint: "Distinct people or records, each counted once" },
  { value: "sum", title: "Sum", hint: "Add up any numeric field (revenue, deal size, totals…)" },
  { value: "average", title: "Average", hint: "Mean of any numeric field" },
] as const;

const OPS = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "starts_with", label: "starts with" },
  { value: "exists", label: "exists" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
] as const;

type PreviewData = {
  total: number | null;
  series: { bucket: string; value: number | null }[];
  format?: "percent";
  grain: string;
  error?: string;
};

export function MetricBuilder({
  options,
  initial,
}: {
  options: EventTypeOption[];
  initial: { id: string; name: string; definition: EventMetricDefinition } | null;
}) {
  const router = useRouter();
  const initialAgg = initial?.definition.aggregation;
  const [eventTypes, setEventTypes] = React.useState<string[]>(
    initial?.definition.source.eventTypes ?? [],
  );
  const [filters, setFilters] = React.useState<Filter[]>(initial?.definition.filters ?? []);
  const [aggType, setAggType] = React.useState<string>(initialAgg?.type ?? "count");
  const [aggField, setAggField] = React.useState<string>(
    initialAgg && (initialAgg.type === "sum" || initialAgg.type === "average")
      ? initialAgg.field
      : "amount",
  );
  const [uniqueField, setUniqueField] = React.useState<"contact_email" | "external_id">(
    initialAgg?.type === "unique_count" ? initialAgg.field : "contact_email",
  );
  const [name, setName] = React.useState(initial?.name ?? "");
  const [nameTouched, setNameTouched] = React.useState(Boolean(initial));
  const [fields, setFields] = React.useState<FilterFieldOption[]>([]);
  const [valueOptions, setValueOptions] = React.useState<Record<string, string[]>>({});
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Group catalog by connection for the picker cards.
  const groups = React.useMemo(() => {
    const byConnection = new Map<string, { name: string; provider: string; items: EventTypeOption[] }>();
    for (const opt of options) {
      const g = byConnection.get(opt.connectionId) ?? { name: opt.connectionName, provider: opt.provider, items: [] };
      g.items.push(opt);
      byConnection.set(opt.connectionId, g);
    }
    return [...byConnection.values()];
  }, [options]);

  const definition: EventMetricDefinition | null = React.useMemo(() => {
    if (eventTypes.length === 0) return null;
    const aggregation =
      aggType === "count"
        ? { type: "count" as const }
        : aggType === "unique_count"
          ? { type: "unique_count" as const, field: uniqueField }
          : { type: aggType as "sum" | "average", field: aggField as "amount" };
    return {
      type: "event",
      source: { connectionIds: "all", eventTypes },
      filters: filters.filter((f) => f.op === "exists" || f.value !== undefined),
      aggregation,
    };
  }, [eventTypes, filters, aggType, aggField, uniqueField]);

  // Live preview: debounce, last 30 days.
  React.useEffect(() => {
    if (!definition) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/metrics/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            definition,
            from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
            to: new Date().toISOString(),
            grain: "day",
          }),
        });
        const data = await res.json();
        setPreview(res.ok ? data : { total: null, series: [], grain: "day", error: data.error });
      } catch {
        /* aborted or offline — keep last preview */
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [definition]);

  // Filterable fields follow the selected event types: declared connector
  // fields + Sheets column headers + keys sampled from real data.
  React.useEffect(() => {
    if (eventTypes.length === 0) return;
    getFilterFields(eventTypes).then((res) => res.ok && setFields(res.data));
  }, [eventTypes]);

  const suggestName = React.useCallback(
    (types: string[], agg: string) => {
      if (nameTouched || types.length === 0) return;
      const first = options.find((o) => o.eventType === types[0])?.label ?? types[0];
      const prefix = agg === "sum" ? "Total " : agg === "average" ? "Average " : agg === "unique_count" ? "Unique " : "";
      setName(`${prefix}${first}${types.length > 1 ? " +" : ""}`.trim());
    },
    [nameTouched, options],
  );

  const toggleEventType = (t: string) => {
    const next = eventTypes.includes(t) ? eventTypes.filter((x) => x !== t) : [...eventTypes, t];
    setEventTypes(next);
    suggestName(next, aggType);
  };

  const loadValues = async (key: string) => {
    if (!key.startsWith("metadata.") || valueOptions[key]) return;
    const res = await getMetadataValues(eventTypes, key.slice(9));
    if (res.ok) setValueOptions((prev) => ({ ...prev, [key]: res.data }));
  };

  const save = async () => {
    if (!definition) return;
    setSaving(true);
    const res = await saveMetric({ id: initial?.id ?? null, name, definition });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(initial ? "Metric updated" : "Metric saved", {
      action: {
        label: "Add to dashboard",
        onClick: async () => {
          const widget = await addWidget({ metricId: res.data.metricId, widgetType: "number" });
          if (widget.ok) router.push("/dashboard");
        },
      },
    });
    router.push("/metrics");
  };

  const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      {/* Left: the steps */}
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="font-medium">1. What do you want to measure?</h2>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tools connected yet —{" "}
              <Link href="/integrations" className="underline">
                connect your first tool
              </Link>
              , then come back here.
            </p>
          ) : (
            groups.map((group) => {
              const connectionId = group.items[0]?.connectionId;
              return (
                <div key={group.name} className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ProviderTile provider={group.provider as Provider} size="sm" />
                    {group.name}
                    {connectionId ? (
                      <RecordInspector connectionId={connectionId} connectionName={group.name} />
                    ) : null}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((opt) => {
                      const selected = eventTypes.includes(opt.eventType);
                      return (
                        <button
                          key={`${opt.connectionId}-${opt.eventType}`}
                          type="button"
                          onClick={() => toggleEventType(opt.eventType)}
                          className={cn(
                            "flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors",
                            selected ? "border-primary ring-1 ring-primary" : "hover:bg-secondary",
                          )}
                        >
                          <span>
                            <span className="font-medium">{opt.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {opt.count > 0 ? `${opt.count} events` : "no events yet — counts once data arrives"}
                            </span>
                          </span>
                          {selected ? <CheckIcon className="size-4 text-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {eventTypes.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-medium">2. Narrow it down <span className="font-normal text-muted-foreground">(optional)</span></h2>
            {filters.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  className={selectCls}
                  value={f.field}
                  onChange={(e) => {
                    const field = e.target.value as Filter["field"];
                    setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, field } : x)));
                    loadValues(field);
                  }}
                >
                  <optgroup label="Built-in">
                    {fields.filter((o) => o.group === "Built-in").map((o) => (
                      <option key={o.field} value={o.field}>{o.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Fields from your data">
                    {fields.filter((o) => o.group !== "Built-in").map((o) => (
                      <option key={o.field} value={o.field}>{o.label}</option>
                    ))}
                  </optgroup>
                </select>
                <select
                  className={selectCls}
                  value={f.op}
                  onChange={(e) =>
                    setFilters((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, op: e.target.value as Filter["op"] } : x)),
                    )
                  }
                >
                  {OPS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                {f.op !== "exists" ? (
                  <>
                    <Input
                      className="h-9 w-44"
                      list={`values-${i}`}
                      value={String(f.value ?? "")}
                      onFocus={() => loadValues(f.field)}
                      onChange={(e) =>
                        setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder="value"
                    />
                    <datalist id={`values-${i}`}>
                      {(valueOptions[f.field] ?? []).map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove filter"
                  onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => [...prev, { field: "contact_email", op: "contains", value: "" }])}
            >
              <PlusIcon /> Add filter
            </Button>
          </section>
        ) : null}

        {eventTypes.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-medium">3. How should it be measured?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {AGG_CARDS.map((card) => (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => {
                    setAggType(card.value);
                    suggestName(eventTypes, card.value);
                  }}
                  className={cn(
                    "rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors",
                    aggType === card.value ? "border-primary ring-1 ring-primary" : "hover:bg-secondary",
                  )}
                >
                  <span className="font-medium">{card.title}</span>
                  <span className="block text-xs text-muted-foreground">{card.hint}</span>
                </button>
              ))}
            </div>
            {aggType === "sum" || aggType === "average" ? (
              <div className="max-w-xs space-y-1">
                <Label>{aggType === "sum" ? "Sum" : "Average"} of which field?</Label>
                <select className={cn(selectCls, "w-full")} value={aggField} onChange={(e) => setAggField(e.target.value)}>
                  <option value="amount">Amount</option>
                  {fields
                    .filter((o) => o.group !== "Built-in")
                    .map((o) => (
                      <option key={o.field} value={o.field}>{o.label}</option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Non-numeric values in the field are ignored automatically.
                </p>
              </div>
            ) : null}
            {aggType === "unique_count" ? (
              <div className="max-w-xs space-y-1">
                <Label>Unique by</Label>
                <select
                  className={cn(selectCls, "w-full")}
                  value={uniqueField}
                  onChange={(e) => setUniqueField(e.target.value as "contact_email" | "external_id")}
                >
                  <option value="contact_email">Contact (each person once)</option>
                  <option value="external_id">Record (each record once)</option>
                </select>
              </div>
            ) : null}
            {eventTypes.some((t) => t.endsWith("_daily")) && aggType === "count" ? (
              <p className="text-xs text-amber-500">
                Heads up: daily-total events carry their count in the amount field — pick “Sum” of Amount to get real totals.
              </p>
            ) : null}
          </section>
        ) : null}

        {eventTypes.length > 0 ? (
          <section className="max-w-md space-y-3">
            <h2 className="font-medium">4. Name it</h2>
            <div className="space-y-2">
              <Label htmlFor="metricName">Metric name</Label>
              <Input
                id="metricName"
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
            </div>
            <Button onClick={save} disabled={saving || !name.trim() || !definition}>
              {saving ? "Saving…" : initial ? "Save changes" : "Save metric"}
            </Button>
          </section>
        ) : null}
      </div>

      {/* Right: live preview */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Live preview · last 30 days</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!definition ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Pick an event type to see your real numbers here.
              </p>
            ) : preview?.error ? (
              <p className="py-10 text-center text-sm text-destructive">{preview.error}</p>
            ) : preview ? (
              <div className="space-y-4">
                <p className="text-4xl font-semibold tabular-nums">
                  {formatValue(preview.total, preview.format)}
                </p>
                <BarChart series={preview.series} grain={preview.grain} format={preview.format} height={160} />
                <p className="text-xs text-muted-foreground">{describeDefinition(definition)}</p>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Computing…</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
