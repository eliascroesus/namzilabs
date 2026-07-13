"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRightIcon, DatabaseIcon, InfoIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineChart } from "@/components/charts/line-chart";
import { formatValue } from "@/components/charts/chart-utils";
import { describeDefinition } from "@/lib/metrics/describe";
import type { EventMetricDefinition, Filter } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";
import {
  getFilterFields,
  getMetadataValues,
  saveMetric,
  type EventTypeOption,
  type FilterFieldOption,
} from "./actions";
import { setGoal } from "../dashboard/actions";
import { fetchSampleAction } from "../integrations/actions";

const CALCS = [
  { value: "count", label: "Count records" },
  { value: "unique_count", label: "Count unique people" },
  { value: "sum", label: "Sum a field" },
  { value: "average", label: "Average a field" },
] as const;

const UNITS = [
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency ($)" },
  { value: "percent", label: "Percent (%)" },
] as const;

const OPS = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "starts_with", label: "starts with" },
  { value: "exists", label: "exists" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
] as const;

const COLORS = ["#6366f1", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#22c55e"];

const GOAL_PERIODS = ["total", "day", "week", "month", "quarter"] as const;

type PreviewData = {
  total: number | null;
  previousTotal?: number | null;
  series: { bucket: string; value: number | null }[];
  format?: "percent";
  grain: string;
  error?: string;
};

const selectCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MetricBuilder({
  options,
  initial,
}: {
  options: EventTypeOption[];
  initial: { id: string; name: string; definition: EventMetricDefinition } | null;
}) {
  const router = useRouter();

  const connections = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; provider: string }>();
    for (const o of options) {
      if (!seen.has(o.connectionId)) seen.set(o.connectionId, { id: o.connectionId, name: o.connectionName, provider: o.provider });
    }
    return [...seen.values()];
  }, [options]);

  const initAgg = initial?.definition.aggregation;
  const initSource = initial?.definition.source;
  const initConn =
    initSource && initSource.connectionIds !== "all" && Array.isArray(initSource.connectionIds)
      ? initSource.connectionIds[0]
      : "all";

  const [name, setName] = React.useState(initial?.name ?? "");
  const [nameTouched, setNameTouched] = React.useState(Boolean(initial));
  const [source, setSource] = React.useState<string>(initConn);
  const [track, setTrack] = React.useState<string>(initSource?.eventTypes[0] ?? "");
  const [calc, setCalc] = React.useState<string>(initAgg?.type ?? "count");
  const [aggField, setAggField] = React.useState<string>(
    initAgg && (initAgg.type === "sum" || initAgg.type === "average") ? initAgg.field : "amount",
  );
  const [unit, setUnit] = React.useState<string>(initial?.definition.unit ?? "number");
  const [color, setColor] = React.useState<string>(initial?.definition.color ?? COLORS[0]);
  const [filters, setFilters] = React.useState<Filter[]>(initial?.definition.filters ?? []);
  const [goalTarget, setGoalTarget] = React.useState<string>("");
  const [goalPeriod, setGoalPeriod] = React.useState<string>("total");

  const [fields, setFields] = React.useState<FilterFieldOption[]>([]);
  const [valueOptions, setValueOptions] = React.useState<Record<string, string[]>>({});
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [sample, setSample] = React.useState<Record<string, unknown>[] | null>(null);
  const [sampleLoading, setSampleLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Event types available for the chosen source.
  const trackOptions = React.useMemo(() => {
    const filtered = source === "all" ? options : options.filter((o) => o.connectionId === source);
    const byType = new Map<string, { eventType: string; label: string; count: number }>();
    for (const o of filtered) {
      const cur = byType.get(o.eventType);
      byType.set(o.eventType, { eventType: o.eventType, label: o.label, count: (cur?.count ?? 0) + o.count });
    }
    return [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [options, source]);

  // Keep track valid when source changes.
  React.useEffect(() => {
    if (trackOptions.length > 0 && !trackOptions.some((t) => t.eventType === track)) {
      setTrack(trackOptions[0].eventType);
    }
  }, [trackOptions, track]);

  // The connection backing the current selection (for Sample data).
  const activeConnectionId = React.useMemo(() => {
    if (source !== "all") return source;
    return options.find((o) => o.eventType === track)?.connectionId ?? connections[0]?.id ?? null;
  }, [source, track, options, connections]);

  const definition: EventMetricDefinition | null = React.useMemo(() => {
    if (!track) return null;
    const aggregation =
      calc === "count"
        ? { type: "count" as const }
        : calc === "unique_count"
          ? { type: "unique_count" as const, field: "contact_email" as const }
          : { type: calc as "sum" | "average", field: aggField as "amount" };
    return {
      type: "event",
      source: { connectionIds: source === "all" ? "all" : [source], eventTypes: [track] },
      filters: filters.filter((f) => f.op === "exists" || (f.value !== undefined && f.value !== "")),
      aggregation,
      unit: unit as "number" | "currency" | "percent",
      color,
    };
  }, [track, calc, aggField, source, filters, unit, color]);

  // Live preview (debounced).
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
            compare: true,
          }),
        });
        const data = await res.json();
        setPreview(res.ok ? data : { total: null, series: [], grain: "day", error: data.error });
      } catch {
        /* aborted */
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [definition]);

  // Filterable fields for the chosen track.
  React.useEffect(() => {
    if (!track) return;
    getFilterFields([track]).then((res) => res.ok && setFields(res.data));
  }, [track]);

  // Auto-name.
  React.useEffect(() => {
    if (nameTouched || !track) return;
    const label = trackOptions.find((t) => t.eventType === track)?.label ?? track;
    const prefix = calc === "sum" ? "Total " : calc === "average" ? "Average " : calc === "unique_count" ? "Unique " : "";
    setName(`${prefix}${label}`.trim());
  }, [track, calc, trackOptions, nameTouched]);

  const pullSample = React.useCallback(async () => {
    if (!activeConnectionId) return;
    setSampleLoading(true);
    const res = await fetchSampleAction(activeConnectionId);
    setSampleLoading(false);
    setSample(res.ok ? res.data : []);
  }, [activeConnectionId]);

  React.useEffect(() => {
    setSample(null);
  }, [activeConnectionId]);

  const loadValues = async (key: string) => {
    if (!key.startsWith("metadata.") || valueOptions[key]) return;
    const res = await getMetadataValues([track], key.slice(9));
    if (res.ok) setValueOptions((prev) => ({ ...prev, [key]: res.data }));
  };

  const addFilterForField = (field: string) => {
    setFilters((prev) => [...prev, { field: field as Filter["field"], op: "equals", value: "" }]);
    loadValues(field);
  };

  const sampleFields = React.useMemo(() => {
    const rec = sample?.[0];
    if (!rec || typeof rec !== "object") return [];
    const rows: { key: string; value: string; field: string }[] = [];
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      if (v !== null && typeof v === "object") continue;
      rows.push({
        key: k,
        value: v === null || v === undefined ? "—" : String(v).slice(0, 40),
        field: ["email", "contact_email"].includes(k) ? "contact_email" : `metadata.${k.slice(0, 60)}`,
      });
    }
    return rows.slice(0, 12);
  }, [sample]);

  const save = async () => {
    if (!definition || !name.trim()) return;
    setSaving(true);
    const res = await saveMetric({ id: initial?.id ?? null, name, definition });
    if (res.ok && goalTarget && Number(goalTarget) > 0 && goalPeriod !== "total") {
      await setGoal({
        metricId: res.data.metricId,
        target: Number(goalTarget),
        period: goalPeriod as "day" | "week" | "month" | "quarter",
      });
    }
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(initial ? "Metric updated" : "Metric created");
    router.push("/metrics");
    router.refresh();
  };

  const delta =
    preview && preview.previousTotal != null && preview.previousTotal !== 0 && preview.total != null
      ? ((preview.total - preview.previousTotal) / Math.abs(preview.previousTotal)) * 100
      : null;

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          No tools connected yet —{" "}
          <Link href="/integrations" className="text-primary underline">
            connect your first source
          </Link>{" "}
          to start building metrics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Builder */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            <h2 className="font-semibold">{initial ? "Edit metric" : "New metric"}</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mname">Metric name</Label>
            <Input
              id="mname"
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="e.g. Booked calls, Close rate, SMS reply rate"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source</Label>
              <select className={selectCls} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">All sources</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Track (record type)</Label>
              <select className={selectCls} value={track} onChange={(e) => setTrack(e.target.value)}>
                {trackOptions.length === 0 ? <option value="">No records yet</option> : null}
                {trackOptions.map((t) => (
                  <option key={t.eventType} value={t.eventType}>
                    {t.label}{t.count > 0 ? ` · ${t.count}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Calculation</Label>
              <select className={selectCls} value={calc} onChange={(e) => setCalc(e.target.value)}>
                {CALCS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {calc === "sum" || calc === "average" ? (
              <div className="space-y-2">
                <Label>Field</Label>
                <select className={selectCls} value={aggField} onChange={(e) => setAggField(e.target.value)}>
                  <option value="amount">Amount</option>
                  {fields.filter((o) => o.group !== "Built-in").map((o) => (
                    <option key={o.field} value={o.field}>{o.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Unit</Label>
                <select className={selectCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {calc === "sum" || calc === "average" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Unit</Label>
                <select className={selectCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Only include records where</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters((p) => [...p, { field: "contact_email", op: "contains", value: "" }])}
              >
                <PlusIcon /> Add rule
              </Button>
            </div>
            {filters.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules — counts every record.</p>
            ) : (
              filters.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    className={cn(selectCls, "h-9 w-auto flex-1")}
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
                    className={cn(selectCls, "h-9 w-auto")}
                    value={f.op}
                    onChange={(e) => setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, op: e.target.value as Filter["op"] } : x)))}
                  >
                    {OPS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  {f.op !== "exists" ? (
                    <>
                      <Input
                        className="h-9 w-36"
                        list={`vals-${i}`}
                        value={String(f.value ?? "")}
                        onFocus={() => loadValues(f.field)}
                        onChange={(e) => setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        placeholder="value"
                      />
                      <datalist id={`vals-${i}`}>
                        {(valueOptions[f.field] ?? []).map((v) => <option key={v} value={v} />)}
                      </datalist>
                    </>
                  ) : null}
                  <Button variant="ghost" size="icon" className="size-9" onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Goal + colour */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Goal (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  className="w-24"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  placeholder="e.g. 30"
                />
                <select className={cn(selectCls, "flex-1")} value={goalPeriod} onChange={(e) => setGoalPeriod(e.target.value)}>
                  {GOAL_PERIODS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Graph colour</Label>
              <div className="flex items-center gap-2 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Colour ${c}`}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                      color === c ? "ring-2 ring-foreground" : "hover:scale-110",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button onClick={save} disabled={saving || !name.trim() || !definition}>
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              {initial ? "Save changes" : "Create metric"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live preview + sample data */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live preview</p>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Preview <span title="Last 30 days of stored data"><InfoIcon className="size-3.5" /></span>
              </span>
              <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Last 30d</span>
            </div>
            {preview?.error ? (
              <p className="text-sm text-destructive">{preview.error}</p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-4xl font-semibold tabular-nums" style={{ color }}>
                    {preview ? formatValue(preview.total, unit as "number") : "—"}
                  </p>
                  {delta !== null ? (
                    <span className={cn("flex items-center gap-0.5 text-sm font-medium", delta >= 0 ? "text-emerald-400" : "text-destructive")}>
                      <ArrowUpRightIcon className="size-4" style={{ transform: delta < 0 ? "rotate(90deg)" : undefined }} />
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  ) : null}
                </div>
                {preview && preview.series.length > 0 ? (
                  <LineChart series={preview.series} grain={preview.grain} height={120} />
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No data in this period yet — new records appear here automatically.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {definition ? describeDefinition(definition) : "Pick what to track."}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          The preview reflects real data already stored. Save to pin it to your dashboard.
        </p>

        {/* Sample data */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <DatabaseIcon className="size-3.5" /> Sample data
              </span>
              <Button variant="outline" size="sm" onClick={pullSample} disabled={sampleLoading || !activeConnectionId}>
                {sampleLoading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                Pull latest
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pulled from your latest records — click a field to add it as a filter.
            </p>
            {sample === null ? (
              <p className="py-3 text-center text-xs text-muted-foreground">Hit “Pull latest” to preview real fields.</p>
            ) : sampleFields.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No records available for this source yet.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {sampleFields.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => addFilterForField(row.field)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary"
                  >
                    <PlusIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="w-32 shrink-0 truncate font-medium">{row.key}</span>
                    <span className="flex-1 truncate text-right text-muted-foreground">{row.value}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
