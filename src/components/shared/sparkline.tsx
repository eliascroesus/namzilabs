/**
 * Tiny single-series bar sparkline (server-rendered SVG).
 * One hue (primary), baseline-anchored bars with rounded data-ends, 2px gaps,
 * native per-bar tooltips; identity comes from the surrounding label text.
 */
export function Sparkline({
  points,
  height = 40,
  barWidth = 14,
  gap = 2,
  ariaLabel,
}: {
  points: { label: string; value: number }[];
  height?: number;
  barWidth?: number;
  gap?: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const width = points.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      {points.map((p, i) => {
        const h = p.value === 0 ? 2 : Math.max(3, Math.round((p.value / max) * (height - 4)));
        const x = i * (barWidth + gap);
        return (
          <rect
            key={p.label}
            x={x}
            y={height - h}
            width={barWidth}
            height={h}
            rx={2}
            className={p.value === 0 ? "fill-border" : "fill-primary"}
          >
            <title>{`${p.label}: ${p.value} event${p.value === 1 ? "" : "s"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
