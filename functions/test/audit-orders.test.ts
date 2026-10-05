// Расхождения в расчёте заказа из обзора рисков 30.09.2026 (docs/audit-2026-09-30-plan.md) и проверки перед запуском
// 04.10.2026 (docs/audit-2026-10-04-plan.md).
// Каждый тест записан так, как должно быть. Пока ошибка не исправлена, он помечен `test.todo`: bun его не запускает
// (проверить, что находка ещё воспроизводится, — `bun test --todo test/audit-orders.test.ts`). Этап, который исправляет
// ошибку, меняет `test.todo` на `test`.
import { describe, expect, test } from 'bun:test';
import {
  calcOrderTotals,
  calcPromoDiscount,
  getAvailableDeliveryMethods,
  validatePromo,
  type PricingLine,
} from '../../src/shared/orderPricing';
import { DEFAULT_STOREFRONT_SETTINGS } from '../../src/utils/inventory';
import { orderPriceIssues } from '../../src/utils/orderPriceCheck';
import { lineReturnQuantity } from '../../src/shared/stockMovements';
import type { AppliedPromoInfo, DeliveryMethod, Order, Product, PromoCode } from '../../src/types';

const lines = (sum: number): PricingLine[] => [{ productId: 'p1', category: 'shirts', price: sum, quantity: 1 }];
const promo = (over: Partial<PromoCode>): PromoCode =>
  ({ id: 'x', code: 'SALE', title: '', description: '', active: true, discountType: 'percent', discountValue: 10, discountPercent: 10, usedCount: 0, ...over }) as PromoCode;

// 30.09.2026, 12:00 по Москве
const NOW = new Date('2026-09-30T12:00:00+03:00').getTime();

describe('Находка 8: срок промокода (этап 3, закрыта)', () => {
  test('срок по умолчанию из админки «31 августа 2026 г.» — 30.09 промокод уже истёк', () => {
    // AdminPromoConstructorTab.tsx:58 — значение по умолчанию, поле type="text"; проверка срока смотрит только даты с «-»
    expect(validatePromo(promo({ expiresAt: '31 августа 2026 г.' }), lines(3000), NOW)).not.toBeNull();
  });
  test('промокод «до 2026-09-30» в свой последний день ещё действует', () => {
    // new Date('2026-09-30') — полночь UTC, то есть 03:00 по Москве
    expect(validatePromo(promo({ expiresAt: '2026-09-30' }), lines(3000), NOW)).toBeNull();
  });
});

describe('Находка 9: применённый промокод не перепроверяется (этап 3, закрыта)', () => {
  test('«−1000 от 5000»: после удаления товаров до 1500 скидки нет', () => {
    const p = promo({ discountType: 'fixed', discountValue: 1000, discountPercent: 0, minOrderAmount: 5000 });
    expect(validatePromo(p, lines(6000), NOW)).toBeNull(); // применили при 6000
    const after = lines(1500);
    expect(validatePromo(p, after, NOW)).not.toBeNull(); // правило говорит «нельзя»…
    // …а корзина и оформление считают итог только через calcOrderTotals — сейчас итог 500 вместо 1500
    const { total, discount } = calcOrderTotals(after, p, 0);
    expect(discount).toBe(0);
    expect(total).toBe(1500);
  });
});

describe('Находка 13: цена доставки только из «Доставка и ПВЗ» (этап 3, закрыта)', () => {
  test('у курьера свой порог «бесплатно от 10 000» — при 6 000 доставка платная', () => {
    const m = [{ id: 'courier', title: 'Курьер', price: 400, freeThreshold: 10000, duration: '' } as DeliveryMethod];
    expect(getAvailableDeliveryMethods(m, DEFAULT_STOREFRONT_SETTINGS, 6000)[0].price).toBe(400);
  });
  test('самовывоз с ценой 300 стоит 300, а не скрытые 0 ₽', () => {
    const m = [{ id: 'pickup', title: 'ПВЗ', price: 300, freeThreshold: 0, duration: '' } as DeliveryMethod];
    expect(getAvailableDeliveryMethods(m, DEFAULT_STOREFRONT_SETTINGS, 1000)[0].price).toBe(300);
  });
  test('браузер и сервер называют одну цену курьера, даже если в settings/storefront нет courierDeliveryPrice', () => {
    const m = [{ id: 'courier', title: 'Курьер', price: 500, duration: '' } as DeliveryMethod];
    const client = getAvailableDeliveryMethods(m, { ...DEFAULT_STOREFRONT_SETTINGS }, 1000)[0].price;
    const server = getAvailableDeliveryMethods(m, {}, 1000)[0].price; // placeOrder читает сырой документ
    expect(server).toBe(client);
  });
});

describe('Старый промокод без discountType (этап 3, закрыта; в живой базе у всех кодов тип задан)', () => {
  test('админка показывает «500 ₽» — и расчёт даёт 500 ₽, а не 500 %', () => {
    // AdminPromoConstructorTab.tsx:130: без типа при значении > 100 админка считает код рублёвым
    const legacy = { code: 'OLD', discountValue: 500 } as PromoCode;
    expect(calcPromoDiscount(lines(4000), legacy)).toBe(500);
  });
});

// Находка 5 (склад у товара с отзывом не списывался) закрыта 30.09 в клиенте: после заказа пишутся только skus и inStock
// (saveStockToFirestore в src/utils/firebaseSync.ts), а не весь товар с подмешанными отзывами. Проверка — на эмуляторе;
// после перехода на placeOrder (этап 1) склад списывает сервер.

// ---------------------------------------------------------------------------------------------------------------------
// Проверка перед запуском 04.10 (docs/audit-2026-10-04-plan.md). Функций, которые закроют находки, пока нет: модуль
// читается без типов, чтобы проверка типов `functions` не падала. Этап, который закрывает находку, снимает `todo`
// и переводит тест на обычный импорт.
// ---------------------------------------------------------------------------------------------------------------------

const untyped = (path: string): Promise<Record<string, any>> => import(path);

const coat = { id: 'p1', title: 'Пальто', price: 10000, category: 'coats' } as Product;
const fakeOrder = (over: Partial<Order>): Order =>
  ({
    id: 'WS-FAKE', createdAt: '2026-10-04T10:00:00.000Z', status: 'accepted', paymentStatus: 'pending',
    items: [{ id: 'l1', product: coat, quantity: 1, selectedColor: 'Черный', selectedSize: 'M' }],
    totalPrice: 10000, deliveryMethod: 'Курьер', deliveryFee: 500, paymentMethod: 'Перевод на карту',
    deliveryAddress: 'Москва', customerName: 'Иван', customerPhone: '+70000000000', ...over,
  }) as Order;
const shop = {
  promos: [promo({ code: 'SALE', discountValue: 10, discountPercent: 10 })],
  deliveryMethods: [{ id: 'courier', title: 'Курьер', price: 500, duration: '', icon: '' } as DeliveryMethod],
  settings: { paymentMethods: [{ id: 'card', title: 'Перевод на карту' }, { id: 'cash', title: 'Наличные', onDelivery: true }] },
};
const priceIssues = orderPriceIssues as (...args: unknown[]) => string[];

describe('Находка 1 (04.10, P0): отмена заказа без записи списания не добавляет товар на склад (этап 1, закрыта)', () => {
  test('строка без записи {заказ}_{строка} возвращает 0, а не заказанное количество (поддельный заказ на 100 000 шт.)', () => {
    expect(lineReturnQuantity(undefined, { quantity: 100_000 })).toBe(0);
    expect(lineReturnQuantity({ changeQuantity: -1 }, { quantity: 100_000 })).toBe(1);
    expect(lineReturnQuantity({ changeQuantity: 0 }, { quantity: 1 })).toBe(0);
  });
});

describe('Находка 2 (04.10, P1): «Цены не совпадают» видит подделанную скидку, доставку и способ оплаты', () => {
  test('честный заказ — без замечаний', () => {
    expect(priceIssues(fakeOrder({ totalPrice: 10500 }), [coat], shop)).toEqual([]);
  });
  test.todo('заказ за 1 ₽: скидка 9 999 ₽ по несуществующему коду, без deliveryFee, «при получении» не из настроек', () => {
    const order = fakeOrder({
      totalPrice: 1, discountAmount: 9999, promoCode: 'NOPE', deliveryFee: undefined,
      paymentMethod: 'Наличные курьеру (при получении)', paymentStatus: 'paid_on_delivery',
    });
    expect(priceIssues(order, [coat], shop).length).toBeGreaterThanOrEqual(2);
  });
  test.todo('скидка больше, чем даёт промокод, и доставка дешевле способа', () => {
    const order = fakeOrder({ totalPrice: 5000, discountAmount: 5000, promoCode: 'SALE', deliveryFee: 0 });
    expect(priceIssues(order, [coat], shop).length).toBe(2);
  });
});

describe('Находка 3 (04.10, P1): последний товар двум покупателям — админка видит недостачу', () => {
  test.todo('строка, по которой списано меньше заказанного, — недостача', async () => {
    const { lineShortfall } = await untyped('../../src/shared/stockMovements');
    expect(lineShortfall({ quantity: 1 }, { changeQuantity: 0 })).toBe(1);
    expect(lineShortfall({ quantity: 3 }, { changeQuantity: -1 })).toBe(2);
    expect(lineShortfall({ quantity: 1 }, { changeQuantity: -1 })).toBe(0);
    // нет записи — это «Товар не списан со склада», а не недостача
    expect(lineShortfall({ quantity: 1 }, undefined)).toBe(0);
  });
});

describe('Находка 11 (04.10, P3): применённый промокод берёт значение из «Промокодов», а не из снимка', () => {
  test.todo('владелец снизил скидку с 50 % до 10 % — в корзине уже 10 %', async () => {
    const { currentAppliedPromo } = await untyped('../../src/shared/orderPricing');
    const applied: AppliedPromoInfo = { code: 'SALE', discountType: 'percent', discountValue: 50, discountPercent: 50 };
    const now = currentAppliedPromo(applied, [promo({ code: 'sale', discountValue: 10, discountPercent: 10 })]);
    expect(calcPromoDiscount(lines(1000), now)).toBe(100);
  });
});
