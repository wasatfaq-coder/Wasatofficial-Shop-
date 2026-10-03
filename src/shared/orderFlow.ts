/**
 * Цепочка статусов заказа зависит от способа доставки (задание владельца 02.10, «Доработки 4»):
 * - транспортная компания и Почта (`carrier`): Новый → Скомплектован → Передан в {ТК} (с трек-номером) → Ожидает
 *   подтверждения → Получен — «Получен» ставит покупатель кнопкой «Я получил заказ» или администратор вручную;
 * - курьер магазина (`courier`): Новый → Скомплектован → Передан курьеру → Выдан (по коду выдачи);
 * - самовывоз (`pickup`): Новый → Скомплектован → Готов к выдаче → Выдан (по коду выдачи).
 * Статусы в базе прежние (`accepted … delivered`), поэтому старые заказы не переделываются. Shared with Cloud
 * Functions — no browser APIs.
 */

export type DeliveryKind = 'carrier' | 'courier' | 'pickup';
export const DELIVERY_KINDS: DeliveryKind[] = ['carrier', 'courier', 'pickup'];

/** Перевозчик по названию способа — для способов, у которых тип не задан или задан «курьер» («СДЭК до двери») */
export const CARRIER_TITLE =
  /почт|сдэк|cdek|boxberry|боксберри|dpd|pec|пэк|деловые линии|dellin|яндекс доставк|5post|пятёрочк|пятерочк|транспортн/;

/**
 * Тип доставки способа из «Доставка и ПВЗ»: «Самовывоз» — выдача магазином, «Почта России» и «Транспортная компания»
 * (`custom`) — перевозчик, курьер и экспресс — курьер магазина, если в названии нет перевозчика.
 */
export function deliveryKindOfMethod(method: { id?: string; type?: string; title?: string }): DeliveryKind {
  if (method.type === 'pickup' || method.id === 'pickup') return 'pickup';
  if (method.type === 'post' || method.type === 'custom' || method.id === 'post') return 'carrier';
  const title = (method.title ?? '').toLowerCase();
  if (CARRIER_TITLE.test(title)) return 'carrier';
  if (!method.type && /самовывоз|пункт выдачи/.test(title)) return 'pickup';
  return 'courier';
}

/**
 * Срок доставки нового заказа — срок способа из «Доставка и ПВЗ» («1–2 дня», «3–5 дней»); у способа без срока и у заказа
 * в 1 клик срока нет. Раньше любой заказ получал «Через 1-2 дня», и Почта «3–5 дней» обещала покупателю 1–2 дня.
 */
export function estimatedDeliveryOf(method?: { duration?: string }): string | undefined {
  const duration = String(method?.duration ?? '').trim();
  return duration ? duration.slice(0, 80) : undefined;
}

export type OrderStatus = 'accepted' | 'assembling' | 'in_transit' | 'ready' | 'delivered';

/** Статусы цепочки по порядку: у курьера нет «ready», у самовывоза — «in_transit» */
export const FLOW_STATUSES: Record<DeliveryKind, OrderStatus[]> = {
  carrier: ['accepted', 'assembling', 'in_transit', 'ready', 'delivered'],
  courier: ['accepted', 'assembling', 'in_transit', 'delivered'],
  pickup: ['accepted', 'assembling', 'ready', 'delivered'],
};

/** Одна смена статуса: время до секунды (ISO) и кто сменил. `cancelled` — отмена магазином */
export interface OrderStatusLogEntry {
  status: OrderStatus | 'cancelled';
  at: string;
  by: 'customer' | 'admin' | 'system';
  /** uid администратора (покупателю не показывается) */
  byUid?: string;
  note?: string;
}

/** Первая запись нового заказа: его оформил покупатель (и в браузере, и через placeOrder) */
export function initialStatusLog(at: Date): OrderStatusLogEntry[] {
  return [{ status: 'accepted', at: at.toISOString(), by: 'customer' }];
}
