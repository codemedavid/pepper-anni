export interface HBarItem {
  label: string;
  value: number;
  sublabel?: string;
}

export interface HBarListProps {
  data: HBarItem[];
  color?: string;
  valueFormatter?: (n: number) => string;
  max?: number;
  emptyMessage?: string;
}

const BRAND = '#A8285A';

export function HBarList({
  data,
  color = BRAND,
  valueFormatter = (n) => n.toLocaleString('en-PH'),
  max,
  emptyMessage = 'No data',
}: HBarListProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-gray-50 py-8 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  const computedMax = Math.max(...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)), 0);
  const effectiveMax = max && max > 0 ? max : computedMax;
  const safeMax = effectiveMax > 0 ? effectiveMax : 1;

  return (
    <div className="flex flex-col gap-3">
      {data.map((item, i) => {
        const value = Number.isFinite(item.value) ? item.value : 0;
        const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));

        return (
          <div key={`${item.label}-${i}`} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="block truncate text-xs text-gray-400">{item.sublabel}</span>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                {valueFormatter(value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, backgroundColor: color }}
                role="img"
                aria-label={`${item.label}: ${valueFormatter(value)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HBarList;
