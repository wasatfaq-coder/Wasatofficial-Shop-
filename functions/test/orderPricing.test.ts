import { describe, expect, test } from 'bun:test';
import {
  calcOrderTotals,
  calcPromoDiscount,
  getAvailableDeliveryMethods,
  validatePromo,
  type PricingLine,
} from '../../src/shared/orderPricing';
import type { DeliveryMethod, PromoCode } from '../../src/types';

const lines: PricingLine[] = [
  { productId: 'shirt', category: 'shirts', price: 3000, quantity: 2 },
  { productId: 'jacket', category: 'jackets', price: 10000, quantity: 1 },
];

const promo = (p: Partial<PromoCode>): PromoCode => ({
  id: 'p', code: 'CODE', title: '', description: '', discountPercent: 0, usedCount: 0, active: true, ...p,
});

const methods: DeliveryMethod[] = [
  { id: 'courier', title: 'Курьер', duration: '', price: 350, icon: 'Truck' },
  { id: 'express', title: 'Экспресс', duration: '', price: 900, icon: 'Zap', freeThreshold: 0 },
  { id: 'post', title: 'Почта', duration: '', price: 400, icon: 'Mail', isActive: false },
];

describe('calcPromoDiscount', () => {
  test('percent, fixed and legacy discountValue-as-percent', () => {
    expect(calcPromoDiscount(lines, promo({ discountPercent: 10 }))).toBe(1600);
    expect(calcPromoDiscount(lines, promo({ discountType: 'fixed', discountValue: 500 }))).toBe(500);
    expect(calcPromoDiscount(lines, promo({ discountValue: 5 }))).toBe(800);
    expect(calcPromoDiscount(lines, null)).toBe(0);
  });

  test('fixed discount never exceeds the eligible subtotal', () => {
    expect(
      calcPromoDiscount(lines, promo({ discountType: 'fixed', discountValue: 50000, applicableProductIds: ['shirt'] }))
    ).toBe(6000);
  });

  test('restricted promos only discount matching items', () => {
    expect(calcPromoDiscount(lines, promo({ discountPercent: 50, applicableCategories: ['jackets'] }))).toBe(5000);
  });
});

describe('validatePromo', () => {
  test('accepts a valid promo', () => {
    expect(validatePromo(promo({ discountPercent: 10 }), lines)).toBeNull();
  });

  test('rejects inactive, exhausted, expired and below-minimum promos', () => {
    expect(validatePromo(promo({ active: false }), lines)).toMatch(/приостановлен/);
    expect(validatePromo(promo({ usageLimit: 3, usedCount: 3 }), lines)).toMatch(/Лимит/);
    expect(validatePromo(promo({ expiresAt: '2020-01-01' }), lines)).toMatch(/истек/);
    expect(validatePromo(promo({ minOrderAmount: 100000 }), lines)).toMatch(/Минимальная сумма/);
    expect(validatePromo(promo({ applicableProductIds: ['boots'] }), lines)).toMatch(/выбранные товары/);
  });
});

describe('delivery', () => {
  test('filters inactive methods and applies the free-delivery threshold', () => {
    const cheap = getAvailableDeliveryMethods(methods, { freeDeliveryThreshold: 5000 }, 3000);
    expect(cheap.map((m) => m.id)).toEqual(['courier', 'express']);
    expect(cheap[0].price).toBe(350);
    expect(getAvailableDeliveryMethods(methods, { freeDeliveryThreshold: 5000 }, 6000)[0].price).toBe(0);
  });

  test('hides express when disabled in settings', () => {
    expect(getAvailableDeliveryMethods(methods, { isExpressEnabled: false }, 0).map((m) => m.id)).toEqual(['courier']);
  });
});

test('calcOrderTotals', () => {
  expect(calcOrderTotals(lines, promo({ discountPercent: 10 }), 350)).toEqual({
    subtotal: 16000,
    discount: 1600,
    deliveryFee: 350,
    total: 14750,
  });
});
