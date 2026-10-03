/**
 * Статусы заказа по способу доставки на экранах (задание владельца 02.10, «Доработки 4»): подписи для админки
 * и покупателя, кто и когда может перевести заказ дальше, история заказа и код выдачи. Цепочки —
 * `src/shared/orderFlow.ts`.
 */
import type { Order } from '../types';
import {
  deliveryKindOfMethod,
  FLOW_STATUSES,
  type DeliveryKind,
  type OrderStatus,
  type OrderStatusLogEntry,
} from '../shared/orderFlow';
import { isPickupDelivery, isTransportCompanyDelivery } from './deliveryStages';
import { cancelReasonText } from './orderCancel';

export type { DeliveryKind, OrderStatus, OrderStatusLogEntry };

/** Тип доставки заказа: записанный при оформлении, у старых заказов — по названию способа */
export function orderDeliveryKind(order: Pick<Order, 'deliveryKind' | 'deliveryMethod' | 'trackingCompany'>): DeliveryKind {
  if (order.deliveryKind) return order.deliveryKind;
  if (isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany)) return 'carrier';
  if (isPickupDelivery(order.deliveryMethod)) return 'pickup';
  return deliveryKindOfMethod({ title: order.deliveryMethod });
}

const CARRIER_NAMES: Record<NonNullable<Order['trackingCompany']>, string> = {
  cdek: 'СДЭК',
  pochta: 'Почту России',
  boxberry: 'Boxberry',
  yandex: 'Яндекс Доставку',
  dhl: 'DHL',
  other: 'службу доставки',
};

/** «СДЭК», «Почту России» (винительный: «Передан в …»); без выбранной ТК — название способа доставки */
export function carrierName(order: Pick<Order, 'trackingCompany' | 'deliveryMethod'>): string {
  if (order.trackingCompany && order.trackingCompany !== 'other') return CARRIER_NAMES[order.trackingCompany];
  const title = (order.deliveryMethod || '').trim();
  if (/почт/i.test(title)) return 'Почту России';
  return title || 'транспортную компанию';
}

/** Статусы, между которыми администратор переключает этот заказ (текущий — даже если он не из цепочки) */
export function flowStatuses(order: Order): OrderStatus[] {
  const chain = FLOW_STATUSES[orderDeliveryKind(order)];
  return chain.includes(order.status) ? chain : [...chain.slice(0, -1), order.status, chain[chain.length - 1]];
}

/** Подпись статуса в админке: «Передан в СДЭК», «Готов к выдаче», «Выдан» */
export function adminStatusLabel(order: Order, status: OrderStatus = order.status): string {
  const kind = orderDeliveryKind(order);
  switch (status) {
    case 'accepted':
      return 'Новый';
    case 'assembling':
      return 'Скомплектован';
    case 'in_transit':
      if (kind === 'carrier') return `Передан в ${carrierName(order)}`;
      return kind === 'pickup' ? 'Едет в пункт выдачи' : 'Передан курьеру';
    case 'ready':
      if (kind === 'carrier') return 'Ожидает подтверждения';
      return kind === 'pickup' ? 'Готов к выдаче' : 'Передан курьеру';
    case 'delivered':
      return kind === 'carrier' ? 'Получен' : 'Выдан';
  }
}

/** Подпись статуса для покупателя: «Передан в доставку: СДЭК», «Курьер в пути», «Заказ ожидает в пункте выдачи» */
export function customerStatusLabel(order: Order, status: OrderStatus = order.status): string {
  const kind = orderDeliveryKind(order);
  switch (status) {
    case 'accepted':
      return 'Заказ принят в обработку';
    case 'assembling':
      if (kind === 'carrier') return 'Заказ собирается';
      return kind === 'pickup' ? 'Собран, готов к выдаче' : 'Собран, готов к отправке';
    case 'in_transit':
      if (kind === 'carrier') return `Передан в доставку: ${carrierName(order).replace(/^Почту/, 'Почта')}`;
      return kind === 'pickup' ? 'Едет в пункт выдачи' : 'Курьер в пути';
    case 'ready':
      if (kind === 'carrier') return 'Доставлен, готов к получению';
      return kind === 'pickup' ? 'Заказ ожидает в пункте выдачи' : 'Курьер в пути';
    case 'delivered':
      return 'Заказ получен';
  }
}

/** Короткие подписи шагов на шкале у покупателя: 4–5 шагов на 390 px, одно-два слова */
export function customerStepLabel(order: Order, status: OrderStatus): string {
  const kind = orderDeliveryKind(order);
  switch (status) {
    case 'accepted':
      return 'Принят';
    case 'assembling':
      return kind === 'carrier' ? 'Сборка' : 'Собран';
    case 'in_transit':
      return kind === 'carrier' ? 'В ТК' : kind === 'pickup' ? 'В пути' : 'У курьера';
    case 'ready':
      return kind === 'carrier' ? 'Прибыл' : kind === 'pickup' ? 'В пункте' : 'У курьера';
    case 'delivered':
      return 'Получен';
  }
}

/** Заказ у перевозчика ждёт «Я получил заказ» */
export function isAwaitingReceipt(order: Order): boolean {
  return !order.isCancelled && orderDeliveryKind(order) === 'carrier' && (order.status === 'in_transit' || order.status === 'ready');
}

/**
 * «Я получил заказ» — у своего заказа (вход через Google), отправленного транспортной компанией или Почтой
 * (правило `isCustomerReceiptConfirm`). Гость кнопки не видит: заказ закрывает администратор.
 */
export function canCustomerConfirmReceipt(order: Order, uid: string | undefined): boolean {
  return Boolean(uid) && order.customerUid === uid && isAwaitingReceipt(order);
}

/**
 * Почему администратор не может перевести заказ в этот статус: заказ в ТК — только с трек-номером
 * (задание владельца: «поле трек-номера обязательно при переводе в статус отправки ТК»).
 */
export function statusChangeBlocker(order: Order, status: OrderStatus): string | null {
  if (status === 'in_transit' && orderDeliveryKind(order) === 'carrier' && !order.trackingNumber?.trim()) {
    return `Сначала укажите трек-номер: без него заказ № ${order.id} нельзя передать в ${carrierName(order)}`;
  }
  return null;
}

/** Курьер и самовывоз выдаются по коду («Забрать заказ»), заказ у перевозчика — по подтверждению покупателя */
export function usesPickupCode(order: Order): boolean {
  return orderDeliveryKind(order) !== 'carrier';
}

/** Выдать можно оплаченный заказ или «Оплата при получении» (деньги принимают при выдаче) */
export function canHandOver(order: Order): boolean {
  return order.paymentStatus === 'paid' || order.paymentStatus === 'paid_on_delivery';
}

/** Код выдачи «842-190»: 6 случайных цифр из генератора браузера (не Math.random) */
export function generatePickupCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const digits = String(value).padStart(6, '0');
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/** Код показывается покупателю, когда заказ передан курьеру или ждёт в пункте выдачи */
export function showsPickupCode(order: Order): boolean {
  return (
    Boolean(order.pickupCode) &&
    !order.isCancelled &&
    usesPickupCode(order) &&
    (order.status === 'in_transit' || order.status === 'ready')
  );
}

/** Запись истории о смене статуса сейчас */
export function statusLogEntry(
  status: OrderStatusLogEntry['status'],
  by: OrderStatusLogEntry['by'],
  options: { byUid?: string; note?: string; at?: Date } = {}
): OrderStatusLogEntry {
  return {
    status,
    at: (options.at ?? new Date()).toISOString(),
    by,
    ...(options.byUid ? { byUid: options.byUid } : {}),
    ...(options.note ? { note: options.note } : {}),
  };
}

/** «2 окт. 2026 г., 22:48:55» по Москве */
export function formatEventTime(ms: number): string {
  return new Date(ms).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

export interface TimelineEvent {
  key: string;
  /** ms, когда известно точное время */
  at: number | null;
  /** время для показа: точное или текст старого заказа */
  time: string;
  title: string;
  who: string;
  note?: string;
  tone: 'default' | 'success' | 'danger';
}

const parseTime = (value?: string): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * История заказа одной лентой — вместо «Истории статусов», «Этапов доставки» и «Хронологии изменений»: оформление,
 * каждая смена статуса (время до секунды и автор), отмена, корректировки состава. Старые заказы без журнала —
 * по их прежним шагам, с тем временем, что у них записано.
 */
export function orderTimeline(order: Order, audience: 'admin' | 'customer'): TimelineEvent[] {
  const who = (by: OrderStatusLogEntry['by']) =>
    by === 'customer' ? (audience === 'customer' ? 'Вы' : 'Покупатель') : by === 'admin' ? (audience === 'customer' ? 'Магазин' : 'Администратор') : 'Сайт';
  const label = (status: OrderStatus) => (audience === 'customer' ? customerStatusLabel(order, status) : adminStatusLabel(order, status));
  const events: TimelineEvent[] = [];
  const log = Array.isArray(order.statusLog) ? order.statusLog : [];

  // An order placed before the history was kept: its creation and old steps first, with the time they have
  if (log[0]?.status !== 'accepted') {
    const created = parseTime(order.createdAt);
    events.push({
      key: 'created',
      at: created,
      time: created !== null ? formatEventTime(created) : order.date,
      title: 'Заказ оформлен',
      who: who('customer'),
      tone: 'default',
    });
    (order.historySteps ?? [])
      .filter((step) => step.completed && !/принят|отмен|коррект/i.test(step.title))
      .forEach((step, i) => {
        events.push({ key: `step-${i}`, at: null, time: step.date, title: step.title, who: '', note: step.description, tone: 'default' });
      });
  }

  log.forEach((entry, i) => {
    const at = parseTime(entry.at);
    const isCancel = entry.status === 'cancelled';
    const title = isCancel
      ? audience === 'customer' ? 'Заказ отменил магазин' : 'Отменён магазином'
      : entry.status === 'accepted' && i === 0
        ? 'Заказ оформлен'
        : label(entry.status as OrderStatus);
    events.push({
      key: `log-${i}`,
      at,
      time: at !== null ? formatEventTime(at) : entry.at,
      title,
      who: who(entry.by),
      note: entry.note,
      tone: isCancel ? 'danger' : entry.status === 'delivered' ? 'success' : 'default',
    });
  });

  // A return request from the support chat is still a history step: after the log entries (its text date has no exact time)
  if (log[0]?.status === 'accepted') {
    (order.historySteps ?? [])
      .filter((step) => /возврат или обмен/i.test(step.title))
      .forEach((step, i) => {
        const at = parseTime(step.date);
        events.push({ key: `return-${i}`, at, time: step.date, title: step.title, who: who('admin'), note: step.description, tone: 'default' });
      });
  }

  // The buyer's cancellation changes only the cancel fields (the rules), older ones were not logged: from the fields
  if (order.isCancelled && !log.some((e) => e.status === 'cancelled')) {
    const at = parseTime(order.cancelledAt);
    const byCustomer = order.cancelledBy === 'customer';
    events.push({
      key: 'cancel',
      at,
      time: at !== null ? formatEventTime(at) : order.cancelledAt || '',
      title: byCustomer
        ? audience === 'customer' ? 'Вы отменили заказ' : 'Отменён клиентом'
        : order.cancelledBy === 'admin'
          ? audience === 'customer' ? 'Заказ отменил магазин' : 'Отменён магазином'
          : 'Заказ отменён',
      who: order.cancelledBy ? who(byCustomer ? 'customer' : 'admin') : '',
      note: cancelReasonText(order) || undefined,
      tone: 'danger',
    });
  }

  if (audience === 'admin') {
    (order.adjustmentLogs ?? []).forEach((adj, i) => {
      const at = parseTime(adj.date);
      events.push({
        key: `adj-${i}`,
        at,
        time: at !== null ? formatEventTime(at) : adj.date,
        title: `Изменён состав: ${adj.previousTotal.toLocaleString('ru-RU')} → ${adj.newTotal.toLocaleString('ru-RU')} ₽`,
        who: 'Администратор',
        note: [adj.reason, adj.changedItemsSummary, adj.note].filter(Boolean).join(' · ') || undefined,
        tone: 'default',
      });
    });
  }

  // Exact times in order; an event without one stays after the one before it
  const timed = events.map((e, i) => ({ e, i }));
  let last = -Infinity;
  const keys = timed.map(({ e }) => {
    if (e.at !== null) last = e.at;
    return last;
  });
  return timed
    .map((t, idx) => ({ ...t, sortKey: keys[idx] }))
    .sort((a, b) => a.sortKey - b.sortKey || a.i - b.i)
    .map((t) => t.e);
}
