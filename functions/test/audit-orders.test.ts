// Расхождения в расчёте заказа из обзора рисков 30.09.2026 (docs/audit-2026-09-30-plan.md).
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
import type { DeliveryMethod, PromoCode } from '../../src/types';

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
