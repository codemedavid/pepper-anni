export interface HeatCellInput {
  day: number; // 0=Sun..6=Sat
  hour: number; // 0..23
  value: number;
}

export interface HeatmapChartProps {
  cells: HeatCellInput[];
  valueFormatter?: (n: number) => string;
  ariaLabel?: string;
}

const BRAND = '#A8285A';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SPARSE_HOURS = new Set([0, 6, 12, 18]);

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export function HeatmapChart({
  cells,
  valueFormatter = (n: number) => n.toLocaleString(),
  ariaLabel = 'Activity heatmap by day of week and hour of day',
}: HeatmapChartProps) {
  const hasData = cells.some((c) => Number.isFinite(c.value) && c.value > 0);

  if (!cells.length || !hasData) {
    return (
      <div
        className="flex h-40 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400"
        role="img"
        aria-label={`${ariaLabel}: no data`}
      >
        No data
      </div>
    );
  }

  // Build a lookup keyed by day*24+hour for O(1) cell access.
  const valueByKey = new Map<number, number>();
  let maxValue = 0;
  for (const c of cells) {
    if (c.day < 0 || c.day > 6 || c.hour < 0 || c.hour > 23) continue;
    const v = Number.isFinite(c.value) ? c.value : 0;
    const key = c.day * 24 + c.hour;
    const next = (valueByKey.get(key) ?? 0) + v;
    valueByKey.set(key, next);
    if (next > maxValue) maxValue = next;
  }

  const opacityFor = (value: number): number => {
    if (value <= 0 || maxValue <= 0) return 0;
    // Floor at 0.12 so small non-zero values stay visible.
    return 0.12 + 0.88 * (value / maxValue);
  };

  return (
    <div
      className="w-full overflow-x-auto"
      role="img"
      aria-label={ariaLabel}
    >
      <div className="min-w-[640px]">
        <div className="flex flex-col gap-1">
          {DAY_LABELS.map((dayLabel, day) => (
            <div key={dayLabel} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-right text-[11px] font-medium text-gray-500">
                {dayLabel}
              </span>
              <div
                className="grid flex-1 gap-1"
                style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              >
                {HOURS.map((hour) => {
                  const value = valueByKey.get(day * 24 + hour) ?? 0;
                  const opacity = opacityFor(value);
                  return (
                    <div
                      key={hour}
                      className="aspect-square rounded-sm border border-gray-100"
                      style={{
                        backgroundColor: value > 0 ? BRAND : '#F8FAFC',
                        opacity: value > 0 ? opacity : 1,
                      }}
                      title={`${dayLabel} ${formatHour(hour)}: ${valueFormatter(value)}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sparse hour labels (0, 6, 12, 18). */}
          <div className="flex items-center gap-1">
            <span className="w-8 shrink-0" aria-hidden="true" />
            <div
              className="grid flex-1 gap-1"
              style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
            >
              {HOURS.map((hour) => (
                <span
                  key={hour}
                  className="text-center text-[10px] text-gray-400"
                  aria-hidden="true"
                >
                  {SPARSE_HOURS.has(hour) ? formatHour(hour) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HeatmapChart;
