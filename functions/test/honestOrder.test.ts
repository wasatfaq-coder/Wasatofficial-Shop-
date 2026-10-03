// Аудит UX 03.10, этап 1: в заказе только правда — срок способа доставки, без «бутика», «примерки» и выдуманных сроков
import { describe, expect, test } from 'bun:test';
import { buildClientOrder } from '../../src/utils/clientOrder';
import { estimatedDeliveryOf } from '../../src/shared/orderFlow';
import { getDefaultHistorySteps, getEstimatedDeliveryForStatus, getSynchronizedDeliveryStages, pickupPlace } from '../../src/utils/deliveryStages';
import type { CartItem, Order, Product } from '../../src/types';

const product = { id: 'p1', title: 'Рубашка', price: 2990, category: 'shirts', images: [], colors: [], sizes: ['M'] } as unknown as Product;
const line: CartItem = { id: 'l1', product, quantity: 1, selectedColor: 'Белый', selectedSize: 'M' };
const order = (method?: { id: string; type?: 'pickup' | 'post' | 'courier'; title: string; duration?: string }, address = 'Москва, Тверская, 7') =>
  buildClientOrder({
    id: 'WS-1',
    placedAt: new Date('2026-10-03T10:00:00Z'),
    items: [line],
    totalPrice: 2990,
    deliveryFee: 0,
    discountAmount: 0,
    customerName: 'Иванов Иван',
    customerPhone: '+79990000000',
    deliveryAddress: address,
    deliveryMethod: method?.title ?? 'Уточнит менеджер',
    paymentMethod: 'Перевод',
    method,
  } as Parameters<typeof buildClientOrder>[0]);

describe('the delivery time of a new order', () => {
  test('the method\'s own; no method or no time — none (before: «Через 1-2 дня» for every order, Почта too)', () => {
    expect(estimatedDeliveryOf({ duration: ' 3–5 дней ' })).toBe('3–5 дней');
    expect(estimatedDeliveryOf({ duration: '' })).toBeUndefined();
    expect(estimatedDeliveryOf(undefined)).toBeUndefined();
    expect(order({ id: 'post', type: 'post', title: 'Почта России', duration: '3–5 дней' }).estimatedDelivery).toBe('3–5 дней');
    expect(order().estimatedDelivery).toBeUndefined();
  });

  test('a status change keeps the method\'s time and makes none up', () => {
    expect(getEstimatedDeliveryForStatus('assembling', '3–5 дней')).toBe('3–5 дней');
    expect(getEstimatedDeliveryForStatus('in_transit', '3–5 дней')).toBe('3–5 дней');
    expect(getEstimatedDeliveryForStatus('in_transit', 'Через 1-2 дня')).toBe('');
    expect(getEstimatedDeliveryForStatus('assembling', undefined)).toBe('');
    expect(getEstimatedDeliveryForStatus('ready', '3–5 дней')).toBe('Готов к выдаче');
    expect(getEstimatedDeliveryForStatus('accepted', 'Готов к выдаче')).toBe('');
    expect(getEstimatedDeliveryForStatus('delivered', '1–2 дня')).toBe('Вручен получателю');
    expect(getEstimatedDeliveryForStatus('accepted', '1–2 дня', true)).toBe('Заказ отменен');
  });
});

describe('a pickup order', () => {
  const pickup = order({ id: 'pickup', type: 'pickup', title: 'Пункт выдачи' }, 'Самовывоз: Пункт выдачи на Тверской, г. Москва, ул. Тверская, 7');

  test('the place without the «Самовывоз:» the checkout puts in front', () => {
    expect(pickupPlace(pickup.deliveryAddress)).toBe('Пункт выдачи на Тверской, г. Москва, ул. Тверская, 7');
    expect(pickupPlace(undefined)).toBe('');
  });

  test('no made-up boutique, fitting rooms or receipts in its steps and stages', () => {
    for (const status of ['accepted', 'assembling', 'in_transit', 'ready', 'delivered'] as const) {
      const at = { ...pickup, status } as Order;
      const text = JSON.stringify([getDefaultHistorySteps(at), getSynchronizedDeliveryStages(at)]);
      expect(text).not.toMatch(/бутик|примерк|комфортн/i);
    }
  });

  test('a courier order: no «курьерская служба магазина» or fitting either', () => {
    const courier = order({ id: 'courier', type: 'courier', title: 'Курьером до двери', duration: '1–2 дня' });
    for (const status of ['accepted', 'in_transit', 'delivered'] as const) {
      const text = JSON.stringify([getDefaultHistorySteps({ ...courier, status } as Order), getSynchronizedDeliveryStages({ ...courier, status } as Order)]);
      expect(text).not.toMatch(/курьерская служба магазина|примерк/i);
    }
  });
});

describe('«Технические работы» (UX audit 03.10, finding 21)', () => {
  test('only an explicit «off» stops orders: a store without the setting takes them', async () => {
    const { storeAcceptsOrders } = await import('../../src/shared/orderApi');
    expect(storeAcceptsOrders({ isStoreOnline: false })).toBe(false);
    expect(storeAcceptsOrders({ isStoreOnline: true })).toBe(true);
    expect(storeAcceptsOrders({})).toBe(true);
    expect(storeAcceptsOrders(undefined)).toBe(true);
  });
});

describe('«Заказ в 1 клик» (UX audit 03.10, finding 22)', () => {
  test('saved as «Заказ в 1 клик», recognised under the old «Экспресс курьер (1 клик)» too', async () => {
    const { isQuickOrderDelivery, QUICK_ORDER_DELIVERY_TITLE } = await import('../../src/shared/orderPricing');
    expect(QUICK_ORDER_DELIVERY_TITLE).toBe('Заказ в 1 клик');
    expect(QUICK_ORDER_DELIVERY_TITLE).not.toMatch(/курьер|экспресс/i);
    expect(isQuickOrderDelivery('Экспресс курьер (1 клик)')).toBe(true);
    expect(isQuickOrderDelivery(QUICK_ORDER_DELIVERY_TITLE)).toBe(true);
    expect(isQuickOrderDelivery('Экспресс-доставка')).toBe(false);
    expect(isQuickOrderDelivery(undefined)).toBe(false);
  });

  test('an old 1-click order promises no express courier: in the stages or the status notice', async () => {
    const { getOrderStatusNotification } = await import('../../src/utils/pushNotifications');
    const old = { ...order(undefined, 'Уточнит менеджер'), deliveryMethod: 'Экспресс курьер (1 клик)' } as Order;
    // the notice reads the store name from the browser's storage
    const g = globalThis as { localStorage?: unknown };
    const hadStorage = 'localStorage' in g;
    if (!hadStorage) g.localStorage = { getItem: () => null };
    try {
      for (const status of ['accepted', 'in_transit', 'delivered'] as const) {
        const text = JSON.stringify([
          getSynchronizedDeliveryStages({ ...old, status }),
          getOrderStatusNotification({ ...old, status }, 'accepted'),
        ]);
        expect(text).not.toMatch(/экспресс/i);
      }
    } finally {
      if (!hadStorage) delete g.localStorage;
    }
    // a real express method of the shop keeps its words
    const express = { ...old, deliveryMethod: 'Экспресс-доставка за 2 часа', status: 'in_transit' } as Order;
    expect(JSON.stringify(getSynchronizedDeliveryStages(express))).toMatch(/экспресс/i);
  });
});
