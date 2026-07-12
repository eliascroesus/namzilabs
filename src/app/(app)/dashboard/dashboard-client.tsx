"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleIcon,
  GripVerticalIcon,
  PlusIcon,
  RefreshCwIcon,
  TargetIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Sparkline } from "@/components/shared/sparkline";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { formatValue } from "@/components/charts/chart-utils";
import { cn } from "@/lib/utils";
import { addWidget, removeGoal, removeWidget, reorderWidgets, setGoal, setWidgetSize } from "./actions";

type Widget = {
  id: string;
  widgetType: "number" | "line" | "bar" | "table";
  size: 1 | 2;
  metricId: string;
  metricName: string;
  isRatio: boolean;
  goal: { target: number; period: string } | null;
};

type MetricOption = { id: string; name: string; isRatio: boolean };

type RunResponse = {
  total: number | null;
  series: { bucket: string; value: number | null }[];
  format?: "percent";
  grain: string;
  previousTotal?: number | null;
  events?: { id: string; eventType: string; contactEmail: string | null; contactName: string | null; amount: string | null; occurredAt: string }[];
  error?: string;
};

const PRESETS = ["Today", "7d", "30d", "This month", "Custom"] as const;
type Preset = (typeof PRESETS)[number];

function rangeFor(preset: Preset, custom: { from: string; to: string }): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Ranges end at END of the current day, not the instant the preset was
  // picked — otherwise the 30s live refresh could never show new events
  // (the range would be frozen in the past) and SWR keys stay stable.
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  switch (preset) {
    case "Today":
      return { from: startOfDay, to: endOfDay };
    case "7d":
      return { from: new Date(startOfDay.getTime() - 6 * 86_400_000), to: endOfDay };
    case "30d":
      return { from: new Date(startOfDay.getTime() - 29 * 86_400_000), to: endOfDay };
    case "This month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay };
    case "Custom": {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : new Date(startOfDay.getTime() - 6 * 86_400_000);
      const to = custom.to ? new Date(`${custom.to}T23:59:59`) : endOfDay;
      return { from, to };
    }
  }
}

/** Bounds of the goal period containing now (local time). */
function goalPeriodBounds(period: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: new Date(from.getTime() + 86_400_000) };
  }
  if (period === "week") {
    const day = (now.getDay() + 6) % 7; // Monday start
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    return { from, to: new Date(from.getTime() + 7 * 86_400_000) };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return { from: new Date(now.getFullYear(), q, 1), to: new Date(now.getFullYear(), q + 3, 1) };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

async function runFetcher(key: string): Promise<RunResponse> {
  const body = JSON.parse(key);
  const res = await fetch("/api/metrics/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load");
  return data;
}

export function DashboardClient({
  widgets: initialWidgets,
  metrics,
  checklist,
}: {
  widgets: Widget[];
  metrics: MetricOption[];
  checklist: { hasConnection: boolean; hasMetric: boolean; hasWidget: boolean };
}) {
  const router = useRouter();
  const [widgets, setWidgets] = React.useState(initialWidgets);
  React.useEffect(() => setWidgets(initialWidgets), [initialWidgets]);

  const [preset, setPreset] = React.useState<Preset>("30d");
  const [custom, setCustom] = React.useState({ from: "", to: "" });
  const [compare, setCompare] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const range = React.useMemo(() => rangeFor(preset, custom), [preset, custom]);

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = widgets.map((w) => w.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    setWidgets((prev) => ids.map((id) => prev.find((w) => w.id === id)!));
    setDragId(null);
    await reorderWidgets(ids);
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
            : "Live metrics from every tool you connect, in one place."
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRefreshNonce((n) => n + 1)} aria-label="Refresh all widgets">
              <RefreshCwIcon />
              Refresh
            </Button>
            <AddWidgetDialog metrics={metrics} onAdded={() => router.refresh()} />
          </div>
        }
      />

      {/* Global controls */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button key={p} variant={preset === p ? "default" : "outline"} size="sm" onClick={() => setPreset(p)}>
            {p}
          </Button>
        ))}
        {preset === "Custom" ? (
          <span className="flex items-center gap-1">
            <Input type="date" className="h-8 w-36" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            –
            <Input type="date" className="h-8 w-36" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </span>
        ) : null}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          vs previous period
        </label>
      </div>

      {widgets.length === 0 ? (
        <SetupChecklist checklist={checklist} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {widgets.map((w) => (
            <div
              key={w.id}
              draggable
              onDragStart={() => setDragId(w.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(w.id)}
              className={cn(w.size === 2 && "sm:col-span-2")}
            >
              <WidgetCard
                widget={w}
                range={range}
                compare={compare}
                refreshNonce={refreshNonce}
                onLoaded={() => setUpdatedAt(new Date())}
                onChanged={() => router.refresh()}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SetupChecklist({
  checklist,
}: {
  checklist: { hasConnection: boolean; hasMetric: boolean; hasWidget: boolean };
}) {
  const steps = [
    { done: checklist.hasConnection, label: "Connect a tool", href: "/integrations" },
    { done: checklist.hasMetric, label: "Create a metric", href: "/metrics/new" },
    { done: checklist.hasWidget, label: "Add a widget to this dashboard", href: null },
  ];
  return (
    <Card>
      <CardContent className="mx-auto flex max-w-md flex-col gap-4 p-10">
        <h2 className="text-lg font-semibold">Three steps to your live dashboard</h2>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              {s.done ? (
                <CheckCircle2Icon className="size-5 text-primary" />
              ) : (
                <CircleIcon className="size-5 text-muted-foreground" />
              )}
              {s.href && !s.done ? (
                <Link href={s.href} className="underline-offset-2 hover:underline">
                  {s.label}
                </Link>
              ) : (
                <span className={s.done ? "text-muted-foreground line-through" : undefined}>{s.label}</span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Use “Add widget” in the top right once a metric exists.
        </p>
      </CardContent>
    </Card>
  );
}

function WidgetCard({
  widget,
  range,
  compare,
  refreshNonce,
  onLoaded,
  onChanged,
}: {
  widget: Widget;
  range: { from: Date; to: Date };
  compare: boolean;
  refreshNonce: number;
  onLoaded: () => void;
  onChanged: () => void;
}) {
  const key = JSON.stringify({
    metricId: widget.metricId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    compare: compare && widget.widgetType === "number",
    includeEvents: widget.widgetType === "table",
    _r: refreshNonce,
  });
  const { data, error, isLoading } = useSWR<RunResponse>(key, runFetcher, {
    refreshInterval: 30_000,
    onSuccess: onLoaded,
    keepPreviousData: true,
  });

  // Goal progress always tracks the goal's own period, not the global range.
  const goalKey = widget.goal
    ? JSON.stringify({
        metricId: widget.metricId,
        from: goalPeriodBounds(widget.goal.period).from.toISOString(),
        to: goalPeriodBounds(widget.goal.period).to.toISOString(),
        grain: "day",
      })
    : null;
  const { data: goalData } = useSWR<RunResponse>(goalKey, runFetcher, { refreshInterval: 60_000 });

  return (
    <Card className="group h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{widget.metricName}</p>
          <WidgetMenu widget={widget} onChanged={onChanged} />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{String(error.message ?? "Couldn't load this metric")}</p>
        ) : isLoading && !data ? (
          <Skeleton className="h-24 w-full" />
        ) : data ? (
          <>
            {widget.widgetType === "number" ? (
              <NumberBody data={data} compare={compare} goal={widget.goal} goalValue={goalData?.total ?? null} />
            ) : null}
            {widget.widgetType === "line" ? (
              <LineChart series={data.series} grain={data.grain} format={data.format} height={170} />
            ) : null}
            {widget.widgetType === "bar" ? (
              <BarChart series={data.series} grain={data.grain} format={data.format} height={170} />
            ) : null}
            {widget.widgetType === "table" ? <TableBody events={data.events ?? []} /> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NumberBody({
  data,
  compare,
  goal,
  goalValue,
}: {
  data: RunResponse;
  compare: boolean;
  goal: { target: number; period: string } | null;
  goalValue: number | null;
}) {
  const delta =
    compare && data.previousTotal !== undefined && data.previousTotal !== null && data.previousTotal !== 0 && data.total !== null
      ? ((data.total - data.previousTotal) / Math.abs(data.previousTotal)) * 100
      : null;

  const points = data.series.slice(-14).map((p) => ({ label: p.bucket.slice(0, 10), value: p.value ?? 0 }));

  let pace: { fraction: number; onPace: boolean } | null = null;
  if (goal && goalValue !== null) {
    const bounds = goalPeriodBounds(goal.period);
    const elapsed = (Date.now() - bounds.from.getTime()) / (bounds.to.getTime() - bounds.from.getTime());
    pace = { fraction: Math.min(1, goalValue / goal.target), onPace: goalValue >= goal.target * elapsed };
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-semibold tabular-nums">{formatValue(data.total, data.format)}</p>
        {delta !== null ? (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              delta >= 0 ? "text-emerald-700" : "text-destructive",
            )}
          >
            {delta >= 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {points.length > 1 ? <Sparkline points={points} barWidth={8} gap={2} height={28} ariaLabel="Recent trend" /> : null}
      {goal && pace ? (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", pace.onPace ? "bg-emerald-500" : "bg-amber-500")}
              style={{ width: `${(pace.fraction * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatValue(goalValue, data.format)} of {formatValue(goal.target, data.format)} this {goal.period} ·{" "}
            <span className={pace.onPace ? "text-emerald-700" : "text-amber-700"}>
              {pace.onPace ? "on pace" : "behind pace"}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TableBody({ events }: { events: NonNullable<RunResponse["events"]> }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No matching events in this period.</p>;
  }
  return (
    <div className="divide-y text-sm">
      {events.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 py-1.5">
          <span className="truncate">{e.contactEmail ?? e.contactName ?? e.eventType}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {e.amount ? `$${e.amount} · ` : ""}
            {new Date(e.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function WidgetMenu({ widget, onChanged }: { widget: Widget; onChanged: () => void }) {
  const [goalOpen, setGoalOpen] = React.useState(false);
  const [target, setTarget] = React.useState(widget.goal ? String(widget.goal.target) : "");
  const [period, setPeriod] = React.useState(widget.goal?.period ?? "month");

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <GripVerticalIcon className="size-4 cursor-grab text-muted-foreground" aria-label="Drag to reorder" />
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Toggle width"
        onClick={async () => {
          await setWidgetSize(widget.id, widget.size === 1 ? 2 : 1);
          onChanged();
        }}
      >
        <span className="text-[10px] font-semibold">{widget.size === 1 ? "2x" : "1x"}</span>
      </Button>
      {widget.widgetType === "number" ? (
        <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Set goal">
              <TargetIcon className="size-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Goal for {widget.metricName}</DialogTitle>
              <DialogDescription>The progress bar tracks the current {period}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="goalTarget">Target</Label>
                <Input id="goalTarget" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Per</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {["day", "week", "month", "quarter"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              {widget.goal ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    await removeGoal(widget.metricId);
                    setGoalOpen(false);
                    onChanged();
                  }}
                >
                  Remove goal
                </Button>
              ) : null}
              <Button
                onClick={async () => {
                  const res = await setGoal({
                    metricId: widget.metricId,
                    target: Number(target),
                    period: period as "day" | "week" | "month" | "quarter",
                  });
                  if (res.ok) {
                    setGoalOpen(false);
                    onChanged();
                  } else toast.error(res.error);
                }}
              >
                Save goal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Remove widget"
        onClick={async () => {
          await removeWidget(widget.id);
          onChanged();
        }}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function AddWidgetDialog({ metrics, onAdded }: { metrics: MetricOption[]; onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [metricId, setMetricId] = React.useState("");
  const [widgetType, setWidgetType] = React.useState<Widget["widgetType"]>("number");
  const selected = metrics.find((m) => m.id === metricId);
  const types: { value: Widget["widgetType"]; label: string }[] = [
    { value: "number", label: "Number" },
    { value: "line", label: "Line chart" },
    { value: "bar", label: "Bar chart" },
    { value: "table", label: "Recent events" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add widget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>
            {metrics.length === 0 ? (
              <>
                No metrics yet —{" "}
                <Link href="/metrics/new" className="underline">
                  create one first
                </Link>
                .
              </>
            ) : (
              "Pick a metric and how to show it."
            )}
          </DialogDescription>
        </DialogHeader>
        {metrics.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Metric</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                value={metricId}
                onChange={(e) => setMetricId(e.target.value)}
              >
                <option value="">Choose…</option>
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={t.value === "table" && selected?.isRatio}
                  onClick={() => setWidgetType(t.value)}
                  className={cn(
                    "rounded-lg border bg-card px-3 py-2 text-sm transition-colors disabled:opacity-40",
                    widgetType === t.value ? "border-primary ring-1 ring-primary" : "hover:bg-secondary",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!metricId}
            onClick={async () => {
              const res = await addWidget({ metricId, widgetType });
              if (res.ok) {
                setOpen(false);
                setMetricId("");
                onAdded();
              } else toast.error(res.error);
            }}
          >
            Add to dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
