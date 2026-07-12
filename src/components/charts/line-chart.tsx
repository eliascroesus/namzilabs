"use client";

import { formatBucket, formatValue, niceMax, type SeriesPoint } from "./chart-utils";

/**
 * Single-series line chart: 2px primary line, recessive gridlines, text in
 * ink tokens, per-point hover targets with native tooltips. One series →
 * the surrounding title names it (no legend).
 */
export function LineChart({
  series,
  grain,
  format,
  height = 180,
}: {
  series: SeriesPoint[];
  grain: string;
  format?: "percent";
  height?: number;
}) {
  const width = 560;
  const pad = { top: 8, right: 8, bottom: 22, left: 36 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const values = series.map((p) => p.value ?? 0);
  const yMax = niceMax(values);
  const x = (i: number) => pad.left + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v: number) => pad.top + ih - (v / yMax) * ih;

  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value ?? 0).toFixed(1)}`)
    .join(" ");

  const gridYs = [0.5, 1].map((f) => pad.top + ih - f * ih);
  const labelEvery = Math.max(1, Math.ceil(series.length / 6));

  if (series.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data in this period.</p>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Metric over time">
      {gridYs.map((gy, i) => (
        <line key={i} x1={pad.left} x2={width - pad.right} y1={gy} y2={gy} className="stroke-border" strokeWidth={1} />
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + ih} y2={pad.top + ih} className="stroke-border" strokeWidth={1} />
      <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
        {formatValue(yMax, format)}
      </text>
      <text x={pad.left - 6} y={pad.top + ih / 2 + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
        {formatValue(yMax / 2, format)}
      </text>

      <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {series.map((p, i) => (
        <g key={p.bucket}>
          {/* Hover target larger than the mark */}
          <circle cx={x(i)} cy={y(p.value ?? 0)} r={10} fill="transparent">
            <title>{`${formatBucket(p.bucket, grain)}: ${formatValue(p.value, format)}`}</title>
          </circle>
          <circle cx={x(i)} cy={y(p.value ?? 0)} r={2.5} className="fill-primary" />
          {i % labelEvery === 0 || i === series.length - 1 ? (
            <text x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {formatBucket(p.bucket, grain)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
