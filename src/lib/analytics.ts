// Pure analytics functions for the Pepper Aunie store.
// NO React, NO Supabase imports. Every function must be defensive:
// coerce numbers with Number(x) || 0, guard divide-by-zero, tolerate
// missing / empty arrays, and never read the system clock (time is
// always passed in as `now` / `range`).

// ---------------------------------------------------------------------------
// Raw data shapes (mirror the live Supabase rows)
// ---------------------------------------------------------------------------

export interface RawOrderItem {
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string | null;
  quantity: number;
  price: number;
  total: number;
  purity_percentage?: number;
}

export interface RawOrder {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  total_price: number;
  shipping_fee: number | null;
  discount_applied: number | null;
  payment_method_name: string | null;
  payment_status: string;
  order_status: string;
  shipping_location: string | null;
  contact_method: string | null;
  order_items: RawOrderItem[];
  created_at: string;
}

export interface ProductLite {
  id: string;
  name: string;
  category: string;
  stock_quantity: number;
  base_price: number;
}

export interface CategoryLite {
  id: string;
  name: string;
}

export type Granularity = 'day' | 'week' | 'month';
export type RangePreset = '7d' | '30d' | '90d' | '12m' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
} // [start, end) half-open; end is exclusive upper bound

// ---------------------------------------------------------------------------
// Internal numeric helpers
// ---------------------------------------------------------------------------

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const safeDiv = (numerator: number, denominator: number): number => {
  if (!denominator) return 0;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : 0;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const itemsOf = (o: RawOrder): RawOrderItem[] =>
  Array.isArray(o.order_items) ? o.order_items : [];

const unitsOf = (o: RawOrder): number =>
  itemsOf(o).reduce((sum, it) => sum + num(it.quantity), 0);

// ---------------------------------------------------------------------------
// Validity / filtering
// ---------------------------------------------------------------------------

export function isValidOrder(o: RawOrder): boolean {
  return !!o && o.order_status !== 'cancelled';
}

export function validOrders(orders: RawOrder[]): RawOrder[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isValidOrder);
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export function getPresetRange(
  preset: RangePreset,
  now: Date,
  firstOrderDate?: Date
): DateRange {
  // `end` is exclusive: the instant just after `now`.
  const end = new Date(now.getTime());
  const start = new Date(now.getTime());

  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '12m':
      start.setMonth(start.getMonth() - 12);
      break;
    case 'all': {
      if (firstOrderDate && !Number.isNaN(firstOrderDate.getTime())) {
        return { start: new Date(firstOrderDate.getTime()), end };
      }
      // Fallback when no first-order date is known: a very wide window.
      const wide = new Date(now.getTime());
      wide.setFullYear(wide.getFullYear() - 100);
      return { start: wide, end };
    }
    default:
      start.setDate(start.getDate() - 30);
      break;
  }
  return { start, end };
}

export function previousRange(range: DateRange): DateRange {
  const start = range?.start instanceof Date ? range.start : new Date(0);
  const end = range?.end instanceof Date ? range.end : new Date(0);
  const length = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - length);
  return { start: prevStart, end: prevEnd };
}

export function autoGranularity(range: DateRange): Granularity {
  const start = range?.start instanceof Date ? range.start : new Date(0);
  const end = range?.end instanceof Date ? range.end : new Date(0);
  const days = Math.max(0, (end.getTime() - start.getTime()) / MS_PER_DAY);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

export function filterByRange(orders: RawOrder[], range: DateRange): RawOrder[] {
  if (!Array.isArray(orders)) return [];
  const startMs = range?.start instanceof Date ? range.start.getTime() : -Infinity;
  const endMs = range?.end instanceof Date ? range.end.getTime() : Infinity;
  return orders.filter((o) => {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return t >= startMs && t < endMs;
  });
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface Kpis {
  grossRevenue: number;
  productRevenue: number;
  shippingRevenue: number;
  paidRevenue: number;
  discounts: number;
  orderCount: number;
  unitsSold: number;
  avgOrderValue: number;
  uniqueCustomers: number;
}

export function computeKpis(orders: RawOrder[]): Kpis {
  const valid = validOrders(orders);

  let productRevenue = 0;
  let shippingRevenue = 0;
  let paidRevenue = 0;
  let discounts = 0;
  let unitsSold = 0;
  const customers = new Set<string>();

  for (const o of valid) {
    const product = num(o.total_price);
    productRevenue += product;
    shippingRevenue += num(o.shipping_fee);
    discounts += num(o.discount_applied);
    unitsSold += unitsOf(o);
    if (o.payment_status === 'paid') paidRevenue += product;
    const email = (o.customer_email || '').trim().toLowerCase();
    if (email) customers.add(email);
  }

  const grossRevenue = productRevenue + shippingRevenue;
  const orderCount = valid.length;

  return {
    grossRevenue,
    productRevenue,
    shippingRevenue,
    paidRevenue,
    discounts,
    orderCount,
    unitsSold,
    avgOrderValue: safeDiv(grossRevenue, orderCount),
    uniqueCustomers: customers.size,
  };
}

export interface Delta {
  value: number;
  previous: number;
  deltaPct: number | null;
} // deltaPct null when previous===0 (or 0 when both 0)

export function withDelta(value: number, previous: number): Delta {
  const v = num(value);
  const p = num(previous);
  let deltaPct: number | null;
  if (p === 0) {
    // No baseline to compute a percentage against.
    deltaPct = v === 0 ? 0 : null;
  } else {
    deltaPct = ((v - p) / p) * 100;
    if (!Number.isFinite(deltaPct)) deltaPct = null;
  }
  return { value: v, previous: p, deltaPct };
}

export type KpiSummary = { [K in keyof Kpis]: Delta };

export function computeKpiSummary(
  current: RawOrder[],
  previous: RawOrder[]
): KpiSummary {
  const cur = computeKpis(current);
  const prev = computeKpis(previous);
  const keys = Object.keys(cur) as (keyof Kpis)[];
  const out = {} as KpiSummary;
  for (const k of keys) {
    out[k] = withDelta(cur[k], prev[k]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export interface TimePoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
}

const startOfDay = (d: Date): Date => {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfWeek = (d: Date): Date => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay()); // back to Sunday
  return x;
};

const startOfMonth = (d: Date): Date => {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
};

const bucketStart = (d: Date, g: Granularity): Date => {
  switch (g) {
    case 'week':
      return startOfWeek(d);
    case 'month':
      return startOfMonth(d);
    case 'day':
    default:
      return startOfDay(d);
  }
};

const advanceBucket = (d: Date, g: Granularity): Date => {
  const x = new Date(d.getTime());
  switch (g) {
    case 'week':
      x.setDate(x.getDate() + 7);
      break;
    case 'month':
      x.setMonth(x.getMonth() + 1);
      break;
    case 'day':
    default:
      x.setDate(x.getDate() + 1);
      break;
  }
  return x;
};

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const bucketLabel = (d: Date, g: Granularity): string => {
  const mon = MONTH_SHORT[d.getMonth()] ?? '';
  if (g === 'month') return `${mon} ${d.getFullYear()}`;
  return `${mon} ${d.getDate()}`; // day & week both labelled by their start date
};

const bucketKey = (d: Date, g: Granularity): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (g === 'month') return `${y}-${m}`;
  return `${y}-${m}-${day}`;
};

export function buildTimeSeries(
  orders: RawOrder[],
  range: DateRange,
  granularity: Granularity
): TimePoint[] {
  const start = range?.start instanceof Date ? range.start : new Date(0);
  const end = range?.end instanceof Date ? range.end : new Date(0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  // Pre-build a continuous list of zero-filled buckets covering [start, end).
  const buckets: TimePoint[] = [];
  const indexByKey = new Map<string, number>();

  let cursor = bucketStart(start, granularity);
  // Safety cap to avoid runaway loops on absurd ranges.
  let guard = 0;
  const MAX_BUCKETS = 100000;
  while (cursor.getTime() < end.getTime() && guard < MAX_BUCKETS) {
    const key = bucketKey(cursor, granularity);
    indexByKey.set(key, buckets.length);
    buckets.push({
      date: cursor.toISOString(),
      label: bucketLabel(cursor, granularity),
      revenue: 0,
      orders: 0,
      units: 0,
    });
    cursor = advanceBucket(cursor, granularity);
    guard += 1;
  }

  for (const o of validOrders(orders)) {
    const created = new Date(o.created_at);
    if (Number.isNaN(created.getTime())) continue;
    if (created.getTime() < start.getTime() || created.getTime() >= end.getTime())
      continue;
    const key = bucketKey(bucketStart(created, granularity), granularity);
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    const point = buckets[idx];
    point.revenue += num(o.total_price) + num(o.shipping_fee);
    point.orders += 1;
    point.units += unitsOf(o);
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Products / variations / categories
// ---------------------------------------------------------------------------

export interface ProductStat {
  product_id: string;
  product_name: string;
  category: string | null;
  revenue: number;
  units: number;
  orderCount: number;
  share: number;
  prevRevenue: number;
  deltaPct: number | null;
}

interface ProductAgg {
  product_id: string;
  product_name: string;
  revenue: number;
  units: number;
  orderIds: Set<string>;
}

const aggregateProducts = (orders: RawOrder[]): Map<string, ProductAgg> => {
  const map = new Map<string, ProductAgg>();
  for (const o of validOrders(orders)) {
    for (const it of itemsOf(o)) {
      const id = it.product_id || it.product_name || 'unknown';
      let agg = map.get(id);
      if (!agg) {
        agg = {
          product_id: it.product_id || '',
          product_name: it.product_name || 'Unknown product',
          revenue: 0,
          units: 0,
          orderIds: new Set<string>(),
        };
        map.set(id, agg);
      }
      agg.revenue += num(it.total);
      agg.units += num(it.quantity);
      if (o.id) agg.orderIds.add(o.id);
    }
  }
  return map;
};

export function topProducts(
  current: RawOrder[],
  previous: RawOrder[],
  productMap: Map<string, ProductLite>,
  categoryMap: Map<string, string>,
  limit = 10
): ProductStat[] {
  const curAgg = aggregateProducts(current);
  const prevAgg = aggregateProducts(previous);

  let totalRevenue = 0;
  for (const agg of curAgg.values()) totalRevenue += agg.revenue;

  const stats: ProductStat[] = [];
  for (const [id, agg] of curAgg) {
    const product = productMap?.get(id);
    const categoryId = product?.category;
    const category =
      categoryId !== undefined
        ? categoryMap?.get(categoryId) ?? categoryId ?? null
        : null;
    const prevRevenue = prevAgg.get(id)?.revenue ?? 0;
    stats.push({
      product_id: agg.product_id,
      product_name: agg.product_name,
      category: category ?? null,
      revenue: agg.revenue,
      units: agg.units,
      orderCount: agg.orderIds.size,
      share: safeDiv(agg.revenue, totalRevenue),
      prevRevenue,
      deltaPct: withDelta(agg.revenue, prevRevenue).deltaPct,
    });
  }

  stats.sort((a, b) => b.revenue - a.revenue);
  const lim = Number.isFinite(limit) && limit > 0 ? limit : stats.length;
  return stats.slice(0, lim);
}

export interface VariationStat {
  key: string;
  product_name: string;
  variation_name: string | null;
  revenue: number;
  units: number;
}

export function topVariations(orders: RawOrder[], limit = 10): VariationStat[] {
  const map = new Map<string, VariationStat>();
  for (const o of validOrders(orders)) {
    for (const it of itemsOf(o)) {
      const variationKey =
        it.variation_id ?? it.variation_name ?? '__none__';
      const key = `${it.product_id || it.product_name || 'unknown'}::${variationKey}`;
      let stat = map.get(key);
      if (!stat) {
        stat = {
          key,
          product_name: it.product_name || 'Unknown product',
          variation_name: it.variation_name ?? null,
          revenue: 0,
          units: 0,
        };
        map.set(key, stat);
      }
      stat.revenue += num(it.total);
      stat.units += num(it.quantity);
    }
  }
  const stats = [...map.values()].sort((a, b) => b.revenue - a.revenue);
  const lim = Number.isFinite(limit) && limit > 0 ? limit : stats.length;
  return stats.slice(0, lim);
}

export interface CategoryStat {
  categoryId: string;
  category: string;
  revenue: number;
  units: number;
  share: number;
}

const UNCATEGORIZED = 'Uncategorized';

export function categoryBreakdown(
  orders: RawOrder[],
  productMap: Map<string, ProductLite>,
  categoryMap: Map<string, string>
): CategoryStat[] {
  const map = new Map<string, CategoryStat>();
  let totalRevenue = 0;

  for (const o of validOrders(orders)) {
    for (const it of itemsOf(o)) {
      const product = productMap?.get(it.product_id);
      let categoryId: string;
      let categoryName: string;
      if (product && product.category) {
        categoryId = product.category;
        categoryName = categoryMap?.get(product.category) ?? UNCATEGORIZED;
      } else {
        categoryId = UNCATEGORIZED;
        categoryName = UNCATEGORIZED;
      }
      let stat = map.get(categoryId);
      if (!stat) {
        stat = {
          categoryId,
          category: categoryName,
          revenue: 0,
          units: 0,
          share: 0,
        };
        map.set(categoryId, stat);
      }
      const rev = num(it.total);
      stat.revenue += rev;
      stat.units += num(it.quantity);
      totalRevenue += rev;
    }
  }

  const stats = [...map.values()];
  for (const s of stats) s.share = safeDiv(s.revenue, totalRevenue);
  stats.sort((a, b) => b.revenue - a.revenue);
  return stats;
}

// ---------------------------------------------------------------------------
// Segment / status breakdowns
// ---------------------------------------------------------------------------

export interface SegmentStat {
  label: string;
  revenue: number;
  orders: number;
  share: number;
}

const UNKNOWN = 'Unknown';

export function breakdownBy(
  orders: RawOrder[],
  key: 'payment_method_name' | 'shipping_location' | 'contact_method'
): SegmentStat[] {
  const map = new Map<string, SegmentStat>();
  let totalRevenue = 0;

  for (const o of validOrders(orders)) {
    const raw = o[key];
    const label = raw === null || raw === undefined || raw === '' ? UNKNOWN : raw;
    let stat = map.get(label);
    if (!stat) {
      stat = { label, revenue: 0, orders: 0, share: 0 };
      map.set(label, stat);
    }
    const rev = num(o.total_price) + num(o.shipping_fee);
    stat.revenue += rev;
    stat.orders += 1;
    totalRevenue += rev;
  }

  const stats = [...map.values()];
  for (const s of stats) s.share = safeDiv(s.revenue, totalRevenue);
  stats.sort((a, b) => b.revenue - a.revenue);
  return stats;
}

export interface StatusStat {
  status: string;
  orders: number;
  revenue: number;
}

export function statusBreakdown(orders: RawOrder[]): StatusStat[] {
  // Counts ALL orders (cancelled included) by order_status.
  const map = new Map<string, StatusStat>();
  const list = Array.isArray(orders) ? orders : [];
  for (const o of list) {
    const status = o.order_status || UNKNOWN;
    let stat = map.get(status);
    if (!stat) {
      stat = { status, orders: 0, revenue: 0 };
      map.set(status, stat);
    }
    stat.orders += 1;
    stat.revenue += num(o.total_price) + num(o.shipping_fee);
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders);
}

export function paymentStatusBreakdown(orders: RawOrder[]): StatusStat[] {
  // By payment_status over VALID orders only.
  const map = new Map<string, StatusStat>();
  for (const o of validOrders(orders)) {
    const status = o.payment_status || UNKNOWN;
    let stat = map.get(status);
    if (!stat) {
      stat = { status, orders: 0, revenue: 0 };
      map.set(status, stat);
    }
    stat.orders += 1;
    stat.revenue += num(o.total_price) + num(o.shipping_fee);
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerStat {
  email: string;
  name: string;
  orders: number;
  revenue: number;
  firstOrder: string;
  lastOrder: string;
}

export function customerStats(orders: RawOrder[]): CustomerStat[] {
  const map = new Map<string, CustomerStat>();
  for (const o of validOrders(orders)) {
    const email = (o.customer_email || '').trim().toLowerCase();
    if (!email) continue;
    const created = o.created_at;
    const createdMs = new Date(created).getTime();
    let stat = map.get(email);
    if (!stat) {
      stat = {
        email,
        name: o.customer_name || '',
        orders: 0,
        revenue: 0,
        firstOrder: created,
        lastOrder: created,
      };
      map.set(email, stat);
    }
    stat.orders += 1;
    stat.revenue += num(o.total_price) + num(o.shipping_fee);
    if (!Number.isNaN(createdMs)) {
      if (createdMs < new Date(stat.firstOrder).getTime()) stat.firstOrder = created;
      if (createdMs > new Date(stat.lastOrder).getTime()) stat.lastOrder = created;
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface CustomerMix {
  newCustomers: number;
  returningCustomers: number;
  repeatRate: number;
  totalCustomers: number;
}

export function customerMix(
  rangeOrders: RawOrder[],
  allOrders: RawOrder[],
  range: DateRange
): CustomerMix {
  const startMs = range?.start instanceof Date ? range.start.getTime() : -Infinity;

  // First-ever order timestamp per customer across ALL valid orders, plus
  // lifetime order counts for repeat-rate.
  const firstEver = new Map<string, number>();
  const lifetimeCount = new Map<string, number>();
  for (const o of validOrders(allOrders)) {
    const email = (o.customer_email || '').trim().toLowerCase();
    if (!email) continue;
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const prev = firstEver.get(email);
    if (prev === undefined || t < prev) firstEver.set(email, t);
    lifetimeCount.set(email, (lifetimeCount.get(email) ?? 0) + 1);
  }

  // Customers who ordered within the range.
  const inRange = new Set<string>();
  for (const o of validOrders(rangeOrders)) {
    const email = (o.customer_email || '').trim().toLowerCase();
    if (email) inRange.add(email);
  }

  let newCustomers = 0;
  let returningCustomers = 0;
  for (const email of inRange) {
    const first = firstEver.get(email);
    if (first === undefined) {
      // Not present in allOrders -> treat as new this range.
      newCustomers += 1;
    } else if (first >= startMs) {
      newCustomers += 1;
    } else {
      returningCustomers += 1;
    }
  }

  const totalLifetime = lifetimeCount.size;
  let repeaters = 0;
  for (const c of lifetimeCount.values()) if (c > 1) repeaters += 1;

  return {
    newCustomers,
    returningCustomers,
    repeatRate: safeDiv(repeaters, totalLifetime),
    totalCustomers: inRange.size,
  };
}

// ---------------------------------------------------------------------------
// Time-of-day / weekday heatmaps
// ---------------------------------------------------------------------------

export interface HeatCell {
  day: number; // 0=Sun..6=Sat
  hour: number; // 0..23
  orders: number;
  revenue: number;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function orderHeatmap(orders: RawOrder[]): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, orders: 0, revenue: 0 });
    }
  }
  for (const o of validOrders(orders)) {
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.getDay();
    const hour = d.getHours();
    const idx = day * 24 + hour;
    const cell = cells[idx];
    if (!cell) continue;
    cell.orders += 1;
    cell.revenue += num(o.total_price) + num(o.shipping_fee);
  }
  return cells;
}

export function ordersByWeekday(
  orders: RawOrder[]
): { day: number; label: string; orders: number; revenue: number }[] {
  const out = WEEKDAY_SHORT.map((label, day) => ({
    day,
    label,
    orders: 0,
    revenue: 0,
  }));
  for (const o of validOrders(orders)) {
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = out[d.getDay()];
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += num(o.total_price) + num(o.shipping_fee);
  }
  return out;
}

export function ordersByHour(
  orders: RawOrder[]
): { hour: number; orders: number; revenue: number }[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue: 0,
  }));
  for (const o of validOrders(orders)) {
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = out[d.getHours()];
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += num(o.total_price) + num(o.shipping_fee);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface LowStockMover {
  product_id: string;
  name: string;
  stock: number;
  unitsSold: number;
}

export function lowStockMovers(
  products: ProductLite[],
  orders: RawOrder[],
  threshold = 10
): LowStockMover[] {
  const soldById = new Map<string, number>();
  for (const o of validOrders(orders)) {
    for (const it of itemsOf(o)) {
      const id = it.product_id;
      if (!id) continue;
      soldById.set(id, (soldById.get(id) ?? 0) + num(it.quantity));
    }
  }

  const list = Array.isArray(products) ? products : [];
  const out: LowStockMover[] = [];
  for (const p of list) {
    const stock = num(p.stock_quantity);
    const unitsSold = soldById.get(p.id) ?? 0;
    if (stock <= threshold && unitsSold > 0) {
      out.push({ product_id: p.id, name: p.name, stock, unitsSold });
    }
  }
  out.sort((a, b) => b.unitsSold - a.unitsSold);
  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const PESO = '₱';

export function formatCompactPHP(n: number): string {
  const value = num(n);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `${sign}${PESO}${trimZero(abs / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${PESO}${trimZero(abs / 1_000)}k`;
  }
  // Whole pesos below 1000 (round to nearest peso).
  return `${sign}${PESO}${Math.round(abs).toLocaleString('en-US')}`;
}

const trimZero = (n: number): string => {
  // One decimal place, dropping a trailing ".0".
  const fixed = n.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
};

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    const s =
      value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines: string[] = [];
  lines.push(headers.map(escape).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\r\n');
}
