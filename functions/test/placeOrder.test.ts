// Integration tests for placeOrderCore against the Firestore emulator.
// Run from the repo root: bun run test:functions
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { OrderError, parsePlaceOrderRequest, placeOrderCore, type OrderErrorCode } from '../src/placeOrder';
import type { PlaceOrderRequest } from '../../src/shared/orderApi';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is not set — run via `bun run test:functions`');
}

const app = initializeApp({ projectId: 'demo-manstyle' }, 'place-order-test');
const db = getFirestore(app);

const shirt = {
  id: 'shirt',
  title: 'Рубашка',
  category: 'shirts',
  price: 3000,
  inStock: true,
  sizes: ['M', 'L'],
  colors: [{ name: 'Белый', hex: '#fff' }],
  skus: [
    { id: 'shirt-w-m', color: 'Белый', size: 'M', stock: 2 },
    { id: 'shirt-w-l', color: 'Белый', size: 'L', stock: 0 },
  ],
};

const jacket = {
  id: 'jacket',
  title: 'Куртка',
  category: 'jackets',
  price: 10000,
  inStock: true,
  skus: [{ id: 'jacket-b-l', color: 'Черный', size: 'L', stock: 5 }],
};

const courier = { id: 'courier', title: 'Курьер', duration: '1-2 дня', price: 350, icon: 'Truck', isActive: true };

function request(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 1 }],
    deliveryMethodId: 'courier',
    deliveryAddress: 'Москва, ул. Тверская, 1',
    paymentMethod: 'Банковская карта (онлайн)',
    contact: { name: 'Иван', phone: '+79990000000' },
    ...overrides,
  };
}

async function expectOrderError(promise: Promise<unknown>, code: OrderErrorCode, message?: RegExp) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(OrderError);
    expect((err as OrderError).code).toBe(code);
    if (message) expect((err as OrderError).message).toMatch(message);
    return;
  }
  throw new Error('Expected OrderError');
}

beforeEach(async () => {
  await db.recursiveDelete(db.collection('products'));
  await db.recursiveDelete(db.collection('orders'));
  await db.recursiveDelete(db.collection('promos'));
  await db.recursiveDelete(db.collection('delivery_methods'));
  await db.recursiveDelete(db.collection('settings'));
  await db.recursiveDelete(db.collection('stock_movements'));
  await db.doc('products/shirt').set(shirt);
  await db.doc('products/jacket').set(jacket);
  await db.doc('delivery_methods/courier').set(courier);
  await db.doc('settings/storefront').set({ freeDeliveryThreshold: 5000, isExpressEnabled: true });
});

afterAll(async () => {
  await deleteApp(app);
});

describe('placeOrderCore', () => {
  test('uses server prices and delivery fee, ignoring anything the client claims', async () => {
    const order = await placeOrderCore(db, request(), 'alice');
    expect(order.totalPrice).toBe(3000 + 350);
    expect(order.deliveryFee).toBe(350);
    expect(order.customerUid).toBe('alice');
    expect(order.status).toBe('accepted');
    expect(order.placedVia).toBe('server');
    // «Оплачен» ставит только администратор
    expect(order.paymentStatus).toBe('pending');
    // The order keeps a light product copy: no stock, card texts or embedded photos
    expect(order.items[0].product.skus).toBeUndefined();
    // the review rule checks «Покупка подтверждена» by it (ревью 11.10, находка 2)
    expect(order.productIds).toEqual(['shirt']);

    const stored = (await db.doc(`orders/${order.id}`).get()).data()!;
    expect(stored.totalPrice).toBe(3350);
    // the server's time of the write, as every write of an order (docs/orders-scale-plan.md, stage 2)
    expect(stored.updatedAt).toBeInstanceOf(Timestamp);
    expect(stored.historySteps.length).toBeGreaterThan(0);
  });

  test('payment on delivery is marked for the courier, never as paid', async () => {
    const order = await placeOrderCore(db, request({ paymentMethod: 'Наличными (при получении)' }), 'alice');
    expect(order.paymentStatus).toBe('paid_on_delivery');
  });

  test('free delivery above the threshold', async () => {
    const order = await placeOrderCore(
      db,
      request({ items: [{ productId: 'jacket', color: 'Черный', size: 'L', quantity: 1 }] }),
      null
    );
    expect(order.totalPrice).toBe(10000);
    expect(order.customerUid).toBeUndefined();
  });

  test('deducts stock atomically and rejects overselling', async () => {
    await placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 2 }] }), null);
    const shirtAfter = (await db.doc('products/shirt').get()).data()!;
    expect(shirtAfter.skus.find((s: { id: string }) => s.id === 'shirt-w-m').stock).toBe(0);
    expect(shirtAfter.inStock).toBe(false);

    await expectOrderError(placeOrderCore(db, request(), null), 'failed-precondition', /Недостаточно товара/);
    expect((await db.collection('orders').get()).size).toBe(1);
  });

  test('writes the write-off to the stock journal in the same transaction (finding 17)', async () => {
    const order = await placeOrderCore(
      db,
      request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 2 }] }),
      null
    );
    const journal = (await db.collection('stock_movements').get()).docs.map((d) => d.data());
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      id: `${order.id}_0`,
      type: 'order',
      orderId: order.id,
      lineIndex: 0,
      productId: 'shirt',
      changeQuantity: -2,
    });

    // a refused order leaves no entry
    await expectOrderError(placeOrderCore(db, request(), null), 'failed-precondition', /Недостаточно товара/);
    expect((await db.collection('stock_movements').get()).size).toBe(1);
  });

  test('preorder mode accepts sold-out variants without touching stock', async () => {
    const soldOut = request({ items: [{ productId: 'shirt', color: 'Белый', size: 'L', quantity: 3 }] });
    await expectOrderError(placeOrderCore(db, soldOut, null), 'failed-precondition', /Недостаточно товара/);

    await db.doc('settings/storefront').set({ isPreorderMode: true }, { merge: true });
    const order = await placeOrderCore(
      db,
      request({
        items: [
          { productId: 'shirt', color: 'Белый', size: 'L', quantity: 3 },
          { productId: 'shirt', color: 'Белый', size: 'M', quantity: 1 },
        ],
      }),
      null
    );
    expect(order.items.map((i) => Boolean(i.isPreorder))).toEqual([true, false]);
    const skus = (await db.doc('products/shirt').get()).data()!.skus as { id: string; stock: number }[];
    expect(skus.find((s) => s.id === 'shirt-w-l')!.stock).toBe(0);
    expect(skus.find((s) => s.id === 'shirt-w-m')!.stock).toBe(1);

    // A variant still in stock cannot be oversold even in preorder mode
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 5 }] }), null),
      'failed-precondition',
      /Недостаточно товара/
    );
  });

  test('sums duplicate lines of the same variant when checking stock', async () => {
    await expectOrderError(
      placeOrderCore(
        db,
        request({
          items: [
            { productId: 'shirt', color: 'Белый', size: 'M', quantity: 2 },
            { productId: 'shirt', color: 'белый', size: 'm', quantity: 1 },
          ],
        }),
        null
      ),
      'failed-precondition'
    );
  });

  test('rejects unknown products, variants and delivery methods', async () => {
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'nope', color: '', size: '', quantity: 1 }] }), null),
      'not-found'
    );
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Красный', size: 'M', quantity: 1 }] }), null),
      'invalid-argument'
    );
    await expectOrderError(placeOrderCore(db, request({ deliveryMethodId: 'teleport' }), null), 'invalid-argument');
  });

  test('a product taken off sale by the admin cannot be ordered', async () => {
    await db.doc('products/shirt').update({ inStock: false });
    await expectOrderError(placeOrderCore(db, request(), null), 'failed-precondition', /больше не продается/);
  });

  test('wholesale: the wholesale price minus the volume step, no promo on it; retail lines as before', async () => {
    await db.doc('products/jacket').update({ wholesalePrice: 6000, wholesalePackSize: 1 });
    await db.doc('settings/storefront').set({
      freeDeliveryThreshold: 0,
      isExpressEnabled: true,
      wholesale: { volumeDiscount: { kind: 'fixed', countBy: 'product', tiers: [{ minPacks: 3, value: 500 }] } },
    });
    await db.doc('promos/p1').set({
      id: 'p1', code: 'SALE10', title: '', description: '', discountPercent: 10, active: true, usedCount: 0, generatedRevenue: 0,
    });
    const order = await placeOrderCore(
      db,
      request({
        promoCode: 'SALE10',
        items: [
          { productId: 'jacket', color: 'Черный', size: 'L', quantity: 3, wholesale: true },
          { productId: 'shirt', color: 'Белый', size: 'M', quantity: 1 },
        ],
      }),
      null
    );
    const [jacketLine, shirtLine] = order.items;
    // 3 packs reach «от 3 уп. — 500 ₽ с шт.»: 6000 − 500 = 5500 ₽
    expect([jacketLine.priceKind, jacketLine.unitPrice, jacketLine.volumeDiscountPerUnit]).toEqual(['wholesale', 5500, 500]);
    expect(shirtLine.priceKind).toBeUndefined();
    // 10 % only of the retail shirt
    expect(order.discountAmount).toBe(300);
    expect(order.totalPrice).toBe(3 * 5500 + 3000 - 300 + 350);
  });

  test('wholesale: a product not sold wholesale is priced retail; too few packs are refused', async () => {
    const retail = await placeOrderCore(
      db,
      request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 1, wholesale: true }] }),
      null
    );
    expect([retail.items[0].priceKind, retail.items[0].unitPrice]).toEqual([undefined, undefined]);
    expect(retail.totalPrice).toBe(3000 + 350);

    await db.doc('products/jacket').update({ wholesalePrice: 6000, wholesaleMinPacks: 2, saleChannel: 'wholesale' });
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'jacket', color: 'Черный', size: 'L', quantity: 1 }] }), null),
      'failed-precondition',
      /оптом — от 2 уп/
    );
  });

  test('size pack: priced and stocked by the server, a line per size, journal per size (stage 20)', async () => {
    await db.doc('products/shirt').update({
      wholesalePrice: 2000,
      sizePacks: [{ id: 'pack-1', sizes: [{ size: 'M', qty: 2 }, { size: 'L', qty: 1 }] }],
      skus: [
        { id: 'shirt-w-m', color: 'Белый', size: 'M', stock: 4 },
        { id: 'shirt-w-l', color: 'Белый', size: 'L', stock: 2 },
      ],
    });
    await db.doc('settings/storefront').set({ freeDeliveryThreshold: 0, isExpressEnabled: true });
    const order = await placeOrderCore(
      db,
      request({ items: [{ productId: 'shirt', color: 'Белый', size: '', quantity: 2, packId: 'pack-1' }] }),
      null
    );
    // 2 packs × (2000 × 3 pcs) = 12 000 ₽, lines M ×4 and L ×2
    expect(order.items.map((l) => [l.selectedSize, l.quantity, l.priceKind, l.packCount])).toEqual([
      ['M', 4, 'pack', 2],
      ['L', 2, 'pack', 2],
    ]);
    expect(order.totalPrice).toBe(12_000 + 350);
    expect(order.items.some((l) => 'sizePacks' in l.product || 'packSizes' in l)).toBe(false);
    const skus = (await db.doc('products/shirt').get()).data()!.skus as { size: string; stock: number }[];
    expect(skus.map((s) => s.stock)).toEqual([0, 0]);
    const journal = (await db.collection('stock_movements').get()).docs.map((d) => d.data().size).sort();
    expect(journal).toEqual(['L', 'M']);
  });

  test('size pack: a missing size refuses the order even in preorder mode; an unknown pack is refused', async () => {
    await db.doc('products/shirt').update({ sizePacks: [{ id: 'pack-1', price: 9000, sizes: [{ size: 'M', qty: 1 }, { size: 'L', qty: 1 }] }] });
    await db.doc('settings/storefront').set({ freeDeliveryThreshold: 0, isExpressEnabled: true, isPreorderMode: true });
    // L is sold out (stock 0)
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Белый', size: '', quantity: 1, packId: 'pack-1' }] }), null),
      'failed-precondition',
      /Недостаточно товара/
    );
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Белый', size: '', quantity: 1, packId: 'pack-x' }] }), null),
      'failed-precondition',
      /Ростовка/
    );
    const skus = (await db.doc('products/shirt').get()).data()!.skus as { stock: number }[];
    expect(skus.map((s) => s.stock)).toEqual([2, 0]);
  });

  test('parses the wholesale choice and nothing else from the request', () => {
    const parsed = parsePlaceOrderRequest({
      ...request(),
      items: [{ productId: 'jacket', color: 'Черный', size: 'L', quantity: 1, wholesale: true, unitPrice: 1 }],
    });
    expect(parsed.items[0]).toEqual({ productId: 'jacket', color: 'Черный', size: 'L', quantity: 1, wholesale: true });
  });

  test('applies a promo on the server and updates its counters', async () => {
    await db.doc('promos/p1').set({
      id: 'p1', code: 'SALE10', title: '', description: '', discountPercent: 10,
      active: true, usedCount: 0, generatedRevenue: 0,
    });
    const order = await placeOrderCore(db, request({ promoCode: 'SALE10' }), null);
    expect(order.discountAmount).toBe(300);
    expect(order.totalPrice).toBe(3000 - 300 + 350);
    const promo = (await db.doc('promos/p1').get()).data()!;
    expect(promo.usedCount).toBe(1);
    expect(promo.generatedRevenue).toBe(order.totalPrice);
  });

  test('a partner code without a percent earns no commission (finding 47: the percent is not made up)', async () => {
    await db.doc('promos/p4').set({
      id: 'p4', code: 'PARTNER', title: '', description: '', discountPercent: 10, isReferral: true,
      active: true, usedCount: 0, generatedRevenue: 0, commissionEarned: 0,
    });
    await placeOrderCore(db, request({ promoCode: 'PARTNER' }), null);
    expect((await db.doc('promos/p4').get()).data()!.commissionEarned).toBe(0);
  });

  // ревью 16.10, находка 1: разбитой упаковкой — только штуки сверх целых ростовок, и не у товара без ростовок
  test('a broken pack sells only the pieces left above whole packs', async () => {
    await db.doc('products/tee').set({
      id: 'tee', title: 'Футболка', category: 'shirts', price: 1500, wholesalePrice: 1000, inStock: true,
      sizes: ['S', 'L'], colors: [{ name: 'Синий', hex: '#1F3A93' }],
      skus: [
        { id: 'tee-s', color: 'Синий', size: 'S', stock: 3 },
        { id: 'tee-l', color: 'Синий', size: 'L', stock: 4 },
      ],
      sizePacks: [{ id: 'a', sizes: [{ size: 'S', qty: 1 }, { size: 'L', qty: 1 }] }],
    });
    const broken = (size: string, quantity: number) =>
      request({ items: [{ productId: 'tee', color: 'Синий', size, quantity, broken: true }] });
    await expectOrderError(placeOrderCore(db, broken('L', 2), 'alice'), 'failed-precondition', /не больше 1 шт/);
    await expectOrderError(placeOrderCore(db, broken('S', 1), 'alice'), 'failed-precondition', /разбитая упаковка/);
    const order = await placeOrderCore(db, broken('L', 1), 'alice');
    expect(order.items[0].priceKind).toBe('broken');
    await expectOrderError(
      placeOrderCore(db, request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 1, broken: true }] }), 'alice'),
      'failed-precondition',
      /разбитая упаковка/
    );
  });

  test('rejects exhausted, inactive and unknown promos', async () => {
    await db.doc('promos/p2').set({
      id: 'p2', code: 'ONCE', title: '', description: '', discountPercent: 50,
      active: true, usedCount: 1, usageLimit: 1,
    });
    // a limited code is for a Google sign-in only: the limit is checked for such a buyer
    await expectOrderError(placeOrderCore(db, request({ promoCode: 'ONCE' }), 'alice', new Date(), true), 'failed-precondition', /Лимит/);
    await expectOrderError(placeOrderCore(db, request({ promoCode: 'ONCE' }), null), 'failed-precondition', /входа через Google/);
    await expectOrderError(placeOrderCore(db, request({ promoCode: 'NOPE' }), null), 'not-found');
  });

  test('restricted promo discounts only eligible items', async () => {
    await db.doc('promos/p3').set({
      id: 'p3', code: 'JACKETS', title: '', description: '', discountPercent: 20,
      active: true, usedCount: 0, applicableCategories: ['jackets'],
    });
    const order = await placeOrderCore(
      db,
      request({
        promoCode: 'JACKETS',
        items: [
          { productId: 'shirt', color: 'Белый', size: 'M', quantity: 1 },
          { productId: 'jacket', color: 'Черный', size: 'L', quantity: 1 },
        ],
      }),
      null
    );
    expect(order.discountAmount).toBe(2000);
    expect(order.totalPrice).toBe(13000 - 2000);
  });

  test('quick order has no delivery fee and refuses promos', async () => {
    const order = await placeOrderCore(db, request({ deliveryMethodId: 'quick-order' }), null);
    expect(order.totalPrice).toBe(3000);
    // the manager agrees the delivery: no made-up «Экспресс курьер» (UX audit 03.10, finding 22)
    expect(order.deliveryMethod).toBe('Заказ в 1 клик');
    await expectOrderError(
      placeOrderCore(db, request({ deliveryMethodId: 'quick-order', promoCode: 'X' }), null),
      'invalid-argument'
    );
  });

  test('captures order_costs snapshot at the moment of server order placement when product_costs exist', async () => {
    await db.doc('product_costs/shirt').set({ costPrice: 1250 });
    const now = new Date('2026-10-15T10:00:00.000Z');
    const order = await placeOrderCore(db, request(), 'alice', now);
    const snap = await db.doc(`order_costs/${order.id}`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual({
      orderId: order.id,
      orderCreatedAt: '2026-10-15T10:00:00.000Z',
      capturedAt: '2026-10-15T10:00:00.000Z',
      lines: [{ productId: 'shirt', size: 'M', color: 'Белый', unitCost: 1250 }],
    });
  });

  // Находка 43 (07.10): способ оплаты сервер не сверяет с «Оплатой» в «Витрине» — заказ проходит с любым текстом,
  // например «при получении», которого у магазина нет. Известно с 02.10 (находка 7): закрыть до включения серверных
  // заказов. Проверить, что находка ещё воспроизводится: `bun test --todo test/placeOrder.test.ts` под эмулятором
  test.todo('a payment method the shop does not offer (or has switched off) is refused', async () => {
    await db.doc('settings/storefront').set({
      freeDeliveryThreshold: 5000,
      paymentMethods: [
        { id: 'transfer', title: 'Перевод по номеру телефона', isActive: true },
        { id: 'cash', title: 'Наличными при получении', onDelivery: true, isActive: false },
      ],
    });
    await expectOrderError(placeOrderCore(db, request({ paymentMethod: 'Наличные курьеру (при получении)' }), null), 'invalid-argument');
    await expectOrderError(placeOrderCore(db, request({ paymentMethod: 'Наличными при получении' }), null), 'invalid-argument');
    const order = await placeOrderCore(db, request({ paymentMethod: 'Перевод по номеру телефона' }), null);
    expect(order.paymentStatus).toBe('pending');
  });
});

describe('parsePlaceOrderRequest', () => {
  test('rejects malformed payloads', () => {
    expect(() => parsePlaceOrderRequest(null)).toThrow(OrderError);
    expect(() => parsePlaceOrderRequest({ ...request(), items: [] })).toThrow(/Корзина пуста/);
    expect(() =>
      parsePlaceOrderRequest({ ...request(), items: [{ productId: 'shirt', quantity: -1 }] })
    ).toThrow(/количество/);
    expect(() => parsePlaceOrderRequest({ ...request(), contact: { name: '', phone: '1' } })).toThrow(/имя/);
  });

  test('keeps Фамилия / Имя / Отчество and the address parts, dropping unknown address fields', async () => {
    const parsed = parsePlaceOrderRequest({
      ...request(),
      contact: { name: 'x', phone: '+79990000000', lastName: 'Петров', firstName: 'Иван', middleName: 'Сергеевич' },
      addressParts: { region: 'Россия', city: 'Москва', street: 'Тверская', house: '7', hacked: 'y' },
    });
    expect(parsed.contact).toMatchObject({ lastName: 'Петров', firstName: 'Иван', middleName: 'Сергеевич' });
    expect(parsed.addressParts).toEqual({ region: 'Россия', city: 'Москва', street: 'Тверская', house: '7' });
    expect(() => parsePlaceOrderRequest({ ...request(), contact: { name: 'x', phone: '1', lastName: 'x'.repeat(61) } })).toThrow(/фамилия/);
    const order = await placeOrderCore(db, parsed, 'alice');
    expect(order.customerName).toBe('Петров Иван Сергеевич');
    expect(order.customerMiddleName).toBe('Сергеевич');
    expect(order.deliveryAddressParts?.city).toBe('Москва');
  });

  test('writes the delivery kind and the first history entry («Доработки 4»)', async () => {
    const order = await placeOrderCore(db, request(), 'alice');
    expect(order.deliveryKind).toBe('courier');
    expect(order.statusLog).toHaveLength(1);
    expect(order.statusLog?.[0]).toMatchObject({ status: 'accepted', by: 'customer' });
    const quick = await placeOrderCore(db, request({ deliveryMethodId: 'quick-order' }), null);
    expect(quick.deliveryKind).toBeUndefined();
  });

  test('«Технические работы» in «Витрина»: no order, no stock taken (UX audit 03.10, finding 21)', async () => {
    await db.doc('settings/storefront').set({ isStoreOnline: false }, { merge: true });
    await expectOrderError(placeOrderCore(db, request(), 'alice'), 'failed-precondition');
    expect((await db.collection('orders').get()).size).toBe(0);
    await db.doc('settings/storefront').set({ isStoreOnline: true }, { merge: true });
    expect((await placeOrderCore(db, request(), 'alice')).id).toMatch(/^WS-/);
  });

  test('the delivery time is the method\'s own; a 1-click order has none (UX audit 03.10, stage 1)', async () => {
    const order = await placeOrderCore(db, request(), 'alice');
    expect(order.estimatedDelivery).toBe('1-2 дня');
    const quick = await placeOrderCore(db, request({ deliveryMethodId: 'quick-order' }), null);
    expect(quick.estimatedDelivery).toBeUndefined();
  });

  test('normalizes the promo code and drops unknown fields', () => {
    const parsed = parsePlaceOrderRequest({ ...request(), promoCode: ' sale10 ', totalPrice: 1 });
    expect(parsed.promoCode).toBe('SALE10');
    expect('totalPrice' in parsed).toBe(false);
  });

  test('preserves broken pack flag and orderId in parsePlaceOrderRequest', () => {
    const parsed = parsePlaceOrderRequest({
      ...request({ items: [{ productId: 'shirt', color: 'Белый', size: 'M', quantity: 1, broken: true }] }),
      orderId: 'WS-12345678',
    });
    expect(parsed.orderId).toBe('WS-12345678');
    expect(parsed.items[0].broken).toBe(true);
    expect(() => parsePlaceOrderRequest({ ...request(), orderId: 'bad id!' })).toThrow(/номер заказа/);
  });

  test('records promo_uses document and blocks anonymous users on limited promos', async () => {
    await db.doc('promos/LIM1').set({
      id: 'LIM1',
      code: 'LIM1',
      discountPercent: 10,
      discountType: 'percent',
      discountValue: 10,
      active: true,
      usageLimit: 5,
      usedCount: 0,
    });
    await expectOrderError(
      placeOrderCore(db, request({ promoCode: 'LIM1' }), 'anon-uid', new Date(), false),
      'failed-precondition'
    );
    const order = await placeOrderCore(db, request({ promoCode: 'LIM1' }), 'alice', new Date(), true);
    const useSnap = await db.doc(`promo_uses/${order.id}`).get();
    expect(useSnap.exists).toBe(true);
    expect(useSnap.data()?.promoId).toBe('LIM1');
    const promoSnap = await db.doc('promos/LIM1').get();
    expect(promoSnap.data()?.usedCount).toBe(1);
    expect(promoSnap.data()?.lastOrderId).toBe(order.id);
  });

  test('idempotent orderId returns existing order for the same customer without deducting stock twice', async () => {
    const req = { ...request(), orderId: 'WS-99998888' };
    const first = await placeOrderCore(db, req, 'alice');
    const second = await placeOrderCore(db, req, 'alice');
    expect(second.id).toBe(first.id);
    const prodSnap = await db.doc('products/shirt').get();
    const mSku = (prodSnap.data()?.skus ?? []).find((s: { size: string }) => s.size === 'M');
    expect(mSku.stock).toBe(1); // 2 in stock − 1 ordered, once
    const movements = await db.collection('stock_movements').where('orderId', '==', first.id).get();
    expect(movements.size).toBe(1);
  });
});
