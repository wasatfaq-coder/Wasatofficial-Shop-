// Этап 9 обзора рисков: покупателю — только условия, заданные в «Витрине»; владельцу — шаги до первой продажи
import { describe, expect, test } from 'bun:test';
import { getAvailableDeliveryMethods } from '../../src/shared/orderPricing';
import { launchSteps } from '../../src/utils/launchChecklist';
import type { DeliveryMethod, StorefrontSettings } from '../../src/types';

describe('находка 30: без порога в «Витрине» доставка от суммы не бесплатная', () => {
  const courier = [{ id: 'c', title: 'Курьер', price: 350, duration: '' } as DeliveryMethod];
  test('без порога — цена способа при любой сумме', () => {
    expect(getAvailableDeliveryMethods(courier, {}, 9000)[0].price).toBe(350);
  });
  test('порог «Витрины» работает, когда он задан', () => {
    expect(getAvailableDeliveryMethods(courier, { freeDeliveryThreshold: 5000 }, 9000)[0].price).toBe(0);
  });
});

describe('находка 33: «Запуск магазина»', () => {
  test('пустой магазин — все 5 шагов не сделаны, каждый ведёт в свой раздел', () => {
    const steps = launchSteps([], [], {});
    expect(steps.map((s) => [s.id, s.done, s.tab])).toEqual([
      ['categories', false, 'categories'],
      ['products', false, 'products'],
      ['delivery', false, 'delivery'],
      ['payment', false, 'payment'],
      ['legal', false, 'storefront'],
    ]);
  });
  test('заполненное отмечается сделанным; выключенный способ доставки не считается', () => {
    const settings = {
      categories: [{ id: 'shirts', name: 'Рубашки' }],
      paymentMethods: [{ id: 'cash', title: 'Наличными', isActive: true }],
    } as unknown as StorefrontSettings;
    const steps = launchSteps([{ id: 'p1' }], [{ isActive: false }], settings);
    expect(Object.fromEntries(steps.map((s) => [s.id, s.done]))).toEqual({
      categories: true, products: true, delivery: false, payment: true, legal: false,
    });
  });
  test('реквизиты необязательны (решение владельца 01.10): без них карточка не держится', () => {
    const steps = launchSteps([], [], {});
    expect(steps.filter((s) => s.optional).map((s) => s.id)).toEqual(['legal']);
  });
});
