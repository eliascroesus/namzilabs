"use client";

import * as React from "react";
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
  getMetadataKeys,
  getMetadataValues,
  saveMetric,
  type EventTypeOption,
} from "./actions";
import { addWidget } from "../dashboard/actions";

const AGG_CARDS = [
  { value: "count", title: "Count", hint: "How many times this happened" },
  { value: "unique_count", title: "Unique people", hint: "Distinct contacts, each counted once" },
  { value: "sum", title: "Sum of amount", hint: "Add up the amount field (revenue, daily totals…)" },
  { value: "average", title: "Average amount", hint: "Mean of the amount field" },
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
  const [eventTypes, setEventTypes] = React.useState<string[]>(
    initial?.definition.source.eventTypes ?? [],
  );
  const [filters, setFilters] = React.useState<Filter[]>(initial?.definition.filters ?? []);
  const [aggType, setAggType] = React.useState<string>(initial?.definition.aggregation.type ?? "count");
  const [name, setName] = React.useState(initial?.name ?? "");
  const [nameTouched, setNameTouched] = React.useState(Boolean(initial));
  const [metadataKeys, setMetadataKeys] = React.useState<string[]>([]);
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
          ? { type: "unique_count" as const, field: "contact_email" as const }
          : { type: aggType as "sum" | "average", field: "amount" as const };
    return {
      type: "event",
      source: { connectionIds: "all", eventTypes },
      filters: filters.filter((f) => f.op === "exists" || f.value !== undefined),
      aggregation,
    };
  }, [eventTypes, filters, aggType]);

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

  // Metadata keys for the filter dropdown follow the selected event types.
  React.useEffect(() => {
    if (eventTypes.length === 0) return;
    getMetadataKeys(eventTypes).then((res) => res.ok && setMetadataKeys(res.data));
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
    setEventTypes((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      suggestName(next, aggType);
      return next;
    });
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
              No events yet — connect a tool first, then come back here.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ProviderTile provider={group.provider as Provider} size="sm" />
                  {group.name}
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
                          <span className="block text-xs text-muted-foreground">{opt.count} events</span>
                        </span>
                        {selected ? <CheckIcon className="size-4 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
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
                  <option value="contact_email">Contact email</option>
                  <option value="provider">Source tool</option>
                  {metadataKeys.map((k) => (
                    <option key={k} value={`metadata.${k}`}>{k}</option>
                  ))}
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
                  <option value="equals">is</option>
                  <option value="not_equals">is not</option>
                  <option value="contains">contains</option>
                  <option value="exists">exists</option>
                  <option value="gt">greater than</option>
                  <option value="lt">less than</option>
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
            {eventTypes.some((t) => t.endsWith("_daily")) && aggType === "count" ? (
              <p className="text-xs text-amber-700">
                Heads up: daily-total events carry their count in the amount field — pick “Sum of amount” to get real totals.
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
            <CardTitle className="text-sm text-muted-foreground">Live preview · last 30 days</CardTitle>
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
