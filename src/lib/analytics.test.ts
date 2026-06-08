import { describe, it, expect } from 'vitest';
import {
  isValidOrder,
  validOrders,
  getPresetRange,
  previousRange,
  autoGranularity,
  filterByRange,
  computeKpis,
  withDelta,
  computeKpiSummary,
  buildTimeSeries,
  topProducts,
  topVariations,
  categoryBreakdown,
  breakdownBy,
  statusBreakdown,
  paymentStatusBreakdown,
  customerStats,
  customerMix,
  orderHeatmap,
  ordersByWeekday,
  ordersByHour,
  lowStockMovers,
  formatCompactPHP,
  toCsv,
} from './analytics';
import type {
  RawOrder,
  RawOrderItem,
  ProductLite,
  DateRange,
} from './analytics';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const item = (over: Partial<RawOrderItem> = {}): RawOrderItem => ({
  product_id: 'p1',
  product_name: 'BPC-157',
  variation_id: null,
  variation_name: null,
  quantity: 1,
  price: 100,
  total: 100,
  ...over,
});

const order = (over: Partial<RawOrder> = {}): RawOrder => ({
  id: 'o1',
  order_number: 'PPA-0001',
  customer_name: 'Alice',
  customer_email: 'alice@example.com',
  customer_phone: '0900',
  total_price: 1000,
  shipping_fee: 100,
  discount_applied: 0,
  payment_method_name: 'GCash',
  payment_status: 'paid',
  order_status: 'new',
  shipping_location: 'LBC_METRO_MANILA',
  contact_method: 'whatsapp',
  order_items: [item()],
  created_at: '2026-03-10T10:00:00.000Z',
  ...over,
});

// A small realistic dataset across dates / statuses / products.
const orders: RawOrder[] = [
  order({
    id: 'a',
    customer_email: 'alice@example.com',
    total_price: 1000,
    shipping_fee: 100,
    discount_applied: 50,
    payment_status: 'paid',
    order_status: 'delivered',
    payment_method_name: 'GCash',
    shipping_location: 'LBC_METRO_MANILA',
    contact_method: 'whatsapp',
    created_at: '2026-03-01T09:00:00.000Z',
    order_items: [
      item({ product_id: 'p1', product_name: 'BPC-157', quantity: 2, total: 800 }),
      item({ product_id: 'p2', product_name: 'TB-500', quantity: 1, total: 200 }),
    ],
  }),
  order({
    id: 'b',
    customer_email: 'BOB@example.com',
    total_price: 500,
    shipping_fee: 50,
    discount_applied: 0,
    payment_status: 'pending',
    order_status: 'new',
    payment_method_name: 'InstaPay',
    shipping_location: null,
    contact_method: 'instagram',
    created_at: '2026-03-05T14:30:00.000Z',
    order_items: [
      item({ product_id: 'p1', product_name: 'BPC-157', quantity: 1, total: 500 }),
    ],
  }),
  order({
    id: 'c',
    customer_email: 'alice@example.com',
    total_price: 2000,
    shipping_fee: 100,
    discount_applied: 100,
    payment_status: 'paid',
    order_status: 'shipped',
    payment_method_name: 'GCash',
    shipping_location: 'LBC_PROVINCIAL',
    contact_method: 'whatsapp',
    created_at: '2026-03-20T20:15:00.000Z',
    order_items: [
      item({ product_id: 'p2', product_name: 'TB-500', quantity: 3, total: 2000 }),
    ],
  }),
  // Cancelled order — must be excluded everywhere except status breakdown.
  order({
    id: 'd',
    customer_email: 'carol@example.com',
    total_price: 9999,
    shipping_fee: 999,
    discount_applied: 0,
    payment_status: 'paid',
    order_status: 'cancelled',
    payment_method_name: 'GCash',
    created_at: '2026-03-15T12:00:00.000Z',
    order_items: [
      item({ product_id: 'p1', product_name: 'BPC-157', quantity: 5, total: 9999 }),
    ],
  }),
];

const productMap = new Map<string, ProductLite>([
  ['p1', { id: 'p1', name: 'BPC-157', category: 'cat-heal', stock_quantity: 5, base_price: 400 }],
  ['p2', { id: 'p2', name: 'TB-500', category: 'cat-heal', stock_quantity: 40, base_price: 700 }],
  ['p3', { id: 'p3', name: 'Orphan', category: 'cat-missing', stock_quantity: 3, base_price: 50 }],
]);

const categoryMap = new Map<string, string>([['cat-heal', 'Healing']]);

// ---------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------

describe('isValidOrder / validOrders', () => {
  it('excludes cancelled orders', () => {
    expect(isValidOrder(order({ order_status: 'cancelled' }))).toBe(false);
    expect(isValidOrder(order({ order_status: 'new' }))).toBe(true);
  });

  it('validOrders filters out cancelled and tolerates non-arrays', () => {
    expect(validOrders(orders)).toHaveLength(3);
    expect(validOrders(undefined as unknown as RawOrder[])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

describe('getPresetRange', () => {
  const now = new Date('2026-06-08T00:00:00.000Z');

  it('7d spans 7 days', () => {
    const r = getPresetRange('7d', now);
    expect(r.end.getTime()).toBe(now.getTime());
    expect((r.end.getTime() - r.start.getTime()) / 86400000).toBeCloseTo(7, 5);
  });

  it('30d spans 30 days', () => {
    const r = getPresetRange('30d', now);
    expect((r.end.getTime() - r.start.getTime()) / 86400000).toBeCloseTo(30, 5);
  });

  it('90d spans 90 days', () => {
    const r = getPresetRange('90d', now);
    expect((r.end.getTime() - r.start.getTime()) / 86400000).toBeCloseTo(90, 5);
  });

  it('all uses firstOrderDate when provided', () => {
    const first = new Date('2025-01-01T00:00:00.000Z');
    const r = getPresetRange('all', now, first);
    expect(r.start.getTime()).toBe(first.getTime());
    expect(r.end.getTime()).toBe(now.getTime());
  });

  it('all falls back to a wide window without firstOrderDate', () => {
    const r = getPresetRange('all', now);
    expect(r.start.getTime()).toBeLessThan(now.getTime());
    expect(r.end.getTime()).toBe(now.getTime());
  });
});

describe('previousRange', () => {
  it('produces an immediately-preceding window of identical length', () => {
    const range: DateRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-31T00:00:00.000Z'),
    };
    const prev = previousRange(range);
    const len = range.end.getTime() - range.start.getTime();
    const prevLen = prev.end.getTime() - prev.start.getTime();
    expect(prevLen).toBe(len);
    expect(prev.end.getTime()).toBe(range.start.getTime());
  });
});

describe('autoGranularity', () => {
  const mk = (days: number): DateRange => ({
    start: new Date('2026-01-01T00:00:00.000Z'),
    end: new Date(new Date('2026-01-01T00:00:00.000Z').getTime() + days * 86400000),
  });

  it('<=31d -> day', () => {
    expect(autoGranularity(mk(7))).toBe('day');
    expect(autoGranularity(mk(31))).toBe('day');
  });

  it('<=180d -> week', () => {
    expect(autoGranularity(mk(32))).toBe('week');
    expect(autoGranularity(mk(180))).toBe('week');
  });

  it('>180d -> month', () => {
    expect(autoGranularity(mk(181))).toBe('month');
    expect(autoGranularity(mk(365))).toBe('month');
  });
});

describe('filterByRange', () => {
  it('keeps orders in [start, end) and excludes the exclusive end', () => {
    const range: DateRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-20T20:15:00.000Z'), // exactly order c -> excluded
    };
    const result = filterByRange(orders, range);
    const ids = result.map((o) => o.id).sort();
    expect(ids).toEqual(['a', 'b', 'd']); // c excluded (== end), filterByRange does NOT drop cancelled
  });

  it('tolerates bad created_at', () => {
    const result = filterByRange([order({ created_at: 'not-a-date' })], {
      start: new Date('2000-01-01'),
      end: new Date('2100-01-01'),
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

describe('computeKpis', () => {
  it('returns zeros (no NaN/Infinity) for empty input', () => {
    const k = computeKpis([]);
    expect(k.grossRevenue).toBe(0);
    expect(k.avgOrderValue).toBe(0);
    expect(k.orderCount).toBe(0);
    expect(k.uniqueCustomers).toBe(0);
    expect(Number.isNaN(k.avgOrderValue)).toBe(false);
    expect(Number.isFinite(k.avgOrderValue)).toBe(true);
  });

  it('excludes cancelled orders from revenue/units/customers', () => {
    const k = computeKpis(orders);
    // product revenue = 1000 + 500 + 2000 = 3500 (cancelled 9999 excluded)
    expect(k.productRevenue).toBe(3500);
    // shipping = 100 + 50 + 100 = 250
    expect(k.shippingRevenue).toBe(250);
    expect(k.grossRevenue).toBe(3750);
    expect(k.orderCount).toBe(3);
    // paid revenue = order a (1000) + order c (2000) = 3000
    expect(k.paidRevenue).toBe(3000);
    expect(k.discounts).toBe(150);
    expect(k.uniqueCustomers).toBe(2); // alice + bob
  });

  it('sums units from order_items quantity', () => {
    const k = computeKpis(orders);
    // a: 2+1=3, b: 1, c: 3 => 7 (cancelled excluded)
    expect(k.unitsSold).toBe(7);
  });

  it('computes avgOrderValue as gross/orderCount', () => {
    const k = computeKpis(orders);
    expect(k.avgOrderValue).toBeCloseTo(3750 / 3, 5);
  });

  it('coerces string decimals from Postgres', () => {
    const k = computeKpis([
      order({
        id: 'x',
        total_price: '2100.00' as unknown as number,
        shipping_fee: '150.50' as unknown as number,
      }),
    ]);
    expect(k.productRevenue).toBe(2100);
    expect(k.shippingRevenue).toBe(150.5);
  });
});

describe('withDelta', () => {
  it('returns null deltaPct when previous is 0 and value is non-zero', () => {
    expect(withDelta(100, 0).deltaPct).toBeNull();
  });

  it('returns 0 deltaPct when both are 0', () => {
    expect(withDelta(0, 0).deltaPct).toBe(0);
  });

  it('computes normal percentage change', () => {
    expect(withDelta(150, 100).deltaPct).toBeCloseTo(50, 5);
    expect(withDelta(50, 100).deltaPct).toBeCloseTo(-50, 5);
  });
});

describe('computeKpiSummary', () => {
  it('wraps each KPI with a delta vs previous period', () => {
    const summary = computeKpiSummary(orders, []);
    expect(summary.grossRevenue.value).toBe(3750);
    expect(summary.grossRevenue.previous).toBe(0);
    expect(summary.grossRevenue.deltaPct).toBeNull();
    expect(summary.orderCount.value).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

describe('buildTimeSeries', () => {
  // buildTimeSeries buckets by LOCAL-time day/week/month boundaries, so range
  // bounds are built with the local Date constructor to align to bucket edges
  // regardless of the machine timezone. Fixture orders are bucketed by their
  // local date as well: 'a' -> Mar 1, 'b' -> Mar 5, 'c' -> Mar 20/21 local
  // (always still in March), 'd' cancelled.

  it('emits a continuous zero-filled daily series matching bucket count', () => {
    const range: DateRange = {
      start: new Date(2026, 2, 1), // Mar 1 local 00:00
      end: new Date(2026, 2, 8), // Mar 8 local 00:00 -> 7 day buckets
    };
    const series = buildTimeSeries(orders, range, 'day');
    expect(series).toHaveLength(7);
    const totalOrders = series.reduce((s, p) => s + p.orders, 0);
    // orders a (Mar 1) and b (Mar 5) fall inside; c (~Mar 20) outside; d cancelled
    expect(totalOrders).toBe(2);
    // verify there are zero-filled gap buckets
    const zeroBuckets = series.filter((p) => p.orders === 0);
    expect(zeroBuckets.length).toBe(5);
  });

  it('returns empty array for an empty/degenerate range', () => {
    const same = new Date(2026, 2, 1);
    const range: DateRange = { start: same, end: same };
    expect(buildTimeSeries(orders, range, 'day')).toEqual([]);
  });

  it('buckets monthly across a wide range', () => {
    const range: DateRange = {
      start: new Date(2026, 0, 1), // Jan 1 local
      end: new Date(2026, 3, 1), // Apr 1 local (exclusive)
    };
    const series = buildTimeSeries(orders, range, 'month');
    expect(series).toHaveLength(3); // Jan, Feb, Mar
    const march = series[2];
    expect(march.orders).toBe(3); // a, b, c (d cancelled)
    expect(march.revenue).toBe(3750);
  });
});

// ---------------------------------------------------------------------------
// Products / variations / categories
// ---------------------------------------------------------------------------

describe('topProducts', () => {
  it('aggregates revenue/units, computes share and delta', () => {
    const stats = topProducts(orders, [], productMap, categoryMap);
    // p2 revenue = 200 (a) + 2000 (c) = 2200; p1 = 800 (a) + 500 (b) = 1300
    const totalRevenue = 2200 + 1300;
    expect(stats[0].product_id).toBe('p2');
    expect(stats[0].revenue).toBe(2200);
    expect(stats[0].category).toBe('Healing');
    expect(stats[0].share).toBeCloseTo(2200 / totalRevenue, 5);
    expect(stats[0].deltaPct).toBeNull(); // previous empty
    const p1 = stats.find((s) => s.product_id === 'p1')!;
    expect(p1.units).toBe(3); // 2 + 1
    expect(p1.orderCount).toBe(2);
  });

  it('respects the limit', () => {
    expect(topProducts(orders, [], productMap, categoryMap, 1)).toHaveLength(1);
  });

  it('computes percentage delta vs previous', () => {
    const prev = [
      order({
        id: 'prev',
        order_items: [item({ product_id: 'p2', product_name: 'TB-500', total: 1100 })],
      }),
    ];
    const stats = topProducts(orders, prev, productMap, categoryMap);
    const p2 = stats.find((s) => s.product_id === 'p2')!;
    expect(p2.prevRevenue).toBe(1100);
    expect(p2.deltaPct).toBeCloseTo(100, 5); // 2200 vs 1100 -> +100%
  });
});

describe('topVariations', () => {
  it('groups by product+variation and sorts by revenue', () => {
    const withVars = [
      order({
        id: 'v1',
        order_items: [
          item({ product_id: 'p1', product_name: 'BPC-157', variation_id: 'v-5mg', variation_name: '5mg', quantity: 2, total: 600 }),
          item({ product_id: 'p1', product_name: 'BPC-157', variation_id: 'v-10mg', variation_name: '10mg', quantity: 1, total: 900 }),
        ],
      }),
    ];
    const stats = topVariations(withVars);
    expect(stats[0].variation_name).toBe('10mg');
    expect(stats[0].revenue).toBe(900);
    expect(stats[1].variation_name).toBe('5mg');
    expect(stats[1].units).toBe(2);
  });
});

describe('categoryBreakdown', () => {
  it('maps product_id -> category and computes shares', () => {
    const stats = categoryBreakdown(orders, productMap, categoryMap);
    // both p1 and p2 are in cat-heal -> single Healing bucket
    expect(stats).toHaveLength(1);
    expect(stats[0].category).toBe('Healing');
    expect(stats[0].revenue).toBe(3500); // 800+200+500+2000 (cancelled excluded)
    expect(stats[0].share).toBeCloseTo(1, 5);
  });

  it('buckets unknown products as Uncategorized', () => {
    const unknownOrders = [
      order({
        id: 'u',
        order_items: [item({ product_id: 'does-not-exist', product_name: 'Mystery', total: 300 })],
      }),
    ];
    const stats = categoryBreakdown(unknownOrders, productMap, categoryMap);
    expect(stats[0].category).toBe('Uncategorized');
    expect(stats[0].revenue).toBe(300);
  });

  it('buckets products whose category id is missing from categoryMap as Uncategorized', () => {
    const orphanOrders = [
      order({
        id: 'orphan',
        order_items: [item({ product_id: 'p3', product_name: 'Orphan', total: 75 })],
      }),
    ];
    const stats = categoryBreakdown(orphanOrders, productMap, categoryMap);
    expect(stats[0].category).toBe('Uncategorized');
  });
});

// ---------------------------------------------------------------------------
// Segments / statuses
// ---------------------------------------------------------------------------

describe('breakdownBy', () => {
  it('groups by payment method and sorts by revenue', () => {
    const stats = breakdownBy(orders, 'payment_method_name');
    // GCash: a (1100) + c (2100) = 3200; InstaPay: b (550)
    expect(stats[0].label).toBe('GCash');
    expect(stats[0].revenue).toBe(3200);
    expect(stats[0].orders).toBe(2);
    expect(stats[1].label).toBe('InstaPay');
  });

  it('maps null/empty segment values to Unknown', () => {
    const stats = breakdownBy(orders, 'shipping_location');
    const unknown = stats.find((s) => s.label === 'Unknown');
    expect(unknown).toBeDefined();
    expect(unknown!.revenue).toBe(550); // order b has null shipping_location
  });

  it('share sums to 1 over the segments', () => {
    const stats = breakdownBy(orders, 'contact_method');
    const totalShare = stats.reduce((s, x) => s + x.share, 0);
    expect(totalShare).toBeCloseTo(1, 5);
  });
});

describe('statusBreakdown', () => {
  it('includes cancelled orders', () => {
    const stats = statusBreakdown(orders);
    const cancelled = stats.find((s) => s.status === 'cancelled');
    expect(cancelled).toBeDefined();
    expect(cancelled!.orders).toBe(1);
    const total = stats.reduce((s, x) => s + x.orders, 0);
    expect(total).toBe(4); // all four orders counted
  });
});

describe('paymentStatusBreakdown', () => {
  it('counts payment_status over valid orders only', () => {
    const stats = paymentStatusBreakdown(orders);
    const total = stats.reduce((s, x) => s + x.orders, 0);
    expect(total).toBe(3); // cancelled excluded
    const paid = stats.find((s) => s.status === 'paid');
    expect(paid!.orders).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

describe('customerStats', () => {
  it('groups by lowercased email and sorts by revenue', () => {
    const stats = customerStats(orders);
    // alice: a (1100) + c (2100) = 3200; bob: 550
    expect(stats[0].email).toBe('alice@example.com');
    expect(stats[0].orders).toBe(2);
    expect(stats[0].revenue).toBe(3200);
    expect(stats[0].firstOrder).toBe('2026-03-01T09:00:00.000Z');
    expect(stats[0].lastOrder).toBe('2026-03-20T20:15:00.000Z');
    expect(stats[1].email).toBe('bob@example.com'); // BOB normalised
  });
});

describe('customerMix', () => {
  it('classifies new vs returning by first-ever order', () => {
    const range: DateRange = {
      start: new Date('2026-03-10T00:00:00.000Z'),
      end: new Date('2026-04-01T00:00:00.000Z'),
    };
    // Within range: order c (alice). Alice's first-ever order (Mar 1) is BEFORE
    // the range start -> returning.
    const mix = customerMix(filterByRange(orders, range), orders, range);
    expect(mix.totalCustomers).toBe(1);
    expect(mix.returningCustomers).toBe(1);
    expect(mix.newCustomers).toBe(0);
  });

  it('classifies a customer whose first-ever order is inside the range as new', () => {
    const range: DateRange = {
      start: new Date('2026-03-04T00:00:00.000Z'),
      end: new Date('2026-03-10T00:00:00.000Z'),
    };
    // bob's only/first order (Mar 5) is inside the range -> new
    const mix = customerMix(filterByRange(orders, range), orders, range);
    expect(mix.newCustomers).toBe(1);
    expect(mix.returningCustomers).toBe(0);
  });

  it('computes repeat rate over lifetime customers', () => {
    const range: DateRange = {
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-12-31T00:00:00.000Z'),
    };
    const mix = customerMix(filterByRange(orders, range), orders, range);
    // lifetime customers: alice (2 orders), bob (1) -> repeaters = 1, total = 2
    expect(mix.repeatRate).toBeCloseTo(0.5, 5);
  });

  it('returns zeros for empty input (no NaN)', () => {
    const range: DateRange = {
      start: new Date('2026-01-01'),
      end: new Date('2026-02-01'),
    };
    const mix = customerMix([], [], range);
    expect(mix.repeatRate).toBe(0);
    expect(mix.totalCustomers).toBe(0);
    expect(Number.isNaN(mix.repeatRate)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------

describe('orderHeatmap', () => {
  it('returns exactly 168 zero-filled cells', () => {
    const cells = orderHeatmap([]);
    expect(cells).toHaveLength(7 * 24);
    expect(cells.every((c) => c.orders === 0 && c.revenue === 0)).toBe(true);
    // structure: each day 0..6, hour 0..23 present once
    expect(cells[0]).toMatchObject({ day: 0, hour: 0 });
    expect(cells[167]).toMatchObject({ day: 6, hour: 23 });
  });

  it('counts orders into the correct local day/hour cell', () => {
    const cells = orderHeatmap(orders);
    const total = cells.reduce((s, c) => s + c.orders, 0);
    expect(total).toBe(3); // cancelled excluded
  });
});

describe('ordersByWeekday / ordersByHour', () => {
  it('ordersByWeekday returns 7 entries Sun..Sat', () => {
    const out = ordersByWeekday(orders);
    expect(out).toHaveLength(7);
    expect(out[0].label).toBe('Sun');
    expect(out[6].label).toBe('Sat');
    expect(out.reduce((s, x) => s + x.orders, 0)).toBe(3);
  });

  it('ordersByHour returns 24 entries', () => {
    const out = ordersByHour(orders);
    expect(out).toHaveLength(24);
    expect(out[0].hour).toBe(0);
    expect(out[23].hour).toBe(23);
    expect(out.reduce((s, x) => s + x.orders, 0)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

describe('lowStockMovers', () => {
  it('returns products at/under threshold that have sold, sorted by unitsSold', () => {
    const movers = lowStockMovers([...productMap.values()], orders);
    // p1 stock 5 (<=10) units 3; p2 stock 40 (>10) excluded; p3 stock 3 but 0 sold excluded
    expect(movers).toHaveLength(1);
    expect(movers[0].product_id).toBe('p1');
    expect(movers[0].stock).toBe(5);
    expect(movers[0].unitsSold).toBe(3);
  });

  it('respects a custom threshold', () => {
    const movers = lowStockMovers([...productMap.values()], orders, 50);
    // now p2 (stock 40, sold 4) qualifies too
    const ids = movers.map((m) => m.product_id).sort();
    expect(ids).toEqual(['p1', 'p2']);
    expect(movers[0].unitsSold).toBe(4); // p2 sold more (1 + 3)
  });

  it('excludes products with zero sales', () => {
    const movers = lowStockMovers([...productMap.values()], []);
    expect(movers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('formatCompactPHP', () => {
  it('formats sub-thousand whole pesos', () => {
    expect(formatCompactPHP(950)).toBe('₱950');
  });

  it('formats thousands with k', () => {
    expect(formatCompactPHP(1200)).toBe('₱1.2k');
  });

  it('formats millions with M', () => {
    expect(formatCompactPHP(3_400_000)).toBe('₱3.4M');
  });

  it('drops trailing .0', () => {
    expect(formatCompactPHP(2000)).toBe('₱2k');
    expect(formatCompactPHP(5_000_000)).toBe('₱5M');
  });

  it('handles zero and negatives without NaN', () => {
    expect(formatCompactPHP(0)).toBe('₱0');
    expect(formatCompactPHP(-1500)).toBe('-₱1.5k');
    expect(formatCompactPHP(NaN)).toBe('₱0');
  });
});

describe('toCsv', () => {
  it('returns empty string for empty rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('emits header + rows with CRLF endings', () => {
    const csv = toCsv([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ]);
    expect(csv).toBe('a,b\r\n1,x\r\n2,y');
  });

  it('quotes values containing commas, quotes or newlines', () => {
    const csv = toCsv([
      { name: 'Doe, John', note: 'said "hi"', multi: 'a\nb' },
    ]);
    expect(csv).toBe('name,note,multi\r\n"Doe, John","said ""hi""","a\nb"');
  });

  it('renders null/undefined as empty', () => {
    const csv = toCsv([{ a: null, b: undefined as unknown as string }]);
    expect(csv).toBe('a,b\r\n,');
  });
});
