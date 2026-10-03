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
