import type { Order } from '../types';

// Internal key: guest orders already live under it in customers' browsers (CLAUDE.md, «manstyle_*»)
const GUEST_ORDERS_STORAGE_KEY = 'manstyle_guest_orders';

// Guests cannot read orders back from Firestore, so their history lives in this browser
export function loadGuestOrders(): Order[] {
  try {
    const raw = localStorage.getItem(GUEST_ORDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestOrder(order: Order) {
  try {
    localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify([order, ...loadGuestOrders()]));
  } catch {}
}

/** Guest orders that moved to the account: the account's subscription shows them now */
export function forgetGuestOrders(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const moved = new Set(ids);
    localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify(loadGuestOrders().filter((o) => !moved.has(o.id))));
  } catch {}
}
