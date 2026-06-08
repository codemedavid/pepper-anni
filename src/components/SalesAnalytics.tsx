import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  ShoppingCart,
  Receipt,
  Boxes,
  Users,
  Wallet,
  LineChart as LineChartIcon,
  Layers,
  PieChart,
  Trophy,
  UserPlus,
  CreditCard,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import { formatPrice } from '../utils/currency';
import {
  getPresetRange,
  previousRange,
  filterByRange,
  autoGranularity,
  computeKpiSummary,
  buildTimeSeries,
  statusBreakdown,
  categoryBreakdown,
  topProducts,
  topVariations,
  customerMix,
  customerStats,
  breakdownBy,
  orderHeatmap,
  ordersByWeekday,
  lowStockMovers,
  formatCompactPHP,
  toCsv,
} from '../lib/analytics';
import type {
  RangePreset,
  ProductLite,
  Delta as DeltaType,
} from '../lib/analytics';
import AreaChart from './charts/AreaChart';
import BarChart from './charts/BarChart';
import HBarList from './charts/HBarList';
import DonutChart from './charts/DonutChart';
import Sparkline from './charts/Sparkline';
import HeatmapChart from './charts/HeatmapChart';

const BRAND = '#A8285A';

// Static, fully-spelled Tailwind classes so the JIT compiler can see them
// (dynamically constructed class strings like `bg-${color}-50` are NOT emitted).
const ICON_CHIP: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  pink: 'bg-pink-50 text-pink-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  teal: 'bg-teal-50 text-teal-600',
  rose: 'bg-rose-50 text-rose-600',
  orange: 'bg-orange-50 text-orange-600',
};

export interface SalesAnalyticsProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Range presets metadata
// ---------------------------------------------------------------------------

const PRESETS: { key: RangePreset; label: string; description: string }[] = [
  { key: '7d', label: '7D', description: 'Last 7 days' },
  { key: '30d', label: '30D', description: 'Last 30 days' },
  { key: '90d', label: '90D', description: 'Last 90 days' },
  { key: '12m', label: '12M', description: 'Last 12 months' },
  { key: 'all', label: 'All', description: 'All time' },
];

const TREND_METRICS: { key: 'revenue' | 'orders' | 'units'; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'orders', label: 'Orders' },
  { key: 'units', label: 'Units' },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const formatCount = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH');

const formatPct1 = (n: number): string => `${(n * 100).toFixed(1)}%`;

const formatDeltaPct = (pct: number | null): string => {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (d: Date | null): string => {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const Delta: React.FC<{ delta: DeltaType | null; compact?: boolean }> = ({
  delta,
  compact = false,
}) => {
  const pct = delta?.deltaPct ?? null;
  const isNull = pct === null || !Number.isFinite(pct);
  const positive = !isNull && (pct as number) > 0;
  const negative = !isNull && (pct as number) < 0;

  const tone = positive
    ? 'text-emerald-600 bg-emerald-50'
    : negative
    ? 'text-rose-600 bg-rose-50'
    : 'text-gray-400 bg-gray-100';

  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-semibold ${tone} ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      aria-label={`Change versus previous period: ${formatDeltaPct(pct)}`}
    >
      <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {formatDeltaPct(pct)}
    </span>
  );
};

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string; // tailwind color name, e.g. 'brand', 'blue'
  label: string;
  value: string;
  delta: DeltaType | null;
  loading?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  iconColor,
  label,
  value,
  delta,
  loading,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse" />
        </div>
        <div className="mt-4 h-4 w-24 rounded bg-gray-100 animate-pulse" />
        <div className="mt-2 h-7 w-32 rounded bg-gray-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            ICON_CHIP[iconColor] ?? ICON_CHIP.brand
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <Delta delta={delta} />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
};

interface SectionCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon: Icon,
  iconColor,
  action,
  className = '',
  children,
}) => (
  <section
    className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 ${className}`}
  >
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-brand-600 rounded-full" />
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-lg hidden sm:flex items-center justify-center ${
              ICON_CHIP[iconColor] ?? ICON_CHIP.brand
            }`}
          >
            <Icon className="w-4 h-4" />
          </span>
          {title}
        </h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const EmptyState: React.FC<{ message?: string }> = ({
  message = 'No sales in this period yet',
}) => (
  <div className="flex items-center justify-center rounded-xl bg-gray-50 py-10 text-sm text-gray-400">
    {message}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ onBack }) => {
  const { orders, products, categories, loading, lastUpdated, refresh } =
    useAnalytics();

  const [preset, setPreset] = useState<RangePreset>('30d');
  const [trendMetric, setTrendMetric] = useState<'revenue' | 'orders' | 'units'>(
    'revenue'
  );

  // Capture "now" once so the page is stable across re-renders.
  const nowRef = useRef<Date>(new Date());
  const now = nowRef.current;

  // First order date drives the 'all' preset.
  const firstOrderDate = useMemo(() => {
    let min = Infinity;
    for (const o of orders) {
      const t = new Date(o.created_at).getTime();
      if (!Number.isNaN(t) && t < min) min = t;
    }
    return Number.isFinite(min) ? new Date(min) : undefined;
  }, [orders]);

  // Lookup maps.
  const productMap = useMemo(() => {
    const m = new Map<string, ProductLite>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  // Ranges.
  const range = useMemo(
    () => getPresetRange(preset, now, firstOrderDate),
    [preset, now, firstOrderDate]
  );
  const prev = useMemo(() => previousRange(range), [range]);
  const granularity = useMemo(() => autoGranularity(range), [range]);

  // Range-scoped order sets.
  const currentOrders = useMemo(
    () => filterByRange(orders, range),
    [orders, range]
  );
  const previousOrders = useMemo(
    () => filterByRange(orders, prev),
    [orders, prev]
  );

  // KPIs.
  const kpis = useMemo(
    () => computeKpiSummary(currentOrders, previousOrders),
    [currentOrders, previousOrders]
  );

  // Time series (current + previous, aligned by index).
  const series = useMemo(
    () => buildTimeSeries(currentOrders, range, granularity),
    [currentOrders, range, granularity]
  );
  const prevSeries = useMemo(
    () => buildTimeSeries(previousOrders, prev, granularity),
    [previousOrders, prev, granularity]
  );

  const trendData = useMemo(
    () =>
      series.map((p) => ({ label: p.label, value: p[trendMetric] })),
    [series, trendMetric]
  );
  // Align the previous-period series to the current series strictly by bucket
  // position. The two windows can bucket into a DIFFERENT number of (partial)
  // weeks for the 90d preset, so we right-align (most-recent bucket to
  // most-recent bucket) and force trendComparison.length === series.length:
  // truncate the longer prev series, and pad a shorter one at the front with
  // zero-value points. This guarantees index-correspondence and prevents the
  // comparison line from drawing off the right edge of the plot.
  const trendComparison = useMemo(() => {
    const n = series.length;
    if (n === 0) return [];
    return series.map((cur, i) => {
      // Offset prev so its last bucket lines up with the current last bucket.
      const prevIdx = prevSeries.length - n + i;
      const prevPoint =
        prevIdx >= 0 && prevIdx < prevSeries.length
          ? prevSeries[prevIdx]
          : null;
      return {
        label: cur.label,
        value: prevPoint ? prevPoint[trendMetric] : 0,
      };
    });
  }, [prevSeries, series, trendMetric]);

  // Breakdowns.
  const statuses = useMemo(
    () => statusBreakdown(currentOrders),
    [currentOrders]
  );
  const validOrderCount = useMemo(
    () =>
      statuses
        .filter((s) => s.status !== 'cancelled')
        .reduce((sum, s) => sum + s.orders, 0),
    [statuses]
  );

  const categoryStats = useMemo(
    () => categoryBreakdown(currentOrders, productMap, categoryMap),
    [currentOrders, productMap, categoryMap]
  );

  const products10 = useMemo(
    () => topProducts(currentOrders, previousOrders, productMap, categoryMap, 8),
    [currentOrders, previousOrders, productMap, categoryMap]
  );
  const variations = useMemo(
    () => topVariations(currentOrders, 8),
    [currentOrders]
  );

  // Per-product per-bucket revenue, for sparklines.
  const productSparkData = useMemo(() => {
    const map = new Map<string, number[]>();
    // Bucket each order's items into the matching series index by date
    // (the last bucket whose start <= the order's created_at).
    const bucketIndexForOrder = (createdAt: string): number => {
      const t = new Date(createdAt).getTime();
      if (Number.isNaN(t) || series.length === 0) return -1;
      // Find the last bucket whose start <= t.
      let idx = -1;
      for (let i = 0; i < series.length; i++) {
        if (new Date(series[i].date).getTime() <= t) idx = i;
        else break;
      }
      return idx;
    };
    for (const id of products10.map((p) => p.product_id)) {
      map.set(id, new Array(series.length).fill(0));
    }
    for (const o of currentOrders) {
      if (o.order_status === 'cancelled') continue;
      const idx = bucketIndexForOrder(o.created_at);
      if (idx < 0) continue;
      for (const it of o.order_items) {
        const arr = map.get(it.product_id);
        if (arr) arr[idx] += Number(it.total) || 0;
      }
    }
    return map;
  }, [currentOrders, series, products10]);

  // Customers.
  const mix = useMemo(
    () => customerMix(currentOrders, orders, range),
    [currentOrders, orders, range]
  );
  const customers = useMemo(
    () => customerStats(currentOrders).slice(0, 8),
    [currentOrders]
  );

  // Channels & geography.
  const byPayment = useMemo(
    () => breakdownBy(currentOrders, 'payment_method_name'),
    [currentOrders]
  );
  const byLocation = useMemo(
    () => breakdownBy(currentOrders, 'shipping_location'),
    [currentOrders]
  );
  const byContact = useMemo(
    () => breakdownBy(currentOrders, 'contact_method'),
    [currentOrders]
  );

  // Peak times.
  const heatCells = useMemo(
    () =>
      orderHeatmap(currentOrders).map((c) => ({
        day: c.day,
        hour: c.hour,
        value: c.orders,
      })),
    [currentOrders]
  );
  const weekday = useMemo(
    () =>
      ordersByWeekday(currentOrders).map((w) => ({
        label: w.label,
        value: w.orders,
      })),
    [currentOrders]
  );

  // Inventory watch.
  const lowStock = useMemo(
    () => lowStockMovers(products, currentOrders, 10),
    [products, currentOrders]
  );

  const presetMeta =
    PRESETS.find((p) => p.key === preset) ?? PRESETS[1];

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  const handleExport = () => {
    const trendRows = series.map((p, i) => {
      // Right-align the previous series so its most-recent bucket maps to the
      // current most-recent bucket (the two windows can have different bucket
      // counts for the 90d/week preset). Matches the on-screen comparison line.
      const prevIdx = prevSeries.length - series.length + i;
      const prevPoint =
        prevIdx >= 0 && prevIdx < prevSeries.length ? prevSeries[prevIdx] : null;
      return {
        section: 'time_series',
        bucket: p.label,
        date: p.date.slice(0, 10),
        revenue: Math.round(p.revenue),
        orders: p.orders,
        units: p.units,
        prev_revenue: Math.round(prevPoint?.revenue ?? 0),
        prev_orders: prevPoint?.orders ?? 0,
        prev_units: prevPoint?.units ?? 0,
      };
    });

    const productRows = products10.map((p, i) => ({
      section: 'top_products',
      bucket: '',
      date: '',
      rank: i + 1,
      product: p.product_name,
      category: p.category ?? '',
      units: p.units,
      revenue: Math.round(p.revenue),
      share_pct: (p.share * 100).toFixed(1),
      delta_pct: p.deltaPct === null ? '' : p.deltaPct.toFixed(1),
    }));

    // toCsv derives its header from the first row's keys only, so normalize
    // every row to one shared schema (filling missing keys with '') — otherwise
    // the product-only columns (rank/product/category/share_pct/delta_pct)
    // would be silently dropped from the export.
    const rawRows: Record<string, unknown>[] = [...trendRows, ...productRows];
    const headerKeys = [...new Set(rawRows.flatMap((r) => Object.keys(r)))];
    const rows: Record<string, unknown>[] = rawRows.map((r) => {
      const normalized: Record<string, unknown> = {};
      for (const k of headerKeys) normalized[k] = k in r ? r[k] : '';
      return normalized;
    });
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pepper-aunie-sales-${preset}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasAnyData = currentOrders.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                aria-label="Back to dashboard"
                className="group flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  Sales Analytics
                </h1>
                <p className="text-xs text-gray-500">
                  {presetMeta.description}
                  {lastUpdated
                    ? ` · Updated ${formatDateTime(lastUpdated)}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Date range segmented control */}
              <div
                className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                role="group"
                aria-label="Select date range"
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPreset(p.key)}
                    aria-pressed={preset === p.key}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                      preset === p.key
                        ? 'bg-white text-brand-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                onClick={refresh}
                aria-label="Refresh data"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleExport}
                aria-label="Export CSV"
                className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white transition-all hover:bg-brand-700"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* 2. KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={TrendingUp}
            iconColor="brand"
            label="Total Revenue"
            value={formatPrice(kpis.grossRevenue.value)}
            delta={kpis.grossRevenue}
            loading={loading}
          />
          <KpiCard
            icon={ShoppingCart}
            iconColor="blue"
            label="Orders"
            value={formatCount(kpis.orderCount.value)}
            delta={kpis.orderCount}
            loading={loading}
          />
          <KpiCard
            icon={Receipt}
            iconColor="violet"
            label="Avg Order Value"
            value={formatPrice(kpis.avgOrderValue.value)}
            delta={kpis.avgOrderValue}
            loading={loading}
          />
          <KpiCard
            icon={Boxes}
            iconColor="amber"
            label="Units Sold"
            value={formatCount(kpis.unitsSold.value)}
            delta={kpis.unitsSold}
            loading={loading}
          />
          <KpiCard
            icon={Users}
            iconColor="cyan"
            label="Unique Customers"
            value={formatCount(kpis.uniqueCustomers.value)}
            delta={kpis.uniqueCustomers}
            loading={loading}
          />
          <KpiCard
            icon={Wallet}
            iconColor="emerald"
            label="Paid Revenue"
            value={formatPrice(kpis.paidRevenue.value)}
            delta={kpis.paidRevenue}
            loading={loading}
          />
        </div>

        {/* 3. Revenue trend */}
        <SectionCard
          title="Revenue Trend"
          icon={LineChartIcon}
          iconColor="brand"
          action={
            <div
              className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
              role="group"
              aria-label="Select trend metric"
            >
              {TREND_METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setTrendMetric(m.key)}
                  aria-pressed={trendMetric === m.key}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    trendMetric === m.key
                      ? 'bg-white text-brand-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <div className="h-[260px] animate-pulse rounded-xl bg-gray-100" />
          ) : trendData.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <AreaChart
                data={trendData}
                comparison={trendComparison}
                height={260}
                valueFormatter={
                  trendMetric === 'revenue' ? formatCompactPHP : formatCount
                }
                ariaLabel={`${
                  TREND_METRICS.find((m) => m.key === trendMetric)?.label
                } over ${presetMeta.description}`}
              />
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-3 rounded-full"
                    style={{ backgroundColor: BRAND }}
                  />
                  Current period
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-gray-400" />
                  Previous period
                </span>
              </div>
            </>
          )}
        </SectionCard>

        {/* 4. Status + Category */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title="Orders by Status" icon={PieChart} iconColor="blue">
            {loading ? (
              <div className="h-[220px] animate-pulse rounded-xl bg-gray-100" />
            ) : statuses.length === 0 ? (
              <EmptyState message="No orders in this period yet" />
            ) : (
              <DonutChart
                data={statuses.map((s) => ({
                  label:
                    s.status.charAt(0).toUpperCase() + s.status.slice(1),
                  value: s.orders,
                }))}
                size={200}
                valueFormatter={formatCount}
                centerValue={formatCount(validOrderCount)}
                centerLabel="Valid orders"
              />
            )}
          </SectionCard>

          <SectionCard title="Sales by Category" icon={Layers} iconColor="pink">
            {loading ? (
              <div className="h-[220px] animate-pulse rounded-xl bg-gray-100" />
            ) : categoryStats.length === 0 ? (
              <EmptyState />
            ) : (
              <HBarList
                data={categoryStats.map((c) => ({
                  label: c.category,
                  value: c.revenue,
                  sublabel: `${formatCount(c.units)} units · ${formatPct1(
                    c.share
                  )}`,
                }))}
                valueFormatter={formatCompactPHP}
              />
            )}
          </SectionCard>
        </div>

        {/* 5. Product trends */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard
            title="Top Products"
            icon={Trophy}
            iconColor="amber"
            className="xl:col-span-2"
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-gray-100"
                  />
                ))}
              </div>
            ) : products10.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2 text-right">Units</th>
                      <th className="px-2 py-2 text-right">Revenue</th>
                      <th className="px-2 py-2 text-right">Share</th>
                      <th className="px-2 py-2 text-center">Trend</th>
                      <th className="px-2 py-2 text-right">vs Prev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products10.map((p, i) => (
                      <tr
                        key={p.product_id || p.product_name}
                        className="border-b border-gray-50 transition-colors hover:bg-gray-50/60"
                      >
                        <td className="px-2 py-2.5 font-semibold text-gray-400 tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="block truncate font-medium text-gray-900">
                            {p.product_name}
                          </span>
                          <span className="block truncate text-xs text-gray-400">
                            {p.category ?? 'Uncategorized'}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                          {formatCount(p.units)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                          {formatPrice(p.revenue)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">
                          {formatPct1(p.share)}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex justify-center">
                            <Sparkline
                              data={productSparkData.get(p.product_id) ?? []}
                              width={72}
                              height={22}
                              ariaLabel={`${p.product_name} revenue trend`}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Delta
                            delta={{
                              value: p.revenue,
                              previous: p.prevRevenue,
                              deltaPct: p.deltaPct,
                            }}
                            compact
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Top Variations" icon={Boxes} iconColor="violet">
            {loading ? (
              <div className="h-[220px] animate-pulse rounded-xl bg-gray-100" />
            ) : variations.length === 0 ? (
              <EmptyState />
            ) : (
              <HBarList
                data={variations.map((v) => ({
                  label: v.variation_name
                    ? `${v.product_name} · ${v.variation_name}`
                    : v.product_name,
                  value: v.revenue,
                  sublabel: `${formatCount(v.units)} units`,
                }))}
                valueFormatter={formatCompactPHP}
              />
            )}
          </SectionCard>
        </div>

        {/* 6. Customer insights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SectionCard
            title="Customer Mix"
            icon={UserPlus}
            iconColor="cyan"
          >
            {loading ? (
              <div className="h-[200px] animate-pulse rounded-xl bg-gray-100" />
            ) : mix.totalCustomers === 0 ? (
              <EmptyState message="No customers in this period yet" />
            ) : (
              <div className="space-y-5">
                <DonutChart
                  data={[
                    { label: 'New', value: mix.newCustomers, color: BRAND },
                    {
                      label: 'Returning',
                      value: mix.returningCustomers,
                      color: '#0EA5E9',
                    },
                  ]}
                  size={180}
                  valueFormatter={formatCount}
                  centerValue={formatCount(mix.totalCustomers)}
                  centerLabel="Customers"
                />
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Repeat rate (all-time)
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatPct1(mix.repeatRate)}
                  </p>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Top Customers"
            icon={Trophy}
            iconColor="emerald"
            className="lg:col-span-2"
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-gray-100"
                  />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <EmptyState message="No customers in this period yet" />
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400">
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2 text-right">Orders</th>
                      <th className="px-2 py-2 text-right">LTV</th>
                      <th className="px-2 py-2 text-right">Last order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.email}
                        className="border-b border-gray-50 transition-colors hover:bg-gray-50/60"
                      >
                        <td className="px-2 py-2.5">
                          <span className="block truncate font-medium text-gray-900">
                            {c.name || c.email}
                          </span>
                          <span className="block truncate text-xs text-gray-400">
                            {c.email}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                          {formatCount(c.orders)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                          {formatPrice(c.revenue)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-gray-500">
                          {formatDate(c.lastOrder)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* 7. Channels & geography */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SectionCard
            title="Payment Methods"
            icon={CreditCard}
            iconColor="indigo"
          >
            {loading ? (
              <div className="h-[180px] animate-pulse rounded-xl bg-gray-100" />
            ) : byPayment.length === 0 ? (
              <EmptyState />
            ) : (
              <HBarList
                data={byPayment.map((s) => ({
                  label: s.label,
                  value: s.revenue,
                  sublabel: `${formatCount(s.orders)} orders · ${formatPct1(
                    s.share
                  )}`,
                }))}
                valueFormatter={formatCompactPHP}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Shipping Locations"
            icon={Layers}
            iconColor="teal"
          >
            {loading ? (
              <div className="h-[180px] animate-pulse rounded-xl bg-gray-100" />
            ) : byLocation.length === 0 ? (
              <EmptyState />
            ) : (
              <HBarList
                data={byLocation.map((s) => ({
                  label: s.label,
                  value: s.revenue,
                  sublabel: `${formatCount(s.orders)} orders · ${formatPct1(
                    s.share
                  )}`,
                }))}
                valueFormatter={formatCompactPHP}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Contact Channels"
            icon={Users}
            iconColor="rose"
          >
            {loading ? (
              <div className="h-[180px] animate-pulse rounded-xl bg-gray-100" />
            ) : byContact.length === 0 ? (
              <EmptyState />
            ) : (
              <HBarList
                data={byContact.map((s) => ({
                  label: s.label,
                  value: s.revenue,
                  sublabel: `${formatCount(s.orders)} orders · ${formatPct1(
                    s.share
                  )}`,
                }))}
                valueFormatter={formatCompactPHP}
              />
            )}
          </SectionCard>
        </div>

        {/* 8. Peak ordering times */}
        <SectionCard
          title="Peak Ordering Times"
          icon={Clock}
          iconColor="orange"
        >
          {loading ? (
            <div className="h-[200px] animate-pulse rounded-xl bg-gray-100" />
          ) : !hasAnyData ? (
            <EmptyState message="No orders in this period yet" />
          ) : (
            <div className="space-y-6">
              <HeatmapChart
                cells={heatCells}
                valueFormatter={(n) => `${formatCount(n)} orders`}
                ariaLabel="Orders by day of week and hour of day"
              />
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Orders by weekday
                </p>
                <BarChart
                  data={weekday}
                  height={180}
                  valueFormatter={formatCount}
                  ariaLabel="Orders by weekday"
                />
              </div>
            </div>
          )}
        </SectionCard>

        {/* 9. Inventory watch (hidden when none) */}
        {!loading && lowStock.length > 0 && (
          <SectionCard
            title="Inventory Watch"
            icon={AlertTriangle}
            iconColor="amber"
          >
            <p className="-mt-2 mb-4 text-sm text-gray-500">
              Fast-moving products running low on stock.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lowStock.map((m) => (
                <div
                  key={m.product_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {m.name}
                    </span>
                    <span className="text-xs text-amber-700">
                      {formatCount(m.unitsSold)} sold this period
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-base font-bold text-amber-700 tabular-nums">
                      {formatCount(m.stock)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-600">
                      left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </main>
    </div>
  );
};

export default SalesAnalytics;
