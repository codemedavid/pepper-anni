import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  RawOrder,
  RawOrderItem,
  ProductLite,
  CategoryLite,
} from '../lib/analytics';

export interface AnalyticsData {
  orders: RawOrder[];
  products: ProductLite[];
  categories: CategoryLite[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

// Postgres DECIMAL columns arrive as strings (e.g. "2100.00"); jsonb arrays
// arrive as JS values that may still hold stringy numbers. Coerce everything
// defensively so downstream analytics never operate on strings / NaN.
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const coerceItem = (raw: unknown): RawOrderItem => {
  const it = (raw ?? {}) as Record<string, unknown>;
  const item: RawOrderItem = {
    product_id: typeof it.product_id === 'string' ? it.product_id : '',
    product_name: typeof it.product_name === 'string' ? it.product_name : '',
    variation_id: typeof it.variation_id === 'string' ? it.variation_id : null,
    variation_name:
      typeof it.variation_name === 'string' ? it.variation_name : null,
    quantity: num(it.quantity),
    price: num(it.price),
    total: num(it.total),
  };
  if (it.purity_percentage !== undefined && it.purity_percentage !== null) {
    item.purity_percentage = num(it.purity_percentage);
  }
  return item;
};

const coerceOrder = (raw: unknown): RawOrder => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(o.order_items)
    ? o.order_items.map(coerceItem)
    : [];
  return {
    id: typeof o.id === 'string' ? o.id : '',
    order_number: typeof o.order_number === 'string' ? o.order_number : null,
    customer_name: typeof o.customer_name === 'string' ? o.customer_name : '',
    customer_email:
      typeof o.customer_email === 'string' ? o.customer_email : '',
    customer_phone:
      typeof o.customer_phone === 'string' ? o.customer_phone : '',
    total_price: num(o.total_price),
    shipping_fee: num(o.shipping_fee),
    discount_applied: num(o.discount_applied),
    payment_method_name:
      typeof o.payment_method_name === 'string' ? o.payment_method_name : null,
    payment_status:
      typeof o.payment_status === 'string' ? o.payment_status : '',
    order_status: typeof o.order_status === 'string' ? o.order_status : '',
    shipping_location:
      typeof o.shipping_location === 'string' ? o.shipping_location : null,
    contact_method:
      typeof o.contact_method === 'string' ? o.contact_method : null,
    order_items: items,
    created_at: typeof o.created_at === 'string' ? o.created_at : '',
  };
};

const coerceProduct = (raw: unknown): ProductLite => {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof p.id === 'string' ? p.id : '',
    name: typeof p.name === 'string' ? p.name : '',
    category: typeof p.category === 'string' ? p.category : '',
    stock_quantity: num(p.stock_quantity),
    base_price: num(p.base_price),
  };
};

const coerceCategory = (raw: unknown): CategoryLite => {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof c.id === 'string' ? c.id : '',
    name: typeof c.name === 'string' ? c.name : '',
  };
};

export function useAnalytics(): AnalyticsData {
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [ordersRes, productsRes, categoriesRes] = await Promise.all([
          supabase
            .from('orders')
            .select(
              'id,order_number,customer_name,customer_email,customer_phone,total_price,shipping_fee,discount_applied,payment_method_name,payment_status,order_status,shipping_location,contact_method,order_items,created_at'
            )
            .order('created_at', { ascending: true }),
          supabase
            .from('products')
            .select('id,name,category,stock_quantity,base_price'),
          supabase.from('categories').select('id,name'),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (productsRes.error) throw productsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;

        if (cancelled) return;

        setOrders((ordersRes.data ?? []).map(coerceOrder));
        setProducts((productsRes.data ?? []).map(coerceProduct));
        setCategories((categoriesRes.data ?? []).map(coerceCategory));
        setLastUpdated(new Date());
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching analytics data:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load analytics data'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return {
    orders,
    products,
    categories,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
