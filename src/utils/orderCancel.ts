/**
 * Отмена заказа (задание владельца 02.10, «Доработки 3»): покупатель отменяет свой заказ в профиле до начала сборки,
 * администратор — в «Заказах», обязательно с причиной. Товар возвращается на склад, отменённый заказ не входит
 * в выручку, а через 3 дня уходит в «Архив» (не удаляется: он нужен для журнала склада и споров).
 */
import type { Order } from '../types';
import { orderTimestamp } from '../shared/orderDate';

export const OTHER_CANCEL_REASON = 'Другая причина';

/** Reasons the buyer picks from; «Другая причина» needs a comment */
export const CUSTOMER_CANCEL_REASONS = [
  'Заказ больше не нужен',
  'Нашёлся вариант дешевле',
  'Слишком долгая доставка',
  'Ошибка в заказе: размер, цвет или адрес',
  'Неудобный способ оплаты или доставки',
  OTHER_CANCEL_REASON,
] as const;

export const ADMIN_CANCEL_REASONS = [
  'По просьбе покупателя',
  'Товара нет в наличии',
  'Не удалось связаться с покупателем',
  'Заказ не оплачен',
  'Подозрение на мошенничество',
  OTHER_CANCEL_REASON,
] as const;

/** The reason of the automatic cancellation of an unpaid order (one of ADMIN_CANCEL_REASONS) */
export const UNPAID_CANCEL_REASON = 'Заказ не оплачен';

/**
 * Orders the store cancels itself after `days` without payment («Витрина» → `unpaidOrderCancelDays`, stage 5 without
 * Blaze): still in «Принят» and «Ожидает оплаты». A receipt on review, payment on delivery, an order already packed or
 * an order with an unknown date (old «Сегодня, 14:30») are not touched.
 */
export function overdueUnpaidOrders(orders: Order[], days: number | undefined, now = Date.now()): Order[] {
  if (!days || days <= 0) return [];
  const limit = days * 24 * 60 * 60 * 1000;
  return orders.filter((o) => {
    if (o.isCancelled || o.status !== 'accepted' || (o.paymentStatus ?? 'pending') !== 'pending') return false;
    const at = orderTimestamp(o);
    return at !== null && now - at > limit;
  });
}

/** Lengths the rules allow (`firestore.rules`, `isCustomerOrderCancel`) */
export const CANCEL_REASON_MAX = 100;
export const CANCEL_COMMENT_MAX = 500;

/**
 * The buyer cancels a signed-in order of their own until the store starts packing it («Принят»), once: an order
 * the store cancelled and brought back is cancelled through the chat (its goods were already returned once).
 */
export function canCustomerCancel(order: Order, uid: string | undefined): boolean {
  return (
    Boolean(uid) &&
    order.customerUid === uid &&
    !order.isCancelled &&
    order.status === 'accepted' &&
    !order.cancelledAt &&
    // after «Правка состава» the goods go back by the order's whole journal, which only the admin reads (audit 07.10, finding 2)
    !order.isAdjusted
  );
}

/** Why the buyer cannot cancel an order that is not finished yet; '' when the button is there or nothing is due */
export function customerCancelHint(order: Order, uid: string | undefined): string {
  if (order.isCancelled || order.status === 'delivered' || canCustomerCancel(order, uid)) return '';
  if (!uid || order.customerUid !== uid) return 'Чтобы отменить заказ, напишите в чат магазина: заказ оформлен без входа в аккаунт.';
  if (order.status === 'accepted' && order.isAdjusted) {
    return 'Магазин изменил состав заказа — чтобы отменить его, напишите в чат магазина.';
  }
  if (order.status === 'accepted') return 'Этот заказ уже отменяли — чтобы отменить его снова, напишите в чат магазина.';
  return 'Заказ уже собирают или везут — отменить его можно только через чат магазина.';
}

/**
 * Who cancelled, in the admin's words («Отменён клиентом» / «Отменён магазином») or the buyer's («Вы отменили заказ»);
 * older orders do not say who.
 */
export function cancelledByLabel(order: Pick<Order, 'cancelledBy'>, audience: 'admin' | 'customer' = 'admin'): string {
  if (audience === 'customer') {
    if (order.cancelledBy === 'customer') return 'Вы отменили заказ';
    if (order.cancelledBy === 'admin') return 'Заказ отменил магазин';
    return 'Заказ отменён';
  }
  if (order.cancelledBy === 'customer') return 'Отменён клиентом';
  if (order.cancelledBy === 'admin') return 'Отменён магазином';
  return 'Отменён';
}

/** Reason with the comment: «Другая причина — уехал в отпуск» */
export function cancelReasonText(order: Pick<Order, 'cancelReason' | 'cancelComment'>): string {
  const reason = (order.cancelReason ?? '').trim();
  const comment = (order.cancelComment ?? '').trim();
  if (reason && comment) return `${reason} — ${comment}`;
  return reason || comment;
}

/** When the order was cancelled, ms; null for older orders that kept only a display text */
export function cancelTimestamp(order: Pick<Order, 'cancelledAt'>): number | null {
  if (!order.cancelledAt) return null;
  const t = new Date(order.cancelledAt).getTime();
  return Number.isNaN(t) ? null : t;
}

/** «2 окт. 2026, 21:40:05» — the moment of the cancellation with seconds; the stored text for older orders */
export function formatCancelledAt(order: Pick<Order, 'cancelledAt'>): string {
  const t = cancelTimestamp(order);
  if (t === null) return order.cancelledAt ?? '';
  return new Date(t).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

/** A cancelled order leaves the working list 3 days after the cancellation */
export const ARCHIVE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * «Архив» in «Заказы»: what the admin moved there, and cancelled orders 3 days after the cancellation (older orders
 * without its time — 3 days after the order). «Из архива» (archived: false) keeps an order in the list.
 */
export function isArchivedOrder(order: Order, now: number = Date.now()): boolean {
  if (order.archived === true) return true;
  if (order.archived === false || !order.isCancelled) return false;
  const at = cancelTimestamp(order) ?? orderTimestamp(order, new Date(now));
  return at !== null && now - at >= ARCHIVE_AFTER_MS;
}

/** Share of the customer's orders cancelled (by anyone), whole percent; null without orders */
export function cancelledShare(orders: Pick<Order, 'isCancelled'>[]): number | null {
  if (orders.length === 0) return null;
  return Math.round((orders.filter((o) => o.isCancelled).length / orders.length) * 100);
}

/**
 * Cancelled orders whose promo code use has not gone back to the code yet: the admin's session returns it
 * (`releaseOrderPromoUse`), so a one-time code from a newsletter or the chat is usable again and cancelled orders do
 * not hold places of a shared limit (audit 07.10, finding 6)
 */
export function ordersWithPromoToRelease(orders: Order[]): Order[] {
  return orders.filter((o) => o.isCancelled && Boolean(o.promoCode?.trim()) && !o.promoReleased);
}
