// Статусы по способу доставки, «Я получил заказ», код выдачи и история заказа («Доработки 4», задание владельца 02.10)
import { describe, expect, test } from 'bun:test';
import { deliveryKindOfMethod, FLOW_STATUSES, initialStatusLog } from '../../src/shared/orderFlow';
import { requiresFullName } from '../../src/shared/personName';
import {
  adminStatusLabel,
  canCustomerConfirmReceipt,
  canHandOver,
  customerStatusLabel,
  flowStatuses,
  generatePickupCode,
  isCarrierOrder,
  orderDeliveryKind,
  ORDER_STEP_LABELS,
  orderMainAction,
  orderTimeline,
  showsPickupCode,
  statusChangeBlocker,
  usesPickupCode,
} from '../../src/utils/orderFlow';
import type { Order } from '../../src/types';

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'WS-1',
  date: '2 окт., 12:00',
  createdAt: '2026-10-02T09:00:00.000Z',
  items: [],
  status: 'accepted',
  totalPrice: 1000,
  deliveryAddress: '',
  deliveryMethod: 'Курьером до двери',
  customerUid: 'alice',
  ...overrides,
});

describe('delivery kind', () => {
  test('by the method type and name in «Доставка и ПВЗ»', () => {
    expect(deliveryKindOfMethod({ type: 'pickup', title: 'ПВЗ' })).toBe('pickup');
    expect(deliveryKindOfMethod({ type: 'post', title: 'Посылка' })).toBe('carrier');
    expect(deliveryKindOfMethod({ type: 'custom', title: 'Доставка по России' })).toBe('carrier');
    // СДЭК configured as «курьер» is still a carrier: no entrance and intercom, the buyer confirms receipt
    expect(deliveryKindOfMethod({ type: 'courier', title: 'СДЭК до двери' })).toBe('carrier');
    expect(deliveryKindOfMethod({ type: 'courier', title: 'Курьером до двери' })).toBe('courier');
    expect(deliveryKindOfMethod({ type: 'express', title: 'Экспресс' })).toBe('courier');
    expect(requiresFullName({ type: 'custom', title: 'Деловые' })).toBe(true);
  });

  test('older orders without a kind — by the method name', () => {
    expect(orderDeliveryKind(order({ deliveryMethod: 'СДЭК до пункта выдачи' }))).toBe('carrier');
    expect(orderDeliveryKind(order({ deliveryMethod: 'Самовывоз из бутика' }))).toBe('pickup');
    expect(orderDeliveryKind(order({ deliveryMethod: 'Курьером до двери' }))).toBe('courier');
    expect(orderDeliveryKind(order({ deliveryKind: 'carrier', deliveryMethod: 'Курьером' }))).toBe('carrier');
  });
});

describe('chains and labels', () => {
  test('a carrier has no «В пути» but «Передан в {ТК}», pickup and courier end with «Выдан»', () => {
    const cdek = order({ deliveryKind: 'carrier', trackingCompany: 'cdek', status: 'in_transit' });
    expect(adminStatusLabel(cdek)).toBe('Передан в СДЭК');
    expect(customerStatusLabel(cdek)).toBe('Передан в доставку: СДЭК');
    expect(adminStatusLabel(cdek, 'ready')).toBe('Ожидает подтверждения');
    expect(adminStatusLabel(cdek, 'delivered')).toBe('Получен');
    const post = order({ deliveryKind: 'carrier', deliveryMethod: 'Почта России', status: 'in_transit' });
    expect(adminStatusLabel(post)).toBe('Передан в Почту России');
    expect(customerStatusLabel(post)).toBe('Передан в доставку: Почта России');
    expect(adminStatusLabel(order({ deliveryKind: 'pickup', status: 'ready' }))).toBe('Готов к выдаче');
    expect(adminStatusLabel(order({ deliveryKind: 'courier', status: 'delivered' }))).toBe('Выдан');
    expect(customerStatusLabel(order({ deliveryKind: 'courier', status: 'in_transit' }))).toBe('Курьер в пути');
  });

  test('the admin switches only within the chain; an old off-chain status stays selectable', () => {
    expect(flowStatuses(order({ deliveryKind: 'carrier' }))).toEqual(FLOW_STATUSES.carrier);
    expect(flowStatuses(order({ deliveryKind: 'pickup' }))).toEqual(['accepted', 'assembling', 'ready', 'delivered']);
    expect(flowStatuses(order({ deliveryKind: 'courier', status: 'ready' }))).toEqual([
      'accepted', 'assembling', 'in_transit', 'ready', 'delivered',
    ]);
  });

  test('a carrier order leaves only with its track number', () => {
    expect(statusChangeBlocker(order({ deliveryKind: 'carrier' }), 'in_transit')).toMatch(/трек-номер/);
    expect(statusChangeBlocker(order({ deliveryKind: 'carrier', trackingNumber: '1234' }), 'in_transit')).toBeNull();
    expect(statusChangeBlocker(order({ deliveryKind: 'courier' }), 'in_transit')).toBeNull();
  });

  // аудит 07.10, находка 1: поле трека было только у ТК из списка слов, а трек требовался у любой ТК
  test('a carrier with any name gets the track field the blocker asks for', () => {
    const baikal = order({ deliveryKind: 'carrier', deliveryMethod: 'Байкал Сервис' });
    expect(statusChangeBlocker(baikal, 'in_transit')).toMatch(/трек-номер/);
    expect(isCarrierOrder(baikal)).toBe(true);
    expect(isCarrierOrder(order({ deliveryMethod: 'СДЭК до пункта выдачи' }))).toBe(true);
    expect(isCarrierOrder(order({ deliveryKind: 'courier', deliveryMethod: 'Курьером до двери' }))).toBe(false);
    expect(isCarrierOrder(order({ deliveryKind: 'pickup', deliveryMethod: 'Самовывоз' }))).toBe(false);
  });
});

describe('the short card in «Заказы» (stage 5 of docs/admin-wholesale-plan.md)', () => {
  test('the main action is the next step; a carrier without a track — the track; courier and pickup — the handover', () => {
    const carrier = { deliveryKind: 'carrier' as const, deliveryMethod: 'Почта России' };
    expect(orderMainAction(order(carrier))).toEqual({ kind: 'status', status: 'assembling' });
    expect(orderMainAction(order({ ...carrier, status: 'assembling' }))).toEqual({ kind: 'track' });
    expect(orderMainAction(order({ ...carrier, status: 'assembling', trackingNumber: '800' }))).toEqual({ kind: 'status', status: 'in_transit' });
    // «Получен» of a carrier's order — the buyer's «Я получил заказ», not a button in the list
    expect(orderMainAction(order({ ...carrier, status: 'ready', trackingNumber: '800' }))).toBeNull();
    expect(orderMainAction(order({ status: 'assembling' }))).toEqual({ kind: 'status', status: 'in_transit' });
    expect(orderMainAction(order({ status: 'in_transit' }))).toEqual({ kind: 'handover' });
    expect(orderMainAction(order({ deliveryKind: 'pickup', status: 'assembling' }))).toEqual({ kind: 'status', status: 'ready' });
    expect(orderMainAction(order({ deliveryKind: 'pickup', status: 'ready' }))).toEqual({ kind: 'handover' });
    expect(orderMainAction(order({ status: 'delivered' }))).toBeNull();
    expect(orderMainAction(order({ isCancelled: true }))).toBeNull();
  });

  test('the step words of chips and bulk changes are the words of the order card', () => {
    expect(ORDER_STEP_LABELS.accepted.one).toBe(adminStatusLabel(order(), 'accepted'));
    expect(ORDER_STEP_LABELS.assembling.one).toBe(adminStatusLabel(order(), 'assembling'));
    expect(Object.values(ORDER_STEP_LABELS).map((l) => l.many)).toEqual(['Новые', 'Скомплектованы', 'Переданы', 'Ждут получения', 'Получены']);
  });
});

describe('receipt and handover', () => {
  test('«Я получил заказ» — own carrier order handed to the carrier or waiting', () => {
    const shipped = order({ deliveryKind: 'carrier', status: 'in_transit' });
    expect(canCustomerConfirmReceipt(shipped, 'alice')).toBe(true);
    expect(canCustomerConfirmReceipt(shipped, 'bob')).toBe(false);
    expect(canCustomerConfirmReceipt({ ...shipped, status: 'assembling' }, 'alice')).toBe(false);
    expect(canCustomerConfirmReceipt({ ...shipped, isCancelled: true }, 'alice')).toBe(false);
    expect(canCustomerConfirmReceipt(order({ deliveryKind: 'courier', status: 'in_transit' }), 'alice')).toBe(false);
  });

  test('handed over by code only when paid or paid on delivery', () => {
    expect(usesPickupCode(order({ deliveryKind: 'pickup' }))).toBe(true);
    expect(usesPickupCode(order({ deliveryKind: 'carrier' }))).toBe(false);
    expect(canHandOver(order({ paymentStatus: 'paid' }))).toBe(true);
    expect(canHandOver(order({ paymentStatus: 'paid_on_delivery' }))).toBe(true);
    expect(canHandOver(order({ paymentStatus: 'pending' }))).toBe(false);
    expect(showsPickupCode(order({ deliveryKind: 'pickup', status: 'ready', pickupCode: '842-190' }))).toBe(true);
    expect(showsPickupCode(order({ deliveryKind: 'pickup', status: 'delivered', pickupCode: '842-190' }))).toBe(false);
  });

  test('the code is six random digits «842-190»', () => {
    const codes = new Set(Array.from({ length: 50 }, generatePickupCode));
    for (const code of codes) expect(code).toMatch(/^\d{3}-\d{3}$/);
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('order history', () => {
  test('every change with its time to the second and who made it', () => {
    const o = order({
      deliveryKind: 'carrier',
      trackingCompany: 'cdek',
      status: 'delivered',
      statusLog: [
        ...initialStatusLog(new Date('2026-10-02T09:00:00.000Z')),
        { status: 'in_transit', at: '2026-10-02T10:00:05.000Z', by: 'admin', byUid: 'owner' },
        { status: 'delivered', at: '2026-10-03T08:15:30.000Z', by: 'customer' },
      ],
    });
    const admin = orderTimeline(o, 'admin');
    expect(admin.map((e) => e.title)).toEqual(['Заказ оформлен', 'Передан в СДЭК', 'Получен']);
    expect(admin[1].time).toBe('2 окт. 2026 г., 13:00:05');
    expect(admin.map((e) => e.who)).toEqual(['Покупатель', 'Администратор', 'Покупатель']);
    expect(orderTimeline(o, 'customer').map((e) => e.who)).toEqual(['Вы', 'Магазин', 'Вы']);
  });

  test('older orders: their creation and old steps, then the log; the buyer\'s cancellation from its fields', () => {
    const old = order({
      historySteps: [
        { title: 'Заказ принят', date: '1 окт.', completed: true },
        { title: 'Собирается', date: '1 окт., 15:00', completed: true },
      ],
      statusLog: [{ status: 'in_transit', at: '2026-10-02T10:00:00.000Z', by: 'admin' }],
      isCancelled: true,
      cancelledBy: 'customer',
      cancelReason: 'Заказ больше не нужен',
      cancelledAt: '2026-10-02T11:00:00.000Z',
    });
    expect(orderTimeline(old, 'admin').map((e) => e.title)).toEqual([
      'Заказ оформлен',
      'Собирается',
      'Передан курьеру',
      'Отменён клиентом',
    ]);
  });
});
