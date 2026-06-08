export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  valueFormatter?: (n: number) => string;
  centerLabel?: string;
  centerValue?: string;
}

const DEFAULT_PALETTE = [
  '#A8285A',
  '#C53A6E',
  '#D85E8E',
  '#E68FB2',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#6E193B',
  '#64748B',
];

export function DonutChart({
  data,
  size = 200,
  valueFormatter = (n: number) => n.toLocaleString(),
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + (Number.isFinite(d.value) ? d.value : 0), 0);

  if (!data.length || total <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400"
        style={{ height: size }}
        role="img"
        aria-label="Donut chart: no data"
      >
        No data
      </div>
    );
  }

  const strokeWidth = Math.max(12, Math.round(size * 0.16));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const value = Number.isFinite(d.value) ? d.value : 0;
    const fraction = value / total;
    const color = d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    // Offset rotates each arc to start where the previous ended.
    const dashOffset = -cumulative * circumference;
    cumulative += fraction;
    return {
      label: d.label,
      value,
      fraction,
      color,
      dashArray: `${fraction * circumference} ${circumference}`,
      dashOffset,
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Donut chart with ${data.length} segments, total ${valueFormatter(total)}`}
        >
          {/* Rotate -90deg so the first arc starts at the top. */}
          <g transform={`rotate(-90 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />
            {segments.map((s, i) => (
              <circle
                key={`${s.label}-${i}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={s.dashArray}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
              >
                <title>{`${s.label}: ${valueFormatter(s.value)} (${(s.fraction * 100).toFixed(1)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {(centerLabel || centerValue) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="text-xl font-bold text-gray-900">{centerValue}</span>
            )}
            {centerLabel && (
              <span className="mt-0.5 text-xs font-medium text-gray-500">{centerLabel}</span>
            )}
          </div>
        )}
      </div>

      <ul className="flex w-full flex-col gap-2 sm:max-w-[16rem]">
        {segments.map((s, i) => (
          <li key={`${s.label}-legend-${i}`} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-gray-700" title={s.label}>
              {s.label}
            </span>
            <span className="shrink-0 font-medium text-gray-900">{valueFormatter(s.value)}</span>
            <span className="w-12 shrink-0 text-right text-xs text-gray-400">
              {(s.fraction * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DonutChart;
