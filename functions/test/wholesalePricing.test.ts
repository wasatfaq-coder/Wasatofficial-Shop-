// Опт: оптовая цена, скидка за объём (% или ₽ с штуки), промокоды не действуют на опт (задача владельца 09.10)
import { describe, expect, test } from 'bun:test';
import {
  brokenPackDiscountErrors,
  brokenPackDiscountedPrice,
  isBrokenPackLine,
  isWholesaleOrder,
  orderLinesByChannel,
  priceCartLines,
  readBrokenPackDiscount,
  readMinWholesaleAmount,
  readVolumeDiscount,
  sellsRetail,
  sellsWholesale,
  volumeDiscountErrors,
  volumeDiscountedPrice,
  volumeTierFor,
  wholesaleLineProblems,
  wholesaleOrderSubtotal,
  type WholesaleSettings,
} from '../../src/shared/wholesalePricing';
import {
  calcOrderTotals,
  calcPromoDiscount,
  toPricingLine,
  validatePromo,
  WHOLESALE_NO_PROMO_TEXT,
} from '../../src/shared/orderPricing';
import { orderPriceIssues } from '../../src/utils/orderPriceCheck';
import { wholesaleFormErrors } from '../../src/utils/wholesaleEditing';
import type { CartItem, Order, Product, PromoCode } from '../../src/types';

const product = (id: string, over: Partial<Product> = {}): Product =>
  ({
    id,
    title: `Товар ${id}`,
    category: 'tshirts',
    categoryLabel: 'Футболки',
    price: 2000,
    description: '',
    material: '',
    images: [],
    colors: [],
    sizes: [],
    inStock: true,
    rating: 0,
    reviewsCount: 0,
    ...over,
  }) as Product;

const line = (p: Product, quantity: number, over: Partial<CartItem> = {}): CartItem => ({
  id: `${p.id}-${quantity}-${over.selectedSize ?? 'M'}`,
  product: p,
  selectedColor: 'Чёрный',
  selectedSize: 'M',
  quantity,
  ...over,
});

const percentScale: WholesaleSettings = {
  volumeDiscount: { kind: 'percent', countBy: 'product', tiers: [{ minPacks: 10, value: 5 }, { minPacks: 30, value: 10 }] },
};
const fixedScale: WholesaleSettings = {
  volumeDiscount: { kind: 'fixed', countBy: 'product', tiers: [{ minPacks: 5, value: 50 }, { minPacks: 20, value: 120 }] },
};

const promo = (p: Partial<PromoCode>): PromoCode => ({
  id: 'p', code: 'SALE', title: '', description: '', discountPercent: 0, usedCount: 0, active: true, ...p,
});

const tee = product('tee', { price: 2000, wholesalePrice: 1000 });

describe('who a product is sold to', () => {
  test('wholesale needs a wholesale price and not «только в розницу»', () => {
    expect(sellsWholesale(tee)).toBe(true);
    expect(sellsWholesale(product('a'))).toBe(false);
    expect(sellsWholesale({ ...tee, saleChannel: 'retail' })).toBe(false);
    expect(sellsRetail({ ...tee, saleChannel: 'wholesale' })).toBe(false);
    // «только оптом» without a wholesale price stays on retail sale — the product is not lost
    expect(sellsRetail(product('b', { saleChannel: 'wholesale' }))).toBe(true);
  });
});

describe('the volume discount', () => {
  test('the step reached by the packs; percent and roubles off one item', () => {
    const scale = readVolumeDiscount(percentScale.volumeDiscount);
    expect(volumeTierFor(9, scale)).toBeNull();
    expect(volumeTierFor(10, scale)).toEqual({ minPacks: 10, value: 5 });
    expect(volumeTierFor(45, scale)).toEqual({ minPacks: 30, value: 10 });
    expect(volumeDiscountedPrice(1000, { minPacks: 10, value: 5 }, 'percent')).toBe(950);
    expect(volumeDiscountedPrice(999, { minPacks: 10, value: 5 }, 'percent')).toBe(949);
    expect(volumeDiscountedPrice(1000, { minPacks: 5, value: 50 }, 'fixed')).toBe(950);
    // a fixed step larger than the price never makes it negative
    expect(volumeDiscountedPrice(40, { minPacks: 5, value: 50 }, 'fixed')).toBe(0);
  });

  test('a stored scale is checked: bad steps dropped, sorted, duplicates by the last', () => {
    expect(readVolumeDiscount(undefined)).toBeUndefined();
    expect(readVolumeDiscount({ kind: 'percent', tiers: [] })).toBeUndefined();
    expect(
      readVolumeDiscount({
        kind: 'percent',
        countBy: 'order',
        tiers: [{ minPacks: 30, value: 10 }, { minPacks: 10, value: 5 }, { minPacks: 0, value: 3 }, { minPacks: 5, value: 95 }, { minPacks: 10, value: 6 }],
      })
    ).toEqual({ kind: 'percent', countBy: 'order', tiers: [{ minPacks: 10, value: 6 }, { minPacks: 30, value: 10 }] });
  });

  test('the admin form says what is wrong with the scale', () => {
    expect(volumeDiscountErrors({ kind: 'percent', countBy: 'product', tiers: [{ minPacks: 10, value: 5 }] })).toEqual([]);
    expect(
      volumeDiscountErrors({
        kind: 'percent',
        countBy: 'product',
        tiers: [{ minPacks: 2.5, value: 5 }, { minPacks: 10, value: NaN }, { minPacks: 20, value: 95 }],
      })
    ).toEqual([
      'Ступень 1: число упаковок — целое, от 1',
      'Ступень 2: скидка больше нуля',
      'Ступень 3: скидка не больше 90 %',
    ]);
    expect(
      volumeDiscountErrors({ kind: 'fixed', countBy: 'product', tiers: [{ minPacks: 10, value: 100 }, { minPacks: 20, value: 50 }] })
    ).toEqual(['Скидка от 20 уп. меньше, чем от 10 уп.']);
    expect(
      volumeDiscountErrors({ kind: 'fixed', countBy: 'product', tiers: [{ minPacks: 10, value: 100 }, { minPacks: 10, value: 150 }] })
    ).toEqual(['Ступень 2: ступень «от 10 уп.» уже есть']);
  });
});

describe('the cart prices its lines (priceCartLines — the cart, the checkout and placeOrder)', () => {
  test('retail lines are untouched by the scale and lose any own price', () => {
    const [retail] = priceCartLines([line(tee, 50, { unitPrice: 1, priceKind: 'retail' })], percentScale);
    expect(retail.unitPrice).toBeUndefined();
    expect(retail.priceKind).toBeUndefined();
    expect(toPricingLine(retail).price).toBe(2000);
  });

  test('a wholesale line takes the wholesale price; the percent step from the packs of the product', () => {
    const [few] = priceCartLines([line(tee, 9, { priceKind: 'wholesale' })], percentScale);
    expect([few.unitPrice, few.volumeDiscountPerUnit]).toEqual([1000, undefined]);
    // two sizes of the same model count together: 6 + 4 = 10 packs → 5 %
    const priced = priceCartLines(
      [line(tee, 6, { priceKind: 'wholesale' }), line(tee, 4, { priceKind: 'wholesale', selectedSize: 'L' })],
      percentScale
    );
    expect(priced.map((i) => [i.unitPrice, i.volumeDiscountPerUnit])).toEqual([[950, 50], [950, 50]]);
  });

  test('a fixed step takes roubles off each item', () => {
    const [p] = priceCartLines([line(tee, 20, { priceKind: 'wholesale' })], fixedScale);
    expect([p.unitPrice, p.volumeDiscountPerUnit]).toEqual([880, 120]);
  });

  test('packs, not items: a pack of 6 needs 60 items for the 10-pack step', () => {
    const packed = product('pack', { price: 2000, wholesalePrice: 1000, wholesalePackSize: 6 });
    expect(priceCartLines([line(packed, 54, { priceKind: 'wholesale' })], percentScale)[0].unitPrice).toBe(1000);
    const [ten] = priceCartLines([line(packed, 60, { priceKind: 'wholesale' })], percentScale);
    expect([ten.unitPrice, ten.packSize]).toEqual([950, 6]);
  });

  test('«по всему заказу» counts the packs of every wholesale product together', () => {
    const other = product('other', { price: 3000, wholesalePrice: 1500 });
    const items = [line(tee, 6, { priceKind: 'wholesale' }), line(other, 4, { priceKind: 'wholesale' })];
    expect(priceCartLines(items, percentScale).map((i) => i.unitPrice)).toEqual([1000, 1500]);
    const byOrder: WholesaleSettings = { volumeDiscount: { ...percentScale.volumeDiscount!, countBy: 'order' } };
    expect(priceCartLines(items, byOrder).map((i) => i.unitPrice)).toEqual([950, 1425]);
  });

  test('retail lines never count toward the step', () => {
    const items = [line(tee, 5, { priceKind: 'wholesale' }), line(tee, 20, { selectedSize: 'L' })];
    expect(priceCartLines(items, percentScale).map((i) => i.unitPrice)).toEqual([1000, undefined]);
  });

  test('«только оптом» is always wholesale; a product no longer sold wholesale falls back to retail', () => {
    const only = product('only', { price: 2000, wholesalePrice: 1100, saleChannel: 'wholesale' });
    expect(priceCartLines([line(only, 1)], undefined)[0]).toMatchObject({ priceKind: 'wholesale', unitPrice: 1100 });
    const stopped = { ...tee, wholesalePrice: undefined };
    const [back] = priceCartLines([line(stopped, 1, { priceKind: 'wholesale', unitPrice: 1000 })], percentScale);
    expect([back.priceKind, back.unitPrice, toPricingLine(back).price]).toEqual([undefined, undefined, 2000]);
  });

  test('the store\'s discount of the product (old price) does not reach the wholesale price', () => {
    const sale = product('sale', { price: 1500, originalPrice: 2000, wholesalePrice: 1000 });
    expect(priceCartLines([line(sale, 1, { priceKind: 'wholesale' })])[0].unitPrice).toBe(1000);
  });

  test('whole packs and the minimum of the product (all variants together)', () => {
    const packed = product('pack', { price: 2000, wholesalePrice: 1000, wholesalePackSize: 6, wholesaleMinPacks: 3 });
    expect(wholesaleLineProblems(priceCartLines([line(packed, 7, { priceKind: 'wholesale' })]))).toEqual([
      '«Товар pack»: оптом — только целыми упаковками по 6 шт.',
    ]);
    expect(wholesaleLineProblems(priceCartLines([line(packed, 12, { priceKind: 'wholesale' })]))).toEqual([
      '«Товар pack»: оптом — от 3 уп. по 6 шт.',
    ]);
    const enough = [line(packed, 12, { priceKind: 'wholesale' }), line(packed, 6, { priceKind: 'wholesale', selectedSize: 'L' })];
    expect(wholesaleLineProblems(priceCartLines(enough))).toEqual([]);
  });

  test('minimum wholesale order amount (minOrderAmount): checks wholesale + pack lines, ignores retail-only carts', () => {
    expect(readMinWholesaleAmount(undefined)).toBeUndefined();
    expect(readMinWholesaleAmount({ minOrderAmount: 0 })).toBeUndefined();
    expect(readMinWholesaleAmount({ minOrderAmount: -500 })).toBeUndefined();
    expect(readMinWholesaleAmount({ minOrderAmount: 15_000 })).toBe(15_000);

    const minSettings: WholesaleSettings = { minOrderAmount: 15_000 };
    // Retail-only cart is not blocked by wholesale minimum order amount
    const retailOnly = priceCartLines([line(tee, 2)], minSettings);
    expect(wholesaleOrderSubtotal(retailOnly)).toBe(0);
    expect(wholesaleLineProblems(retailOnly, minSettings)).toEqual([]);

    // Wholesale cart below 15 000 ₽ reports remaining amount
    const shortWholesale = priceCartLines([line(tee, 10, { priceKind: 'wholesale' })], minSettings);
    expect(wholesaleOrderSubtotal(shortWholesale)).toBe(10_000);
    const problems = wholesaleLineProblems(shortWholesale, minSettings);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('Минимальная сумма оптового заказа');
    expect(problems[0].replace(/\s/g, '')).toContain('добавьтеещёна5000₽');

    // Wholesale cart at or above 15 000 ₽ passes
    const fullWholesale = priceCartLines([line(tee, 15, { priceKind: 'wholesale' })], minSettings);
    expect(wholesaleOrderSubtotal(fullWholesale)).toBe(15_000);
    expect(wholesaleLineProblems(fullWholesale, minSettings)).toEqual([]);
  });
});

describe('promo codes and coupons do not apply to wholesale lines', () => {
  const retailShirt = product('shirt', { price: 3000 });
  const cart = priceCartLines(
    [line(tee, 10, { priceKind: 'wholesale' }), line(retailShirt, 1)],
    percentScale
  );
  const lines = cart.map(toPricingLine);

  test('a percent code takes off the retail lines only', () => {
    // wholesale 10 × 950 = 9500, retail 3000; 10 % — of 3000 only
    expect(calcPromoDiscount(lines, promo({ discountPercent: 10 }))).toBe(300);
    expect(calcOrderTotals(lines, promo({ discountPercent: 10 }), 0)).toEqual({ subtotal: 12500, discount: 300, deliveryFee: 0, total: 12200 });
  });

  test('a fixed code is capped by the retail lines', () => {
    expect(calcPromoDiscount(lines, promo({ discountType: 'fixed', discountValue: 5000 }))).toBe(3000);
  });

  test('wholesale sums do not reach a code\'s minimum order amount', () => {
    const code = promo({ discountPercent: 10, minOrderAmount: 5000 });
    expect(calcPromoDiscount(lines, code)).toBe(0);
    expect(validatePromo(code, lines)).toMatch(/в рознице в корзине: 3\s000 ₽/);
  });

  test('a cart of wholesale lines only refuses any code', () => {
    const onlyWholesale = priceCartLines([line(tee, 10, { priceKind: 'wholesale' })], percentScale).map(toPricingLine);
    expect(validatePromo(promo({ discountPercent: 10 }), onlyWholesale)).toBe(WHOLESALE_NO_PROMO_TEXT);
    expect(calcPromoDiscount(onlyWholesale, promo({ discountPercent: 10 }))).toBe(0);
    // a code for this very product does not reach its wholesale line either
    expect(calcPromoDiscount(onlyWholesale, promo({ discountPercent: 10, applicableProductIds: ['tee'] }))).toBe(0);
  });

  test('retail orders count exactly as before', () => {
    const retailOnly = priceCartLines([line(retailShirt, 2)], percentScale).map(toPricingLine);
    expect(calcOrderTotals(retailOnly, promo({ discountPercent: 10 }), 350)).toEqual({ subtotal: 6000, discount: 600, deliveryFee: 350, total: 5750 });
  });
});

describe('wholesale orders in «Заказы» and «Аналитика»', () => {
  const order = (items: CartItem[], over: Partial<Order> = {}): Order =>
    ({
      id: 'WS-1',
      date: '',
      createdAt: '2026-10-09T10:00:00.000Z',
      items,
      status: 'accepted',
      totalPrice: items.reduce((s, i) => s + (i.unitPrice ?? i.product.price) * i.quantity, 0),
      deliveryAddress: '',
      deliveryMethod: 'Курьер',
      customerName: 'Покупатель',
      customerPhone: '+7',
      paymentMethod: '',
      ...over,
    }) as Order;

  test('the «Опт» mark and the sums of wholesale and retail apart', () => {
    const items = priceCartLines([line(tee, 10, { priceKind: 'wholesale' }), line(product('shirt', { price: 3000 }), 1)], percentScale);
    expect(isWholesaleOrder(order(items))).toBe(true);
    expect(isWholesaleOrder(order([line(tee, 1)]))).toBe(false);
    expect(orderLinesByChannel(order(items))).toEqual({ wholesale: 9500, retail: 3000 });
  });

  test('the price check takes the volume step and catches a made-up wholesale line', () => {
    const items = priceCartLines([line(tee, 10, { priceKind: 'wholesale' })], percentScale);
    expect(orderPriceIssues(order(items), [tee], { settings: { wholesale: percentScale } })).toEqual([]);
    const cheap = items.map((i) => ({ ...i, unitPrice: 500 }));
    expect(orderPriceIssues(order(cheap), [tee], { settings: { wholesale: percentScale } })).toEqual(['«Товар tee»: в заказе опт 500 ₽, в каталоге 950 ₽']);
    const notWholesale = product('shirt', { price: 3000 });
    const fake = [{ ...line(notWholesale, 1), priceKind: 'wholesale' as const, unitPrice: 100 }];
    expect(orderPriceIssues(order(fake), [notWholesale], { settings: { wholesale: percentScale } })).toEqual([
      '«Товар shirt»: в заказе оптовая цена 100 ₽, а товар оптом не продаётся',
    ]);
  });
});

describe('the wholesale fields of the product form', () => {
  const draft = { channel: 'both' as const, price: '', packSize: '', minPacks: '', markup: '', retailPrice: 2000 };
  test('empty is fine; «только оптом» needs a wholesale price; numbers are checked', () => {
    expect(wholesaleFormErrors(draft)).toEqual([]);
    expect(wholesaleFormErrors({ ...draft, channel: 'wholesale' })).toEqual([
      '«Только оптом»: укажите оптовую цену — без неё товар продаётся в розницу',
    ]);
    expect(wholesaleFormErrors({ ...draft, price: '0', packSize: '2,5', minPacks: 'abc', markup: '2000' })).toEqual([
      'Оптовая цена — число больше нуля',
      'Штук в упаковке — целое число от 1 до 1000',
      'Минимум упаковок — целое число от 1',
      'Своя наценка опта — от 0 до 1000 %; пустое поле — наценка опта для всех товаров',
    ]);
    expect(wholesaleFormErrors({ ...draft, channel: 'retail', price: 'abc' })).toEqual([]);
  });
});

describe('broken pack discount and priceKind === broken (docs/broken-pack-plan.md, stages 3–4)', () => {
  const brokenPercent: WholesaleSettings = {
    volumeDiscount: percentScale.volumeDiscount,
    brokenPackDiscount: { kind: 'percent', value: 15 },
  };
  const brokenFixed: WholesaleSettings = {
    brokenPackDiscount: { kind: 'fixed', value: 120 },
  };

  test('reads and validates brokenPackDiscount', () => {
    expect(readBrokenPackDiscount(brokenPercent)).toEqual({ kind: 'percent', value: 15 });
    expect(readBrokenPackDiscount({ wholesale: brokenFixed })).toEqual({ kind: 'fixed', value: 120 });
    expect(readBrokenPackDiscount({ brokenPackDiscount: { kind: 'percent', value: 95 } })).toBeUndefined();
    expect(brokenPackDiscountErrors({ kind: 'percent', value: 15 })).toEqual([]);
    expect(brokenPackDiscountErrors({ kind: 'percent', value: 95 })).toEqual(['Скидка на разбитую упаковку — не больше 90 %']);
    expect(brokenPackDiscountedPrice(1000, { kind: 'percent', value: 15 })).toBe(850);
    expect(brokenPackDiscountedPrice(1000, { kind: 'fixed', value: 120 })).toBe(880);
  });

  test('priceCartLines prices broken lines from wholesalePrice minus brokenPackDiscount, without volume steps or promos', () => {
    const items = priceCartLines(
      [
        line(tee, 2, { priceKind: 'broken' }),
        line(tee, 10, { priceKind: 'wholesale', selectedSize: 'L' }),
      ],
      brokenPercent
    );
    expect(isBrokenPackLine(items[0])).toBe(true);
    // broken line gets 1000 - 15% = 850 (not affected by the 10-pack 5% volume step)
    expect(items[0].unitPrice).toBe(850);
    // wholesale line gets 1000 - 5% = 950
    expect(items[1].unitPrice).toBe(950);

    // promo code does not apply to broken lines and does not count them toward minOrderAmount
    const brokenOnlyPricing = [toPricingLine(items[0])];
    expect(calcPromoDiscount(brokenOnlyPricing, promo({ discountPercent: 10 }))).toBe(0);
    expect(validatePromo(promo({ discountPercent: 10 }), brokenOnlyPricing)).toBe(WHOLESALE_NO_PROMO_TEXT);
  });

  test('a broken line on a product changed to wholesale-only or retail-only falls back from broken pricing', () => {
    const wholesaleOnly = { ...tee, saleChannel: 'wholesale' as const };
    const [afterWholesale] = priceCartLines([line(wholesaleOnly, 1, { priceKind: 'broken' })], brokenPercent);
    expect(afterWholesale.priceKind).toBe('wholesale');

    const retailOnly = { ...tee, saleChannel: 'retail' as const };
    const [afterRetail] = priceCartLines([line(retailOnly, 1, { priceKind: 'broken' })], brokenPercent);
    expect(afterRetail.priceKind).toBeUndefined();
    expect(toPricingLine(afterRetail).price).toBe(2000);
  });
});

