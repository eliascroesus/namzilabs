export type SeriesPoint = { bucket: string; value: number | null };

export function formatValue(v: number | null, format?: "percent"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (format === "percent") return `${v.toFixed(1)}%`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function formatBucket(bucket: string, grain: string): string {
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (grain === "hour") {
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Nice y-axis max: 1/2/5 × 10^n at or above the data max. */
export function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= max) return m * pow;
  }
  return 10 * pow;
}
