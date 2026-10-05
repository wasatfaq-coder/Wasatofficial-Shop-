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

  test('rejects exhausted, inactive and unknown promos', async () => {
    await db.doc('promos/p2').set({
      id: 'p2', code: 'ONCE', title: '', description: '', discountPercent: 50,
      active: true, usedCount: 1, usageLimit: 1,
    });
    await expectOrderError(placeOrderCore(db, request({ promoCode: 'ONCE' }), null), 'failed-precondition', /Лимит/);
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
});
