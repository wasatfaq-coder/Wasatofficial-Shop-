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

/**
 * false — the browser did not keep it (no room, a private window): the guest will not find the order in the profile,
 * so «Заказ оформлен» asks to write its number down, and the owner sees the number in «Ошибки на сайте»
 * (audit 07.10, finding 19)
 */
export function saveGuestOrder(order: Order): boolean {
  try {
    localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify([order, ...loadGuestOrders()]));
    return true;
  } catch (err) {
    console.error(`Guest order ${order.id} was not saved in the browser:`, err);
    return false;
  }
}

/** Guest orders that moved to the account: the account's subscription shows them now */
export function forgetGuestOrders(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const moved = new Set(ids);
    localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, JSON.stringify(loadGuestOrders().filter((o) => !moved.has(o.id))));
  } catch {}
}
