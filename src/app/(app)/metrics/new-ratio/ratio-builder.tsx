"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatValue } from "@/components/charts/chart-utils";
import { saveMetric } from "../actions";

export function RatioBuilder({ metrics }: { metrics: { id: string; name: string }[] }) {
  const router = useRouter();
  const [numerator, setNumerator] = React.useState("");
  const [denominator, setDenominator] = React.useState("");
  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [preview, setPreview] = React.useState<{ total: number | null; error?: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const ready = numerator && denominator && numerator !== denominator;

  React.useEffect(() => {
    if (!ready) {
      setPreview(null);
      return;
    }
    if (!nameTouched) {
      const n = metrics.find((m) => m.id === numerator)?.name ?? "";
      const d = metrics.find((m) => m.id === denominator)?.name ?? "";
      if (n && d) setName(`${n} rate (of ${d})`.slice(0, 80));
    }
    const controller = new AbortController();
    fetch("/api/metrics/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        definition: { type: "ratio", numeratorMetricId: numerator, denominatorMetricId: denominator, format: "percent" },
        from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        to: new Date().toISOString(),
        grain: "day",
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        setPreview(res.ok ? { total: data.total } : { total: null, error: data.error });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [ready, numerator, denominator, metrics, nameTouched]);

  if (metrics.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        You need at least two saved metrics first —{" "}
        <Link href="/metrics/new" className="underline">
          create them here
        </Link>
        .
      </p>
    );
  }

  const selectCls = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm";

  return (
    <div className="grid max-w-3xl gap-8 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>This metric…</Label>
          <select className={selectCls} value={numerator} onChange={(e) => setNumerator(e.target.value)}>
            <option value="">Choose a metric…</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>…as a percentage of</Label>
          <select className={selectCls} value={denominator} onChange={(e) => setDenominator(e.target.value)}>
            <option value="">Choose a metric…</option>
            {metrics
              .filter((m) => m.id !== numerator)
              .map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ratioName">Name</Label>
          <Input
            id="ratioName"
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
        </div>
        <Button
          disabled={!ready || !name.trim() || saving}
          onClick={async () => {
            setSaving(true);
            const res = await saveMetric({
              id: null,
              name,
              definition: { type: "ratio", numeratorMetricId: numerator, denominatorMetricId: denominator, format: "percent" },
            });
            setSaving(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Ratio metric saved");
            router.push("/metrics");
          }}
        >
          {saving ? "Saving…" : "Save metric"}
        </Button>
      </div>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Pick both metrics to preview.</p>
          ) : preview?.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <p className="text-4xl font-semibold tabular-nums">
              {preview ? formatValue(preview.total, "percent") : "…"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
