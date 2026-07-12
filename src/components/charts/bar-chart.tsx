"use client";

import { formatBucket, formatValue, niceMax, type SeriesPoint } from "./chart-utils";

/**
 * Single-series bar chart: baseline-anchored bars with rounded data-ends,
 * 2px surface gaps, single primary hue, native per-bar tooltips.
 */
export function BarChart({
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
  const gap = 2;
  const barW = Math.max(2, Math.min(40, iw / Math.max(1, series.length) - gap));
  const labelEvery = Math.max(1, Math.ceil(series.length / 6));

  if (series.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data in this period.</p>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Metric per period">
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + ih / 2} y2={pad.top + ih / 2} className="stroke-border" strokeWidth={1} />
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + ih} y2={pad.top + ih} className="stroke-border" strokeWidth={1} />
      <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
        {formatValue(yMax, format)}
      </text>
      <text x={pad.left - 6} y={pad.top + ih / 2 + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
        {formatValue(yMax / 2, format)}
      </text>

      {series.map((p, i) => {
        const v = p.value ?? 0;
        const h = v <= 0 ? 0 : Math.max(2, (v / yMax) * ih);
        const cx = pad.left + (i / series.length) * iw + gap / 2;
        return (
          <g key={p.bucket}>
            <rect
              x={cx}
              y={pad.top + ih - h}
              width={barW}
              height={Math.max(h, 0.5)}
              rx={2}
              className={v > 0 ? "fill-primary" : "fill-border"}
            >
              <title>{`${formatBucket(p.bucket, grain)}: ${formatValue(p.value, format)}`}</title>
            </rect>
            {i % labelEvery === 0 || i === series.length - 1 ? (
              <text x={cx + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {formatBucket(p.bucket, grain)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
