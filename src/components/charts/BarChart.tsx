import { useId, useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  valueFormatter?: (n: number) => string;
  ariaLabel?: string;
}

const BRAND = '#A8285A';

export function BarChart({
  data,
  height = 240,
  color = BRAND,
  valueFormatter = (n) => n.toLocaleString('en-PH'),
  ariaLabel = 'Bar chart',
}: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Stable gradient id (avoids collisions when multiple charts render).
  const gradientId = useId().replace(/:/g, '');

  if (!data || data.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${ariaLabel}: no data`}
        className="flex items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  // viewBox coordinate space (we render responsively via width="100%").
  const VB_W = 600;
  const VB_H = height;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 16;
  const padBottom = 28; // room for x labels
  const plotW = VB_W - padLeft - padRight;
  const plotH = VB_H - padTop - padBottom;
  const baselineY = padTop + plotH;

  const maxValue = Math.max(...data.map((d) => d.value), 0);
  const safeMax = maxValue <= 0 ? 1 : maxValue;

  const slot = plotW / data.length;
  // Bar width: fill ~62% of the slot, with sensible caps.
  const barW = Math.max(4, Math.min(slot * 0.62, 56));
  const radius = Math.min(barW / 2, 6);

  // Sparse x labels: aim for at most ~8 labels.
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={`bar-grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1={padLeft}
          y1={baselineY}
          x2={VB_W - padRight}
          y2={baselineY}
          stroke="#E5E7EB"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {data.map((d, i) => {
          const value = Number.isFinite(d.value) ? d.value : 0;
          const h = safeMax > 0 ? Math.max(0, (value / safeMax) * plotH) : 0;
          const cx = padLeft + slot * i + slot / 2;
          const x = cx - barW / 2;
          const y = baselineY - h;
          const isHovered = hovered === i;
          const showLabel = i % labelStep === 0 || i === data.length - 1;

          return (
            <g
              key={`${d.label}-${i}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* invisible full-height hit area for easier hover */}
              <rect
                x={padLeft + slot * i}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={radius}
                ry={radius}
                fill={`url(#bar-grad-${gradientId})`}
                opacity={hovered === null || isHovered ? 1 : 0.5}
                style={{ transition: 'opacity 200ms ease' }}
              >
                <title>{`${d.label}: ${valueFormatter(value)}`}</title>
              </rect>
              {showLabel && (
                <text
                  x={cx}
                  y={VB_H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#9CA3AF"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip overlay (HTML, positioned over the hovered bar) */}
      {hovered !== null && data[hovered] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{
            left: `${((hovered + 0.5) / data.length) * 100}%`,
            top: (() => {
              const value = Number.isFinite(data[hovered].value) ? data[hovered].value : 0;
              const h = safeMax > 0 ? Math.max(0, (value / safeMax) * plotH) : 0;
              return `${((baselineY - h) / VB_H) * 100}%`;
            })(),
          }}
        >
          <div className="whitespace-nowrap text-gray-300">{data[hovered].label}</div>
          <div className="whitespace-nowrap">{valueFormatter(Number(data[hovered].value) || 0)}</div>
        </div>
      )}
    </div>
  );
}

export default BarChart;
