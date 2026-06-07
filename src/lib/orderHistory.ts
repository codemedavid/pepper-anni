// Lightweight local order history saved in the browser so customers can quickly
// re-track orders they placed on this device without remembering the PPA-XXXX number.

export interface SavedOrder {
    id: string;
    order_number: string;
    total: number;
    item_count: number;
    items_summary: string;
    status: string;
    created_at: string;
}

const STORAGE_KEY = 'ppa_order_history';
const MAX_ORDERS = 20;

export const getSavedOrders = (): SavedOrder[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('Failed to read saved orders:', err);
        return [];
    }
};

const writeOrders = (orders: SavedOrder[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.slice(0, MAX_ORDERS)));
    } catch (err) {
        console.error('Failed to write saved orders:', err);
    }
};

export const saveOrder = (order: SavedOrder) => {
    const existing = getSavedOrders().filter(o => o.order_number !== order.order_number);
    writeOrders([order, ...existing]);
};

export const updateOrderStatus = (orderNumber: string, status: string) => {
    const orders = getSavedOrders().map(o =>
        o.order_number === orderNumber ? { ...o, status } : o
    );
    writeOrders(orders);
};

export const removeSavedOrder = (orderNumber: string) => {
    writeOrders(getSavedOrders().filter(o => o.order_number !== orderNumber));
};

// A "pending" order is anything not yet delivered or cancelled.
export const isPending = (status: string) =>
    !['delivered', 'cancelled'].includes(status);
