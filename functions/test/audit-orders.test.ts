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
import { mergeProductReviews, withoutCollectionReviews } from '../../src/utils/reviews';
import type { DeliveryMethod, Product, PromoCode, StoredReview } from '../../src/types';

const lines = (sum: number): PricingLine[] => [{ productId: 'p1', category: 'shirts', price: sum, quantity: 1 }];
const promo = (over: Partial<PromoCode>): PromoCode =>
  ({ id: 'x', code: 'SALE', title: '', description: '', active: true, discountType: 'percent', discountValue: 10, discountPercent: 10, usedCount: 0, ...over }) as PromoCode;

// 30.09.2026, 12:00 по Москве
const NOW = new Date('2026-09-30T12:00:00+03:00').getTime();

describe('Находка 8: срок промокода (этап 3)', () => {
  test.todo('срок по умолчанию из админки «31 августа 2026 г.» — 30.09 промокод уже истёк', () => {
    // AdminPromoConstructorTab.tsx:58 — значение по умолчанию, поле type="text"; проверка срока смотрит только даты с «-»
    expect(validatePromo(promo({ expiresAt: '31 августа 2026 г.' }), lines(3000), NOW)).not.toBeNull();
  });
  test.todo('промокод «до 2026-09-30» в свой последний день ещё действует', () => {
    // new Date('2026-09-30') — полночь UTC, то есть 03:00 по Москве
    expect(validatePromo(promo({ expiresAt: '2026-09-30' }), lines(3000), NOW)).toBeNull();
  });
});

describe('Находка 9: применённый промокод не перепроверяется (этап 3)', () => {
  test.todo('«−1000 от 5000»: после удаления товаров до 1500 скидки нет', () => {
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

describe('Находка 13: цена доставки только из «Доставка и ПВЗ» (этап 3)', () => {
  test.todo('у курьера свой порог «бесплатно от 10 000» — при 6 000 доставка платная', () => {
    const m = [{ id: 'courier', title: 'Курьер', price: 400, freeThreshold: 10000, duration: '' } as DeliveryMethod];
    expect(getAvailableDeliveryMethods(m, DEFAULT_STOREFRONT_SETTINGS, 6000)[0].price).toBe(400);
  });
  test.todo('самовывоз с ценой 300 стоит 300, а не скрытые 0 ₽', () => {
    const m = [{ id: 'pickup', title: 'ПВЗ', price: 300, freeThreshold: 0, duration: '' } as DeliveryMethod];
    expect(getAvailableDeliveryMethods(m, DEFAULT_STOREFRONT_SETTINGS, 1000)[0].price).toBe(300);
  });
  test.todo('браузер и сервер называют одну цену курьера, даже если в settings/storefront нет courierDeliveryPrice', () => {
    const m = [{ id: 'courier', title: 'Курьер', price: 500, duration: '' } as DeliveryMethod];
    const client = getAvailableDeliveryMethods(m, { ...DEFAULT_STOREFRONT_SETTINGS }, 1000)[0].price;
    const server = getAvailableDeliveryMethods(m, {}, 1000)[0].price; // placeOrder читает сырой документ
    expect(server).toBe(client);
  });
});

describe('Старый промокод без discountType (не подтверждено: в живой базе у всех кодов тип задан)', () => {
  test.todo('админка показывает «500 ₽» — и расчёт даёт 500 ₽, а не 500 %', () => {
    // AdminPromoConstructorTab.tsx:130: без типа при значении > 100 админка считает код рублёвым
    const legacy = { code: 'OLD', discountValue: 500 } as PromoCode;
    expect(calcPromoDiscount(lines(4000), legacy)).toBe(500);
  });
});

describe('Находка 5: списание склада у товара с отзывом (этап 1)', () => {
  test.todo('запись товара после подмешивания отзывов не добавляет поле reviews, которого нет в базе', () => {
    // Правило products разрешает покупателю менять только skus и inStock; лишнее reviews: [] → PERMISSION_DENIED,
    // и склад молча не списывается (App.tsx:1408 без await)
    const stored = { id: 'p1', title: 'Рубашка', price: 3000, skus: [] } as unknown as Product;
    const review: StoredReview = {
      id: 'p1_u1', productId: 'p1', uid: 'u1', authorName: 'Сергей', rating: 5, comment: 'Хорошая',
      date: '30.09.2026', createdAt: '2026-09-30T09:00:00.000Z',
    };
    const [merged] = mergeProductReviews([stored], [review], []);
    expect(Object.keys(withoutCollectionReviews(merged))).toEqual(Object.keys(stored));
  });
});
