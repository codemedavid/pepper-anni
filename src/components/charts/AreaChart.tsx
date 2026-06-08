import { useMemo, useRef, useState } from 'react';

export interface AreaSeriesPoint {
  label: string;
  value: number;
}

export interface AreaChartProps {
  data: AreaSeriesPoint[];
  comparison?: AreaSeriesPoint[];
  height?: number;
  color?: string;
  valueFormatter?: (n: number) => string;
  ariaLabel?: string;
}

const BRAND = '#A8285A';

interface HoverState {
  index: number;
  clientX: number;
  clientY: number;
}

export function AreaChart({
  data,
  comparison,
  height = 220,
  color = BRAND,
  valueFormatter = (n: number) => String(n),
  ariaLabel = 'Area chart',
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  // Stable gradient id so multiple instances don't collide.
  const gradientId = useMemo(
    () => `area-grad-${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  // Layout constants (viewBox coordinate space).
  const VB_WIDTH = 600;
  const VB_HEIGHT = height;
  const PAD_LEFT = 8;
  const PAD_RIGHT = 8;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 26;

  // Defensive: xFor is computed with n = data.length, so a comparison series
  // longer than data would draw points past the right edge of the (overflow-
  // visible) plot. Clamp the comparison to data.length so it can never leak.
  const safeComparison = useMemo(
    () => (comparison ? comparison.slice(0, data.length) : undefined),
    [comparison, data.length]
  );

  const plot = useMemo(() => {
    const n = data.length;
    const innerW = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerH = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;

    const allValues: number[] = [
      ...data.map((d) => d.value),
      ...(safeComparison ? safeComparison.map((d) => d.value) : []),
    ];
    const rawMax = allValues.length ? Math.max(...allValues) : 0;
    const rawMin = allValues.length ? Math.min(...allValues) : 0;
    // Pad the range a touch; never let it collapse to zero height.
    const maxVal = rawMax === rawMin ? rawMax + 1 : rawMax;
    const minVal = rawMax === rawMin ? Math.max(0, rawMin - 1) : Math.min(0, rawMin);
    const span = maxVal - minVal || 1;

    const xFor = (i: number) =>
      PAD_LEFT + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yFor = (v: number) =>
      PAD_TOP + innerH - ((v - minVal) / span) * innerH;

    const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));
    const compPoints = safeComparison
      ? safeComparison.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }))
      : [];

    const linePath = points.map((p) => `${p.x},${p.y}`).join(' ');
    const compPath = compPoints.map((p) => `${p.x},${p.y}`).join(' ');

    const baseY = PAD_TOP + innerH;
    const areaPath = points.length
      ? `M ${points[0].x},${baseY} L ${points
          .map((p) => `${p.x},${p.y}`)
          .join(' L ')} L ${points[points.length - 1].x},${baseY} Z`
      : '';

    // Horizontal gridlines at 0/50/100% of plot height.
    const gridYs = [0, 0.5, 1].map((t) => PAD_TOP + t * innerH);

    return {
      innerW,
      innerH,
      maxVal,
      minVal,
      points,
      compPoints,
      linePath,
      compPath,
      areaPath,
      gridYs,
      xFor,
      baseY,
    };
  }, [data, safeComparison, VB_HEIGHT]);

  // Sparse x labels: aim for ~6 ticks max, always include first & last.
  const xLabelIndices = useMemo(() => {
    const n = data.length;
    if (n === 0) return [];
    if (n <= 6) return data.map((_, i) => i);
    const step = Math.ceil(n / 6);
    const idx = new Set<number>();
    for (let i = 0; i < n; i += step) idx.add(i);
    idx.add(n - 1);
    return Array.from(idx).sort((a, b) => a - b);
  }, [data]);

  if (!data.length) {
    return (
      <div
        role="img"
        aria-label={`${ariaLabel}: no data`}
        className="flex items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = e.clientX - rect.left;
    // Map pixel x back into viewBox space, then to nearest index.
    const vbX = (relX / rect.width) * VB_WIDTH;
    const n = data.length;
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(plot.xFor(i) - vbX);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    }
    setHover({ index: nearest, clientX: e.clientX - rect.left, clientY: e.clientY - rect.top });
  };

  const hoverPoint = hover ? plot.points[hover.index] : null;
  const hoverComp =
    hover && plot.compPoints.length > hover.index
      ? plot.compPoints[hover.index]
      : null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="relative w-full"
      style={{ height }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {plot.gridYs.map((y, i) => (
          <line
            key={`grid-${i}`}
            x1={PAD_LEFT}
            x2={VB_WIDTH - PAD_RIGHT}
            y1={y}
            y2={y}
            stroke="#E5E7EB"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Area fill */}
        <path d={plot.areaPath} fill={`url(#${gradientId})`} stroke="none" />

        {/* Comparison (previous period) dashed line */}
        {plot.compPath && (
          <polyline
            points={plot.compPath}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Main line */}
        <polyline
          points={plot.linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Hover marker */}
        {hover && hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={PAD_TOP}
              y2={plot.baseY}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.4}
              vectorEffect="non-scaling-stroke"
            />
            {hoverComp && (
              <circle
                cx={hoverComp.x}
                cy={hoverComp.y}
                r={3.5}
                fill="#fff"
                stroke="#9CA3AF"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4}
              fill="#fff"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Y min/max labels (overlaid, top-right & bottom-right) */}
      <span className="pointer-events-none absolute right-1 top-0 text-[10px] font-medium text-gray-400">
        {valueFormatter(plot.maxVal)}
      </span>
      <span
        className="pointer-events-none absolute right-1 text-[10px] font-medium text-gray-400"
        style={{ bottom: PAD_BOTTOM - 2 }}
      >
        {valueFormatter(plot.minVal)}
      </span>

      {/* Sparse x labels */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5">
        {xLabelIndices.map((i) => {
          const leftPct = (plot.xFor(i) / VB_WIDTH) * 100;
          const isFirst = i === 0;
          const isLast = i === data.length - 1;
          return (
            <span
              key={`xl-${i}`}
              className="absolute text-[10px] text-gray-400"
              style={{
                left: `${leftPct}%`,
                transform: isFirst
                  ? 'translateX(0)'
                  : isLast
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
              }}
            >
              {data[i].label}
            </span>
          );
        })}
      </div>

      {/* Tooltip */}
      {hover && hoverPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(hover.clientX + 10, 4), (containerRef.current?.clientWidth ?? VB_WIDTH) - 130),
            top: 4,
          }}
        >
          <div className="font-medium text-gray-900">{data[hover.index].label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-gray-700">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="tabular-nums">{valueFormatter(data[hover.index].value)}</span>
          </div>
          {safeComparison && safeComparison[hover.index] && (
            <div className="mt-0.5 flex items-center gap-1.5 text-gray-500">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
              <span className="tabular-nums">
                {valueFormatter(safeComparison[hover.index].value)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AreaChart;
