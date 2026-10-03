// Tests for firestore.rules. Run with: bun run test:rules
// (starts the Firestore emulator via `firebase emulators:exec`).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  collection,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  increment,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'gunh83975@gmail.com';

let env;

const guest = () => env.unauthenticatedContext().firestore();
const customer = (uid = 'alice') =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const owner = () =>
  env.authenticatedContext('owner', { email: ADMIN_EMAIL, email_verified: true }).firestore();
const extraAdmin = () => env.authenticatedContext('staff', { email: 'staff@example.com', email_verified: true }).firestore();

const product = {
  id: 'p1',
  name: 'Пальто',
  price: 10000,
  inStock: true,
  skus: [{ size: 'M', stock: 3 }],
  reviews: [],
  rating: 5,
  reviewsCount: 0,
};

const promo = { id: 'promo1', code: 'SALE', discountPercent: 10, usedCount: 0, generatedRevenue: 0 };

// The fields completeOrderLocally (App.tsx) writes; the rules accept only these from a customer
const order = (overrides = {}) => ({
  id: 'MS-1',
  createdAt: '2026-09-30T12:00:00.000Z',
  date: '30 сент., 15:00',
  status: 'accepted',
  items: [{ id: 'cart-1', product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 1, selectedSize: 'M' }],
  totalPrice: 10000,
  deliveryAddress: 'Москва, ул. Тверская, 7',
  deliveryMethod: 'Курьер',
  customerName: 'Иван',
  customerPhone: '+79990000000',
  paymentMethod: 'Перевод по номеру',
  paymentStatus: 'pending',
  deliveryFee: 0,
  estimatedDelivery: 'Через 1-2 дня',
  historySteps: [],
  deliveryStages: [],
  ...overrides,
});

// The journal entry of an order line, as deductOrderLineStock (firebaseSync.ts) writes it
const movement = (overrides = {}) => ({
  id: 'WS-10_0',
  createdAt: '2026-09-30T12:00:00.000Z',
  date: '30 сент., 15:00',
  type: 'order',
  orderId: 'WS-10',
  lineIndex: 0,
  skuIndex: 0,
  productId: 'p1',
  productTitle: 'Пальто',
  skuCode: 'WS-P1-M',
  color: '',
  size: 'M',
  changeQuantity: -2,
  reason: 'Заказ #WS-10',
  operator: 'Покупатель',
  ...overrides,
});

// Order WS-10: 2 × p1 size M (the product has 3 in stock)
const lineOrder = order({
  id: 'WS-10',
  items: [{ id: 'cart-1', product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 2, selectedSize: 'M' }],
});

// A browser's write-off of one order line: the journal entry and the product's variant in one batch
function takeStock(db, { skus, inStock = true, entry = {}, productId = 'p1', productFields = {} }) {
  const m = movement(entry);
  const batch = writeBatch(db);
  batch.set(doc(db, 'stock_movements', m.id), m);
  batch.update(doc(db, 'products', productId), { skus, inStock, lastStockMovement: m.id, ...productFields });
  return batch.commit();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-manstyle',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/p1'), product);
    await setDoc(doc(db, 'promos/promo1'), promo);
    await setDoc(doc(db, 'orders/MS-alice'), order({ id: 'MS-alice', customerUid: 'alice' }));
    await setDoc(doc(db, 'orders/MS-bob'), order({ id: 'MS-bob', customerUid: 'bob' }));
    await setDoc(doc(db, 'orders/WS-10'), lineOrder);
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', name: 'Alice' });
    await setDoc(doc(db, 'admins/staff'), { role: 'admin' });
  });
});

describe('catalog', () => {
  test('anyone can read products', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'products/p1')));
  });

  test('guest cannot change price or create/delete products', async () => {
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { price: 1 }));
    await assertFails(setDoc(doc(guest(), 'products/p2'), { ...product, id: 'p2' }));
    await assertFails(deleteDoc(doc(guest(), 'products/p1')));
  });

  test('customer can deduct stock but not rewrite reviews or rating inside the product', async () => {
    await assertSucceeds(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }] }));
    await assertFails(
      updateDoc(doc(customer(), 'products/p1'), { reviews: [{ rating: 4 }], rating: 4, reviewsCount: 1 })
    );
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { reviews: [{ rating: 1 }] }));
  });

  test('stock changes only through a journal entry of a saved order line (audit 02.10, finding 1)', async () => {
    // directly, without an order line — no matter the value
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { skus: [{ size: 'M', stock: 1 }], inStock: true }));
    await assertFails(updateDoc(doc(guest(), 'products/p1'), {
      skus: [{ size: 'M', stock: 1 }], inStock: true, lastStockMovement: 'WS-10_0',
    }));
    // not by more than the entry says, not up, not below zero
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 0 }] }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 9999 }], entry: { changeQuantity: 9996 } }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: -1 }], entry: { changeQuantity: -4 } }));
    // once per line: the entry exists after the first write-off
    await assertSucceeds(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }] }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 0 }], entry: { changeQuantity: -1 } }));
  });

  test('a customer cannot rename variants, change codes, add or remove variants or put a product back on sale', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'products/p1'), {
      ...product, skus: [{ size: 'M', stock: 2, skuCode: 'WS-P1-M', barcode: '4600000000001' }, { size: 'L', stock: 4 }],
    }));
    const l = { size: 'L', stock: 4 };
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 0, skuCode: 'X', barcode: '4600000000001' }, l] }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 0, skuCode: 'WS-P1-M', barcode: '1' }, l] }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'XXL', stock: 0, skuCode: 'WS-P1-M', barcode: '4600000000001' }, l] }));
    const m0 = { size: 'M', stock: 0, skuCode: 'WS-P1-M', barcode: '4600000000001' };
    await assertFails(takeStock(guest(), { skus: [m0, { size: 'L', stock: 0 }] })); // another variant
    await assertFails(takeStock(guest(), { skus: [m0, l, { size: 'XL', stock: 1 }] }));
    await assertFails(takeStock(guest(), { skus: [m0] }));
    // the ordered size is L, not M: the entry must point at the variant of the order line
    await assertFails(takeStock(guest(), { skus: [{ ...m0, stock: 2 }, { size: 'L', stock: 2 }], entry: { skuIndex: 1, size: 'L' } }));
    // sold out → off sale; still on sale with stock left → no
    await assertFails(takeStock(guest(), { skus: [{ ...m0, stock: 1 }, l], inStock: false, entry: { changeQuantity: -1 } }));
    await assertSucceeds(takeStock(guest(), { skus: [m0, l] }));
  });

  test('a product taken off sale stays off: the customer cannot put it back', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'products/p1'), { ...product, inStock: false }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }], inStock: true }));
    await assertSucceeds(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }], inStock: false }));
    await assertSucceeds(updateDoc(doc(owner(), 'products/p1'), { skus: [{ size: 'M', stock: 5 }], inStock: true }));
  });

  test('stock of a product with many variants is still written off (1000-expression limit)', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `v${i}`, color: `Цвет ${i % 8}`, size: String(i), stock: 5 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'products/p1'), { ...product, skus: many });
      await setDoc(doc(ctx.firestore(), 'orders/WS-11'), order({
        id: 'WS-11',
        items: [{ id: 'c', product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 1, selectedColor: ' Цвет 6 ', selectedSize: '150' }],
      }));
    });
    const lowered = many.map((v, i) => (i === 150 ? { ...v, stock: 4 } : v));
    await assertSucceeds(takeStock(guest(), {
      skus: lowered,
      entry: { id: 'WS-11_0', orderId: 'WS-11', reason: 'Заказ #WS-11', skuIndex: 150, color: 'Цвет 6', size: '150', changeQuantity: -1 },
    }));
  });

  test('admins (owner email or /admins doc) can manage products', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'products/p1'), { price: 9000 }));
    await assertSucceeds(setDoc(doc(extraAdmin(), 'products/p2'), { ...product, id: 'p2' }));
  });

  test('cost price is admin-only: never inside a product, which every visitor reads', async () => {
    await assertFails(getDoc(doc(guest(), 'product_costs/p1')));
    await assertFails(setDoc(doc(customer(), 'product_costs/p1'), { costPrice: 1 }));
    await assertSucceeds(setDoc(doc(owner(), 'product_costs/p1'), { costPrice: 4000 }));
    await assertSucceeds(getDoc(doc(extraAdmin(), 'product_costs/p1')));
    await assertSucceeds(getDocs(collection(owner(), 'product_costs'))); // подписка админки — на всю коллекцию
    await assertFails(getDocs(collection(customer(), 'product_costs')));
    await assertFails(setDoc(doc(owner(), 'products/p3'), { ...product, id: 'p3', costPrice: 4000 }));
    await assertFails(updateDoc(doc(owner(), 'products/p1'), { costPrice: 4000 }));
  });

  test('a cost price left inside a product can only be removed, and stock still deducts meanwhile', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'products/p1'), { ...product, costPrice: 4000 }));
    await assertSucceeds(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }] }));
    await assertSucceeds(updateDoc(doc(owner(), 'products/p1'), { price: 9000 }));
    await assertFails(updateDoc(doc(owner(), 'products/p1'), { costPrice: 1 }));
    await assertSucceeds(updateDoc(doc(owner(), 'products/p1'), { costPrice: deleteField() }));
  });

  test('unverified owner email is not admin', async () => {
    const db = env.authenticatedContext('fake', { email: ADMIN_EMAIL, email_verified: false }).firestore();
    await assertFails(updateDoc(doc(db, 'products/p1'), { price: 1 }));
  });

  test('only admin writes settings and banners', async () => {
    await assertFails(setDoc(doc(customer(), 'settings/storefront'), { storeName: 'x' }));
    await assertFails(setDoc(doc(guest(), 'banners/b1'), { id: 'b1' }));
    await assertSucceeds(setDoc(doc(owner(), 'settings/storefront'), { storeName: 'x' }));
  });

  test('legal documents (settings/legal): anyone reads, only admin edits', async () => {
    const edition = { offer: { text: '## 1. Общие положения', updatedAt: '2026-09-28T00:00:00.000Z' } };
    await assertFails(setDoc(doc(customer(), 'settings/legal'), edition));
    await assertFails(setDoc(doc(guest(), 'settings/legal'), edition));
    await assertSucceeds(setDoc(doc(owner(), 'settings/legal'), edition));
    await assertSucceeds(getDoc(doc(guest(), 'settings/legal')));
  });
});

describe('promos', () => {
  // One more use by a saved order with the code, as recordPromoUsageInFirestore (firebaseSync.ts) writes it
  const usePromo = (db, orderId, { promoId = 'promo1', counters = { usedCount: increment(1) } } = {}) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'promos', promoId), { ...counters, lastOrderId: orderId });
    batch.set(doc(db, 'promo_uses', orderId), { orderId, promoId, createdAt: '2026-10-02T12:00:00.000Z' });
    return batch.commit();
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/WS-P1'), order({ id: 'WS-P1', promoCode: 'sale' }));
      await setDoc(doc(ctx.firestore(), 'orders/WS-P2'), order({ id: 'WS-P2', promoCode: 'SALE' }));
    });
  });

  test('a saved order with the code adds one use, once (audit 02.10, finding 2)', async () => {
    await assertSucceeds(usePromo(guest(), 'WS-P1'));
    await assertFails(usePromo(guest(), 'WS-P1')); // the same order again
    await assertSucceeds(usePromo(guest(), 'WS-P2'));
    await assertSucceeds(getDoc(doc(owner(), 'promo_uses/WS-P1')));
    await assertFails(getDoc(doc(guest(), 'promo_uses/WS-P1')));
  });

  test('no use without an order with this code, no jumps, no revenue or commission from the browser', async () => {
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1 }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1, lastOrderId: 'WS-P1' }));
    await assertFails(usePromo(guest(), 'MS-alice')); // order without a promo code
    await assertFails(usePromo(guest(), 'WS-404')); // no such order
    await assertFails(usePromo(guest(), 'WS-P1', { counters: { usedCount: 5 } }));
    await assertFails(usePromo(guest(), 'WS-P1', { counters: { usedCount: increment(1), generatedRevenue: 500 } }));
    await assertFails(usePromo(guest(), 'WS-P1', { counters: { usedCount: increment(1), commissionEarned: 50 } }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { discountPercent: 99 }));
  });

  test('a code at its usage limit is not used again', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'promos/promo1'), { ...promo, usageLimit: 1 })
    );
    await assertSucceeds(usePromo(guest(), 'WS-P1'));
    await assertFails(usePromo(guest(), 'WS-P2'));
  });
});

describe('orders', () => {
  test('guest can place an order but not read orders', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-2'), order({ id: 'MS-2' })));
    await assertFails(getDoc(doc(guest(), 'orders/MS-alice')));
    await assertFails(getDocs(collection(guest(), 'orders')));
  });

  test('cannot overwrite an existing order or create a pre-shipped one', async () => {
    await assertFails(setDoc(doc(guest(), 'orders/MS-bob'), order({ id: 'MS-bob' })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-3'), order({ id: 'MS-3', status: 'delivered' })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-4'), order({ id: 'MS-4', items: [] })));
    // «Оплачен» ставит только администратор; оплата при получении — не оплата
    await assertFails(setDoc(doc(guest(), 'orders/MS-5'), order({ id: 'MS-5', paymentStatus: 'paid' })));
    await assertFails(setDoc(doc(customer(), 'orders/MS-6'), order({ id: 'MS-6', customerUid: 'alice', paymentStatus: 'paid' })));
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-7'), order({ id: 'MS-7', paymentStatus: 'paid_on_delivery' })));
    // markup in an order number would reach the admin's reports
    const badId = 'MS-<img src=x onerror=alert(1)>';
    await assertFails(setDoc(doc(guest(), 'orders', badId), order({ id: badId })));
  });

  test('an order from the browser has only its own fields, sane texts and at most 30 lines', async () => {
    await assertFails(setDoc(doc(guest(), 'orders/MS-8'), order({ id: 'MS-8', placedVia: 'server' })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-9'), order({ id: 'MS-9', customerName: '' })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-10'), order({ id: 'MS-10', customerName: 'x'.repeat(5000) })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-11'), order({ id: 'MS-11', deliveryFee: -300 })));
    const line = order().items[0];
    await assertFails(setDoc(doc(guest(), 'orders/MS-12'), order({ id: 'MS-12', items: Array(31).fill(line) })));
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-13'), order({ id: 'MS-13', items: Array(30).fill(line) })));
    // the admin creates orders without these limits
    await assertSucceeds(setDoc(doc(owner(), 'orders/MS-14'), { id: 'MS-14', status: 'accepted', items: [] }));
  });

  test('sums of an order from the browser stay in sane bounds (audit 02.10, finding 3)', async () => {
    await assertFails(setDoc(doc(guest(), 'orders/MS-27'), order({ id: 'MS-27', discountAmount: 1e12 })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-28'), order({ id: 'MS-28', totalPrice: 1e12 })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-29'), order({ id: 'MS-29', deliveryFee: 5e6 })));
    // a line as toOrderLineProduct writes it from the browser: photos dropped
    const line = order().items[0];
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-30'), order({ id: 'MS-30', items: [{ ...line, product: {
      ...line.product, originalPrice: 12000, category: 'coats', categoryLabel: 'Пальто', material: 'Шерсть', colors: [], sizes: ['M'], images: [],
    } }] })));
  });

  test('the order keeps Фамилия / Имя / Отчество and the address parts (owner\'s request 02.10)', async () => {
    const parts = { customerLastName: 'Петров', customerFirstName: 'Иван', customerMiddleName: 'Сергеевич' };
    const address = { region: 'Россия', city: 'Москва', street: 'Тверская', house: '7', comment: 'Позвонить за час' };
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-40'), order({ id: 'MS-40', ...parts, deliveryAddressParts: address })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-41'), order({ id: 'MS-41', customerLastName: 'x'.repeat(61) })));
    const tooMany = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'x']));
    await assertFails(setDoc(doc(guest(), 'orders/MS-42'), order({ id: 'MS-42', deliveryAddressParts: tooMany })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-43'), order({ id: 'MS-43', deliveryAddressParts: 'Москва' })));
  });

  test('the order keeps its delivery kind and the first history entry («Доработки 4»)', async () => {
    const log = [{ status: 'accepted', at: '2026-10-02T09:00:00.000Z', by: 'customer' }];
    await assertSucceeds(setDoc(doc(guest(), 'orders/MS-44'), order({ id: 'MS-44', deliveryKind: 'carrier', statusLog: log })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-45'), order({ id: 'MS-45', deliveryKind: 'teleport' })));
    await assertFails(setDoc(doc(guest(), 'orders/MS-46'), order({ id: 'MS-46', statusLog: [...log, { ...log[0], status: 'delivered' }] })));
  });

  test('customer cannot place an order in someone else\'s name', async () => {
    await assertFails(setDoc(doc(customer('alice'), 'orders/MS-5'), order({ id: 'MS-5', customerUid: 'bob' })));
    await assertSucceeds(setDoc(doc(customer('alice'), 'orders/MS-6'), order({ id: 'MS-6', customerUid: 'alice' })));
  });

  test('customer reads only own orders', async () => {
    const db = customer('alice');
    await assertSucceeds(getDocs(query(collection(db, 'orders'), where('customerUid', '==', 'alice'))));
    await assertFails(getDoc(doc(db, 'orders/MS-bob')));
    await assertFails(getDocs(query(collection(db, 'orders'), where('customerUid', '==', 'bob'))));
    await assertFails(getDocs(query(collection(db, 'orders'), where('status', '==', 'accepted'))));
    await assertFails(getDocs(collection(db, 'orders')));
  });

  test('only admin updates or deletes orders', async () => {
    await assertFails(updateDoc(doc(customer('alice'), 'orders/MS-alice'), { status: 'delivered' }));
    await assertSucceeds(updateDoc(doc(owner(), 'orders/MS-alice'), { status: 'delivered' }));
    await assertSucceeds(getDocs(collection(owner(), 'orders')));
    await assertSucceeds(deleteDoc(doc(owner(), 'orders/MS-bob')));
  });
});

describe('stock journal (stock_movements)', () => {
  test('a customer writes the entry of a line of a saved order together with the write-off, once', async () => {
    // an entry that takes stock is written only with the stock itself (audit 02.10, finding 8)
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement()));
    await assertSucceeds(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }] }));
    // no second write over it, no reading, no deleting
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0 })));
    await assertFails(getDoc(doc(guest(), 'stock_movements/WS-10_0')));
    await assertFails(getDocs(collection(customer(), 'stock_movements')));
    await assertFails(deleteDoc(doc(guest(), 'stock_movements/WS-10_0')));
  });

  test('nothing was left: the entry says 0 and is written alone', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0 })));
  });

  test('a customer cannot invent entries: other quantity, product, line, order, type, reason or author', async () => {
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 50 })));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 0 }], entry: { changeQuantity: -3 } })); // more than ordered
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0, operator: 'Администратор' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0, reason: 'Приход' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0, size: 'XL' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ productId: 'p2' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_1'), movement({ id: 'WS-10_1', lineIndex: 1 })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-99_0'), movement({ id: 'WS-99_0', orderId: 'WS-99' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/any'), movement({ id: 'any' })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ type: 'receipt', changeQuantity: 2 })));
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ previousStock: 3, newStock: 1, extra: 1 })));
  });

  test('with server orders on, only placeOrder writes order entries', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'settings/server'), { serverOrdersEnabled: true })
    );
    await assertFails(setDoc(doc(guest(), 'stock_movements/WS-10_0'), movement({ changeQuantity: 0 })));
  });

  test('the admin reads the journal and records warehouse operations', async () => {
    const receipt = movement({ id: 'log-1', type: 'receipt', changeQuantity: 5, previousStock: 3, newStock: 8 });
    delete receipt.orderId;
    delete receipt.lineIndex;
    delete receipt.skuIndex;
    await assertSucceeds(setDoc(doc(owner(), 'stock_movements/log-1'), receipt));
    await assertSucceeds(getDocs(query(collection(extraAdmin(), 'stock_movements'), orderBy('createdAt', 'desc'), limit(500))));
    await assertFails(setDoc(doc(customer(), 'stock_movements/log-2'), { ...receipt, id: 'log-2' }));
  });
});

// «Доработки 3»: the buyer cancels own order WS-20 (2 × p1 size M, written off by the entry WS-20_0; 1 M left)
describe('order cancellation by the buyer', () => {
  const cancelFields = (overrides = {}) => ({
    isCancelled: true,
    cancelledBy: 'customer',
    cancelReason: 'Заказ больше не нужен',
    cancelComment: 'Купил в другом месте',
    cancelledAt: '2026-10-02T18:00:00.000Z',
    estimatedDelivery: 'Заказ отменен',
    stockReturned: false,
    ...overrides,
  });
  const cancel = (db, overrides = {}, id = 'WS-20') => updateDoc(doc(db, 'orders', id), cancelFields(overrides));
  const returnEntry = (overrides = {}) => movement({
    id: 'WS-20_0_return',
    type: 'return',
    orderId: 'WS-20',
    changeQuantity: 2,
    reason: 'Отмена заказа #WS-20',
    ...overrides,
  });
  // returnOrderLineStock (firebaseSync.ts): the return entry and the variant's stock in one write
  function giveBack(db, { skus = [{ size: 'M', stock: 3 }], inStock = true, entry = {} } = {}) {
    const m = returnEntry(entry);
    const batch = writeBatch(db);
    batch.set(doc(db, 'stock_movements', m.id), m);
    batch.update(doc(db, 'products', 'p1'), { skus, inStock, lastStockMovement: m.id });
    return batch.commit();
  }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'products/p1'), { ...product, skus: [{ size: 'M', stock: 1 }] });
      await setDoc(doc(db, 'orders/WS-20'), order({
        id: 'WS-20',
        customerUid: 'alice',
        items: [{ id: 'cart-1', product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 2, selectedSize: 'M' }],
      }));
      await setDoc(doc(db, 'stock_movements/WS-20_0'), movement({ id: 'WS-20_0', orderId: 'WS-20', reason: 'Заказ #WS-20' }));
    });
  });

  test('the buyer cancels own order before packing, with a reason, once', async () => {
    await assertFails(cancel(guest()));
    await assertFails(cancel(customer('bob')));
    await assertFails(cancel(customer('alice'), { cancelReason: '' }));
    await assertFails(cancel(customer('alice'), { cancelReason: 'x'.repeat(101) }));
    await assertFails(cancel(customer('alice'), { cancelComment: 'x'.repeat(501) }));
    await assertFails(cancel(customer('alice'), { cancelledBy: 'admin' }));
    await assertFails(cancel(customer('alice'), { stockReturned: true }));
    // only the cancel fields: not the payment, the sum or the status
    await assertFails(cancel(customer('alice'), { paymentStatus: 'refunded' }));
    await assertFails(cancel(customer('alice'), { totalPrice: 1 }));
    await assertFails(cancel(customer('alice'), { status: 'delivered' }));
    await assertSucceeds(cancel(customer('alice')));
    await assertFails(cancel(customer('alice'), { cancelReason: 'Другая причина' }));
  });

  test('not after packing started, and not again after the store brought the order back', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'orders/WS-20'), { status: 'assembling' }));
    await assertFails(cancel(customer('alice')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'orders/WS-20'), {
      status: 'accepted', isCancelled: false, cancelledBy: 'admin', cancelledAt: '2026-10-01T10:00:00.000Z',
    }));
    await assertFails(cancel(customer('alice')));
  });

  test('the cancelled order returns to stock exactly what its line took, once', async () => {
    // the order is not cancelled yet
    await assertFails(giveBack(customer('alice')));
    await assertSucceeds(cancel(customer('alice')));
    // only together: the entry alone, the stock alone
    await assertFails(setDoc(doc(customer('alice'), 'stock_movements/WS-20_0_return'), returnEntry()));
    await assertFails(updateDoc(doc(customer('alice'), 'products/p1'), {
      skus: [{ size: 'M', stock: 3 }], inStock: true, lastStockMovement: 'WS-20_0_return',
    }));
    // not more than the line took, not someone else's order, not another author or reason
    await assertFails(giveBack(customer('alice'), { skus: [{ size: 'M', stock: 4 }], entry: { changeQuantity: 3 } }));
    await assertFails(giveBack(customer('bob')));
    await assertFails(giveBack(guest()));
    await assertFails(giveBack(customer('alice'), { entry: { operator: 'Администратор' } }));
    await assertFails(giveBack(customer('alice'), { entry: { reason: 'Заказ #WS-20' } }));
    // a line without a write-off entry returns nothing
    await assertFails(giveBack(customer('alice'), { entry: { id: 'WS-20_1_return', lineIndex: 1 } }));
    await assertSucceeds(giveBack(customer('alice')));
    await assertFails(giveBack(customer('alice'), { skus: [{ size: 'M', stock: 5 }] }));
  });

  test('a sold-out product goes back on sale; a product taken off sale stays off', async () => {
    await assertSucceeds(cancel(customer('alice')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'products/p1'), {
      ...product, inStock: false, skus: [{ size: 'M', stock: 0 }],
    }));
    await assertSucceeds(giveBack(customer('alice'), { skus: [{ size: 'M', stock: 2 }], inStock: true }));

    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'stock_movements/WS-20_0_return'));
      await setDoc(doc(ctx.firestore(), 'products/p1'), {
        ...product, inStock: false, skus: [{ size: 'M', stock: 1 }, { size: 'L', stock: 4 }],
      });
    });
    const l = { size: 'L', stock: 4 };
    await assertFails(giveBack(customer('alice'), { skus: [{ size: 'M', stock: 3 }, l], inStock: true }));
    await assertSucceeds(giveBack(customer('alice'), { skus: [{ size: 'M', stock: 3 }, l], inStock: false }));
  });

  test('the buyer reads the entries of own order one by one and marks the return', async () => {
    await assertSucceeds(getDoc(doc(customer('alice'), 'stock_movements/WS-20_0')));
    await assertSucceeds(getDoc(doc(customer('alice'), 'stock_movements/WS-20_0_return'))); // not written yet
    await assertFails(getDoc(doc(customer('bob'), 'stock_movements/WS-20_0')));
    await assertFails(getDoc(doc(guest(), 'stock_movements/WS-20_0')));
    await assertFails(getDocs(query(collection(customer('alice'), 'stock_movements'), where('orderId', '==', 'WS-20'))));
    // «stockReturned» only on own order cancelled by the buyer
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-20'), { stockReturned: true }));
    await assertSucceeds(cancel(customer('alice')));
    await assertFails(updateDoc(doc(customer('bob'), 'orders/WS-20'), { stockReturned: true }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-20'), { stockReturned: true, cancelReason: 'Другое' }));
    await assertSucceeds(updateDoc(doc(customer('alice'), 'orders/WS-20'), { stockReturned: true }));
  });
});

// «Доработки 4»: «Я получил заказ» — свой заказ у транспортной компании становится «Получен»
describe('receipt confirmation by the buyer', () => {
  const log = [
    { status: 'accepted', at: '2026-10-02T09:00:00.000Z', by: 'customer' },
    { status: 'in_transit', at: '2026-10-02T10:00:00.000Z', by: 'admin', byUid: 'owner' },
  ];
  const mine = { status: 'delivered', at: '2026-10-03T08:00:00.000Z', by: 'customer' };
  const confirm = (db, fields = {}) =>
    updateDoc(doc(db, 'orders/WS-30'), { status: 'delivered', statusLog: [...log, mine], ...fields });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'orders/WS-30'), order({
        id: 'WS-30', customerUid: 'alice', deliveryKind: 'carrier', status: 'in_transit', statusLog: log, trackingNumber: '1234',
      }))
    );
  });

  test('the buyer closes own carrier order with one entry of their own', async () => {
    await assertFails(confirm(guest()));
    await assertFails(confirm(customer('bob')));
    // not the payment, not someone else's entry, not a rewritten history
    await assertFails(confirm(customer('alice'), { paymentStatus: 'paid' }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [...log, { ...mine, by: 'admin' }] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [log[0], mine] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [...log, { ...mine, byUid: 'x' }] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'ready', statusLog: [...log, { ...mine, status: 'ready' }] }));
    await assertSucceeds(confirm(customer('alice')));
  });

  test('not before it leaves, not a courier or pickup order, not a cancelled one', async () => {
    const set = (fields) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'orders/WS-30'), fields));
    await set({ status: 'assembling' });
    await assertFails(confirm(customer('alice')));
    await set({ status: 'ready', deliveryKind: 'pickup' });
    await assertFails(confirm(customer('alice')));
    await set({ deliveryKind: 'carrier', isCancelled: true });
    await assertFails(confirm(customer('alice')));
  });
});

const review = (uid, overrides = {}) => ({
  id: `p1_${uid}`,
  productId: 'p1',
  uid,
  authorName: 'Алиса',
  rating: 5,
  comment: 'Отличное пальто',
  date: '26 сентября 2026 г.',
  createdAt: '2026-09-26T10:00:00.000Z',
  ...overrides,
});

describe('reviews', () => {
  test('anyone reads reviews and votes', async () => {
    await assertSucceeds(getDocs(collection(guest(), 'reviews')));
    await assertSucceeds(getDocs(collection(guest(), 'review_votes')));
  });

  test('signed-in customer writes one review per product under their own id', async () => {
    await assertSucceeds(setDoc(doc(customer('alice'), 'reviews/p1_alice'), review('alice')));
    // Someone else's id, uid or a made-up id
    await assertFails(setDoc(doc(customer('alice'), 'reviews/p1_bob'), review('bob')));
    await assertFails(setDoc(doc(customer('alice'), 'reviews/p1_bob'), review('alice', { id: 'p1_bob' })));
    await assertFails(setDoc(doc(customer('alice'), 'reviews/x'), review('alice', { id: 'x' })));
  });

  test('guests, anonymous chat accounts and invalid reviews are rejected', async () => {
    await assertFails(setDoc(doc(guest(), 'reviews/p1_alice'), review('alice')));
    const anon = env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertFails(setDoc(doc(anon, 'reviews/p1_anon-1'), review('anon-1')));
    const db = customer('alice');
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { rating: 6 })));
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { comment: '' })));
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { helpfulCount: 100 })));
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { verifiedPurchase: true })));
    await assertFails(
      setDoc(doc(db, 'reviews/nope_alice'), review('alice', { id: 'nope_alice', productId: 'nope' }))
    );
  });

  test('only the author edits a review; the author or admin deletes it', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reviews/p1_alice'), review('alice')));
    await assertSucceeds(updateDoc(doc(customer('alice'), 'reviews/p1_alice'), { rating: 3, comment: 'Уже не так' }));
    await assertFails(updateDoc(doc(customer('alice'), 'reviews/p1_alice'), { createdAt: '2020-01-01' }));
    await assertFails(updateDoc(doc(customer('bob'), 'reviews/p1_alice'), { rating: 1 }));
    await assertFails(deleteDoc(doc(customer('bob'), 'reviews/p1_alice')));
    await assertFails(updateDoc(doc(owner(), 'reviews/p1_alice'), { comment: 'Исправлено админом' }));
    await assertSucceeds(deleteDoc(doc(owner(), 'reviews/p1_alice')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reviews/p1_alice'), review('alice')));
    await assertSucceeds(deleteDoc(doc(customer('alice'), 'reviews/p1_alice')));
  });

  test('one «Полезно» vote per person, removable only by its owner', async () => {
    const vote = (uid) => ({ reviewId: 'p1_alice', productId: 'p1', uid });
    await assertSucceeds(setDoc(doc(customer('bob'), 'review_votes/p1_alice_bob'), vote('bob')));
    await assertFails(setDoc(doc(customer('bob'), 'review_votes/p1_alice_carol'), vote('carol')));
    await assertFails(setDoc(doc(customer('bob'), 'review_votes/extra'), vote('bob')));
    await assertFails(setDoc(doc(guest(), 'review_votes/p1_alice_guest'), vote('guest')));
    // No updates: a vote is either there or not
    await assertFails(updateDoc(doc(customer('bob'), 'review_votes/p1_alice_bob'), { productId: 'p2' }));
    await assertFails(deleteDoc(doc(customer('carol'), 'review_votes/p1_alice_bob')));
    await assertSucceeds(deleteDoc(doc(customer('bob'), 'review_votes/p1_alice_bob')));
    // Not for one's own review
    await assertFails(setDoc(doc(customer('alice'), 'review_votes/p1_alice_alice'), vote('alice')));
  });
});

describe('server-side orders enabled (settings/server)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'settings/server'), { serverOrdersEnabled: true })
    );
  });

  test('clients can no longer create orders, deduct stock or bump promo counters', async () => {
    await assertFails(setDoc(doc(guest(), 'orders/MS-9'), order({ id: 'MS-9' })));
    await assertFails(setDoc(doc(customer('alice'), 'orders/MS-10'), order({ id: 'MS-10', customerUid: 'alice' })));
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { skus: [{ size: 'M', stock: 0 }], inStock: false }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1 }));
    await assertFails(takeStock(guest(), { skus: [{ size: 'M', stock: 1 }] }));
  });

  test('reviews and admin actions still work', async () => {
    await assertSucceeds(setDoc(doc(customer('alice'), 'reviews/p1_alice'), review('alice')));
    await assertSucceeds(setDoc(doc(owner(), 'orders/MS-11'), order({ id: 'MS-11' })));
  });

  test('only admin resets the statistics (orders stay)', async () => {
    await assertFails(setDoc(doc(customer(), 'settings/analytics'), { resetAt: 1 }));
    await assertFails(setDoc(doc(guest(), 'settings/analytics'), { resetAt: 1 }));
    await assertSucceeds(setDoc(doc(owner(), 'settings/analytics'), { resetAt: Date.now() }));
  });

  test('only admin can toggle the flag', async () => {
    await assertFails(setDoc(doc(customer(), 'settings/server'), { serverOrdersEnabled: false }));
    await assertSucceeds(getDoc(doc(guest(), 'settings/server')));
  });
});

describe('chat', () => {
  const msg = (id, overrides = {}) => ({
    id,
    sender: 'user',
    text: 'Привет',
    isInternalNote: false,
    sentAt: serverTimestamp(),
    ...overrides,
  });
  const minutesAgo = (m) => Timestamp.fromMillis(Date.now() - m * 60 * 1000);

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'chat_messages/a1'), msg('a1', { threadId: 'alice' }));
      await setDoc(doc(db, 'chat_messages/a2'), msg('a2', { threadId: 'alice', sender: 'admin', isInternalNote: true }));
      await setDoc(doc(db, 'chat_messages/b1'), msg('b1', { threadId: 'bob' }));
    });
  });

  test('customer reads only own thread without internal notes', async () => {
    const db = customer('alice');
    const ownThread = query(
      collection(db, 'chat_messages'),
      where('threadId', '==', 'alice'),
      where('isInternalNote', '==', false)
    );
    const snap = await assertSucceeds(getDocs(ownThread));
    if (snap.size !== 1) throw new Error(`expected 1 message, got ${snap.size}`);
    await assertFails(getDoc(doc(db, 'chat_messages/b1')));
    await assertFails(getDoc(doc(db, 'chat_messages/a2')));
    await assertFails(getDocs(query(collection(db, 'chat_messages'), where('threadId', '==', 'alice'))));
    await assertFails(getDocs(collection(db, 'chat_messages')));
  });

  test('unauthenticated visitors cannot read or post', async () => {
    await assertFails(getDocs(collection(guest(), 'chat_messages')));
    await assertFails(setDoc(doc(guest(), 'chat_messages/g1'), msg('g1', { threadId: 'x' })));
  });

  test('anonymous guest can chat in own thread', async () => {
    const anon = env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertSucceeds(setDoc(doc(anon, 'chat_messages/g2'), msg('g2', { threadId: 'anon-1' })));
    await assertSucceeds(getDoc(doc(anon, 'chat_messages/g2')));
  });

  test('customer cannot post into another thread, as admin, or as an internal note', async () => {
    const db = customer('alice');
    await assertSucceeds(setDoc(doc(db, 'chat_messages/m1'), msg('m1', { threadId: 'alice' })));
    // no bot: a customer cannot post automatic «bot» replies into the thread
    await assertFails(setDoc(doc(db, 'chat_messages/m1b'), msg('m1b', { threadId: 'alice', sender: 'bot' })));
    await assertFails(setDoc(doc(db, 'chat_messages/m2'), msg('m2', { threadId: 'bob' })));
    await assertFails(setDoc(doc(db, 'chat_messages/m3'), msg('m3', { threadId: 'alice', sender: 'admin' })));
    await assertFails(
      setDoc(doc(db, 'chat_messages/m4'), msg('m4', { threadId: 'alice', isInternalNote: true }))
    );
    await assertFails(setDoc(doc(db, 'chat_messages/a1'), msg('a1', { threadId: 'alice', text: 'edited' })));
    // a customer cannot forge staff cards or hide own messages from the staff
    await assertFails(
      setDoc(doc(db, 'chat_messages/m6'), msg('m6', { threadId: 'alice', promoCard: { code: 'FAKE', discountType: 'percent', discountValue: 90, description: '' } }))
    );
    await assertFails(setDoc(doc(db, 'chat_messages/m7'), msg('m7', { threadId: 'alice', hiddenForStaff: true })));
    await assertSucceeds(setDoc(doc(db, 'chat_messages/m8'), msg('m8', { threadId: 'alice', imageUrl: 'data:image/png;base64,AA', threadName: 'Алиса', timestamp: '12:00' })));
    // photo only as an uploaded data:image, not a link to someone else's server
    await assertFails(setDoc(doc(db, 'chat_messages/m9'), msg('m9', { threadId: 'alice', imageUrl: 'https://evil.example/pixel.png' })));
    await assertFails(setDoc(doc(db, 'chat_messages/m10'), msg('m10', { threadId: 'alice', imageUrl: 'data:text/html;base64,AA' })));
    await assertFails(setDoc(doc(db, 'chat_messages/m11'), msg('m11', { threadId: 'alice', threadName: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(db, 'chat_messages/m12'), msg('other-id', { threadId: 'alice' })));
  });

  test('customer message takes the server send time; without it the message cannot be changed', async () => {
    const db = customer('alice');
    const { sentAt: _sentAt, ...withoutTime } = msg('t1', { threadId: 'alice' });
    await assertSucceeds(setDoc(doc(db, 'chat_messages/t1'), withoutTime));
    await assertFails(updateDoc(doc(db, 'chat_messages/t1'), { text: 'x', editedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'chat_messages/t1')));
    await assertFails(setDoc(doc(db, 'chat_messages/t2'), msg('t2', { threadId: 'alice', sentAt: minutesAgo(1) })));
  });

  test('customer edits, hides and deletes own message within 15 minutes', async () => {
    const db = customer('alice');
    await assertSucceeds(setDoc(doc(db, 'chat_messages/e1'), msg('e1', { threadId: 'alice' })));
    await assertSucceeds(updateDoc(doc(db, 'chat_messages/e1'), { text: 'Исправлено', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'chat_messages/e1'), { text: 'x', editedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(db, 'chat_messages/e1'), { hiddenForCustomer: true }));
    await assertFails(updateDoc(doc(db, 'chat_messages/e1'), { sender: 'admin' }));
    await assertFails(updateDoc(doc(db, 'chat_messages/e1'), { isInternalNote: true }));
    await assertFails(updateDoc(doc(db, 'chat_messages/e1'), { sentAt: Timestamp.fromMillis(Date.now() + 3600_000) }));
    await assertFails(updateDoc(doc(db, 'chat_messages/e1'), { hiddenForStaff: true }));
    await assertSucceeds(deleteDoc(doc(db, 'chat_messages/e1')));
  });

  test('after 15 minutes, and for other messages, the customer cannot change anything', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, 'chat_messages/old'), msg('old', { threadId: 'alice', sentAt: minutesAgo(16) }));
      await setDoc(doc(admin, 'chat_messages/staff'), msg('staff', { threadId: 'alice', sender: 'admin' }));
      await setDoc(doc(admin, 'chat_messages/bob1'), msg('bob1', { threadId: 'bob' }));
    });
    const db = customer('alice');
    await assertFails(updateDoc(doc(db, 'chat_messages/old'), { text: 'x', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'chat_messages/old'), { hiddenForCustomer: true }));
    await assertFails(deleteDoc(doc(db, 'chat_messages/old')));
    await assertFails(updateDoc(doc(db, 'chat_messages/staff'), { text: 'x', editedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'chat_messages/staff')));
    await assertFails(deleteDoc(doc(db, 'chat_messages/bob1')));
    // staff: any message, any time
    await assertSucceeds(updateDoc(doc(owner(), 'chat_messages/old'), { hiddenForStaff: true }));
    await assertSucceeds(updateDoc(doc(owner(), 'chat_messages/staff'), { text: 'y', editedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(owner(), 'chat_messages/old')));
  });

  test('customer reads only the status of own dialog', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'support_status/alice'), { status: 'resolved', updatedAt: 1 }));
    await assertSucceeds(getDoc(doc(customer('alice'), 'support_status/alice')));
    await assertFails(getDoc(doc(customer('bob'), 'support_status/alice')));
    await assertFails(getDocs(collection(customer('alice'), 'support_status')));
    await assertFails(setDoc(doc(customer('alice'), 'support_status/alice'), { status: 'open', updatedAt: 2 }));
    await assertFails(getDoc(doc(guest(), 'support_status/alice')));
  });

  test('dialog status and priority are admin-only', async () => {
    const meta = { threadId: 'alice', status: 'resolved', priority: 'vip', updatedAt: 1 };
    await assertSucceeds(setDoc(doc(owner(), 'support_threads/alice'), meta));
    await assertSucceeds(getDocs(collection(owner(), 'support_threads')));
    await assertFails(getDoc(doc(customer('alice'), 'support_threads/alice')));
    await assertFails(setDoc(doc(customer('alice'), 'support_threads/alice'), { ...meta, status: 'open' }));
    await assertFails(getDocs(collection(guest(), 'support_threads')));
  });

  test('admin reads all threads and manages messages', async () => {
    await assertSucceeds(getDocs(collection(owner(), 'chat_messages')));
    await assertSucceeds(
      setDoc(doc(owner(), 'chat_messages/m5'), msg('m5', { threadId: 'alice', sender: 'admin', isInternalNote: true }))
    );
    await assertFails(deleteDoc(doc(customer('alice'), 'chat_messages/b1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'chat_messages/a1')));
  });
});

describe('users & admins', () => {
  test('profiles are private to their owner and admins', async () => {
    await assertSucceeds(getDoc(doc(customer('alice'), 'users/alice')));
    await assertFails(getDoc(doc(customer('bob'), 'users/alice')));
    await assertFails(getDocs(collection(customer('alice'), 'users')));
    await assertSucceeds(getDocs(collection(owner(), 'users')));
  });

  test('customer writes only own profile', async () => {
    await assertSucceeds(setDoc(doc(customer('alice'), 'users/alice'), { uid: 'alice', name: 'A' }));
    await assertFails(setDoc(doc(customer('alice'), 'users/bob'), { uid: 'bob', name: 'B' }));
  });

  test('customer cannot grant themselves bonus points or edit manager notes', async () => {
    const db = customer('carol');
    await assertFails(setDoc(doc(db, 'users/carol'), { uid: 'carol', bonusPoints: 99999 }));
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { uid: 'carol', name: 'C' }));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'users/carol'), { bonusPoints: 100 }, { merge: true })
    );
    await assertFails(updateDoc(doc(db, 'users/carol'), { bonusPoints: 99999 }));
    await assertFails(updateDoc(doc(db, 'users/carol'), { managerNotes: 'VIP' }));
    // merge-save of editable fields keeps admin-owned fields untouched
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { name: 'Carol' }, { merge: true }));
    await assertSucceeds(updateDoc(doc(owner(), 'users/carol'), { bonusPoints: 500 }));
  });

  test('manager notes are admin-only', async () => {
    await assertFails(getDoc(doc(customer('alice'), 'customer_notes/alice')));
    await assertFails(setDoc(doc(customer('alice'), 'customer_notes/alice'), { managerNotes: 'x' }));
    await assertSucceeds(setDoc(doc(owner(), 'customer_notes/alice'), { managerNotes: 'x' }));
  });

  test('nobody can grant admin rights from the client', async () => {
    await assertFails(setDoc(doc(customer('alice'), 'admins/alice'), { role: 'admin' }));
    await assertFails(setDoc(doc(owner(), 'admins/alice'), { role: 'admin' }));
  });
});
