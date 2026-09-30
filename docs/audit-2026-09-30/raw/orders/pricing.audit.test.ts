// Аудит заказов: расхождения в общем коде расчёта (src/shared/orderPricing.ts).
// Каждый тест записан как «ожидалось владельцем» — падение = подтверждённая находка.
import { describe, expect, test } from 'bun:test';
import {
  calcOrderTotals,
  calcPromoDiscount,
  getAvailableDeliveryMethods,
  validatePromo,
  type PricingLine,
} from '/home/user/Wasatofficial-Shop-/src/shared/orderPricing';
import { DEFAULT_STOREFRONT_SETTINGS } from '/home/user/Wasatofficial-Shop-/src/utils/inventory';
import type { DeliveryMethod, PromoCode } from '/home/user/Wasatofficial-Shop-/src/types';

const lines = (sum: number): PricingLine[] => [{ productId: 'p1', category: 'shirts', price: sum, quantity: 1 }];
const promo = (over: Partial<PromoCode>): PromoCode =>
  ({ id: 'x', code: 'SALE', title: '', description: '', active: true, discountType: 'percent', discountValue: 10, discountPercent: 10, usedCount: 0, ...over }) as PromoCode;

// Сегодня 30.09.2026, 12:00 по Москве
const NOW = new Date('2026-09-30T12:00:00+03:00').getTime();

describe('F1: срок промокода', () => {
  test('срок по умолчанию из админки «31 августа 2026 г.» — промокод уже истёк', () => {
    // AdminPromoConstructorTab.tsx:58 — значение по умолчанию, поле type="text"
    const err = validatePromo(promo({ expiresAt: '31 августа 2026 г.' }), lines(3000), NOW);
    expect(err).not.toBeNull(); // ожидалось: «истек»; получилось: null (действует)
  });
  test('ISO-дата «до 30.09» — в последний день промокод ещё действует', () => {
    const err = validatePromo(promo({ expiresAt: '2026-09-30' }), lines(3000), NOW);
    expect(err).toBeNull(); // ожидалось: действует; получилось: «истек» (с 03:00 МСК)
  });
});

describe('F2: применённый промокод не перепроверяется', () => {
  test('минимальная сумма 5000: после удаления товара скидка остаётся', () => {
    const p = promo({ discountType: 'fixed', discountValue: 1000, discountPercent: 0, minOrderAmount: 5000 });
    expect(validatePromo(p, lines(6000), NOW)).toBeNull(); // применили при 6000
    const after = lines(1500); // покупатель убрал товар, осталось 1500
    expect(validatePromo(p, after, NOW)).not.toBeNull(); // правило говорит «нельзя»…
    // …но корзина и оформление (CartScreen:98, CheckoutScreen:248/279) считают только calcPromoDiscount:
    const { total, discount } = calcOrderTotals(after, p, 0);
    expect(discount).toBe(0); // ожидалось 0; получилось 1000 → итог 500 вместо 1500
    expect(total).toBe(1500);
  });
});

describe('F3: стоимость доставки', () => {
  const settings = DEFAULT_STOREFRONT_SETTINGS; // клиент: {...DEFAULT, ...doc}
  test('у курьера свой порог «бесплатно от 10 000» — при 6 000 доставка платная', () => {
    const m: DeliveryMethod[] = [{ id: 'courier', title: 'Курьер', price: 400, freeThreshold: 10000, duration: '' } as DeliveryMethod];
    const [c] = getAvailableDeliveryMethods(m, settings, 6000);
    expect(c.price).toBe(400); // ожидалось 400 (или 350); получилось 0
  });
  test('самовывоз с ценой 300 из «Доставка и ПВЗ» — берётся 300', () => {
    const m: DeliveryMethod[] = [{ id: 'pickup', title: 'ПВЗ', price: 300, freeThreshold: 0, duration: '' } as DeliveryMethod];
    const [c] = getAvailableDeliveryMethods(m, settings, 1000);
    expect(c.price).toBe(300); // ожидалось 300; получилось 0 (скрытая настройка pickupDeliveryPrice=0)
  });
  test('клиент и сервер считают курьера одинаково, если в settings/storefront нет courierDeliveryPrice', () => {
    const m: DeliveryMethod[] = [{ id: 'courier', title: 'Курьер', price: 500, duration: '' } as DeliveryMethod];
    const client = getAvailableDeliveryMethods(m, { ...DEFAULT_STOREFRONT_SETTINGS }, 1000)[0].price;
    const server = getAvailableDeliveryMethods(m, {} /* сырой документ без поля */, 1000)[0].price;
    expect(server).toBe(client); // ожидалось равенство; получилось клиент 350, сервер 500
  });
});

describe('F4: старый промокод без discountType', () => {
  test('админка показывает «500 ₽», расчёт даёт 500 %', () => {
    // AdminPromoConstructorTab.tsx:130: dType = discountValue > 100 ? 'fixed' : 'percent'
    const legacy = { code: 'OLD', discountValue: 500 } as PromoCode;
    expect(calcPromoDiscount(lines(4000), legacy)).toBe(500); // ожидалось 500; получилось 20000 (заказ бесплатный)
  });
});
