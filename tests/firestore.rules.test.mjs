// Tests for firestore.rules. Run with: bun run test:rules
// (starts the Firestore emulator via `firebase emulators:exec`).
import assert from 'node:assert/strict';
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
  Bytes,
} from 'firebase/firestore';
// The site's own writes (src/utils/firebaseSync.ts), each with the database of the test's sign-in (`targetDb`):
// audit 07.10, finding 40 — the rules are checked against the code the buyer and the admin run, not a copy of it.
// Built by scripts/firebase-sync-bundle.ts before the test (bun run test:rules)
import {
  applyAdminStockChanges,
  cancelOrderAsCustomer,
  confirmOrderReceipt,
  handOverGuestData,
  returnCancelledOrderStock,
  submitPaymentReceipt,
} from './.generated/firebase-sync.mjs';

const ADMIN_EMAIL = 'gunh83975@gmail.com';

let env;

const guest = () => env.unauthenticatedContext().firestore();
const customer = (uid = 'alice') =>
  env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const owner = () =>
  env.authenticatedContext('owner', { email: ADMIN_EMAIL, email_verified: true }).firestore();
// A guest's anonymous sign-in (the 'guest-chat' app in the browser): orders and promo uses come from it (audit stage 5)
const buyer = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
// An order as placeClientOrder (firebaseSync.ts) writes it: the order with the buyer's uid and the server's time of the
// write (orders-scale-plan, stages 2–3), and its rate mark in one batch
const placeOrder = (db, uid, data, rate = { lastOrderAt: serverTimestamp(), orderId: data.id }) => {
  const batch = writeBatch(db);
  const stamped = 'updatedAt' in data ? data : { ...data, updatedAt: serverTimestamp() };
  batch.set(doc(db, 'orders', data.id), 'customerUid' in data ? stamped : { ...stamped, customerUid: uid });
  batch.set(doc(db, 'order_rate', uid), rate);
  return batch.commit();
};
let guestSeq = 0;
// An order of a new guest (its own anonymous sign-in, so the 30 s limit does not join the checks)
const guestOrder = (data) => {
  const uid = `anon-${++guestSeq}`;
  return placeOrder(buyer(uid), uid, data);
};
const extraAdmin = () => env.authenticatedContext('staff', { email: 'staff@example.com', email_verified: true }).firestore();
// A document as the database holds it now (read as the owner)
const read = async (path) => (await getDoc(doc(owner(), path))).data();

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

// Аудит 07.10, находка 46: способы доставки и пункты выдачи читает оформление любого посетителя, меняет только
// администратор («Доставка и ПВЗ»); коллекции, которых нет в правилах, и проверка соединения test/{id} закрыты для записи
describe('delivery methods and pickup points', () => {
  const method = { id: 'courier', title: 'Курьер', type: 'courier', price: 350, duration: '1–2 дня', isActive: true };
  const point = { id: 'pp1', name: 'Пункт на Тверской', city: 'Москва', address: 'ул. Тверская, 7', isActive: true };
  const readers = () => [['visitor', guest()], ['buyer', customer('alice')], ['guest', buyer('anon-d')]];

  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'delivery_methods/courier'), method);
      await setDoc(doc(ctx.firestore(), 'pickup_points/pp1'), point);
      await setDoc(doc(ctx.firestore(), 'test/connection'), { ok: true });
    })
  );

  test('a visitor, a buyer and a guest read them (the checkout lists them)', async () => {
    for (const [, db] of readers()) {
      await assertSucceeds(getDocs(collection(db, 'delivery_methods')));
      await assertSucceeds(getDoc(doc(db, 'delivery_methods/courier')));
      await assertSucceeds(getDocs(collection(db, 'pickup_points')));
      await assertSucceeds(getDoc(doc(db, 'pickup_points/pp1')));
    }
  });

  test('a visitor, a buyer and a guest do not change them: not the price, not a new one, not a deletion', async () => {
    for (const [, db] of readers()) {
      await assertFails(updateDoc(doc(db, 'delivery_methods/courier'), { price: 0 }));
      await assertFails(setDoc(doc(db, 'delivery_methods/free'), { ...method, id: 'free', price: 0 }));
      await assertFails(deleteDoc(doc(db, 'delivery_methods/courier')));
      await assertFails(updateDoc(doc(db, 'pickup_points/pp1'), { address: 'другой адрес' }));
      await assertFails(setDoc(doc(db, 'pickup_points/pp2'), { ...point, id: 'pp2' }));
      await assertFails(deleteDoc(doc(db, 'pickup_points/pp1')));
    }
  });

  test('the admin (owner email or /admins doc) writes and deletes them', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'delivery_methods/courier'), { price: 400 }));
    await assertSucceeds(setDoc(doc(extraAdmin(), 'delivery_methods/pickup'), { ...method, id: 'pickup', type: 'pickup', price: 0 }));
    await assertSucceeds(setDoc(doc(owner(), 'pickup_points/pp2'), { ...point, id: 'pp2' }));
    await assertSucceeds(deleteDoc(doc(extraAdmin(), 'pickup_points/pp1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'delivery_methods/courier')));
    // an id longer than 128 is not a document of the shop
    await assertFails(setDoc(doc(owner(), `delivery_methods/${'x'.repeat(129)}`), method));
  });

  test('a collection the rules do not know and test/{id} take no writes, not even from the admin', async () => {
    for (const db of [guest(), customer('alice'), buyer('anon-d'), owner()]) {
      await assertFails(setDoc(doc(db, 'unknown_things/x'), { a: 1 }));
      await assertFails(setDoc(doc(db, 'test/connection'), { ok: false }));
      await assertFails(setDoc(doc(db, 'test/other'), { ok: true }));
      await assertFails(deleteDoc(doc(db, 'test/connection')));
    }
    await assertFails(getDoc(doc(guest(), 'unknown_things/x')));
    await assertFails(getDoc(doc(owner(), 'unknown_things/x')));
    // the connection check at the start only reads
    await assertSucceeds(getDoc(doc(guest(), 'test/connection')));
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
      await setDoc(doc(ctx.firestore(), 'orders/WS-P1'), order({ id: 'WS-P1', promoCode: 'sale', customerUid: 'anon-p' }));
      await setDoc(doc(ctx.firestore(), 'orders/WS-P2'), order({ id: 'WS-P2', promoCode: 'SALE', customerUid: 'anon-p' }));
    });
  });

  test('a saved order with the code adds one use, once (audit 02.10, finding 2)', async () => {
    await assertSucceeds(usePromo(buyer('anon-p'), 'WS-P1'));
    await assertFails(usePromo(buyer('anon-p'), 'WS-P1')); // the same order again
    await assertSucceeds(usePromo(buyer('anon-p'), 'WS-P2'));
    await assertSucceeds(getDoc(doc(owner(), 'promo_uses/WS-P1')));
    // only the order's owner burns the code (stage 5): not a visitor without sign-in, not another buyer
    await assertFails(usePromo(guest(), 'WS-P2'));
    await assertFails(usePromo(buyer('anon-x'), 'WS-P2'));
    await assertFails(getDoc(doc(guest(), 'promo_uses/WS-P1')));
  });

  test('no use without an order with this code, no jumps, no revenue or commission from the browser', async () => {
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1 }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1, lastOrderId: 'WS-P1' }));
    await assertFails(usePromo(buyer('anon-p'), 'MS-alice')); // order without a promo code
    await assertFails(usePromo(buyer('anon-p'), 'WS-404')); // no such order
    await assertFails(usePromo(buyer('anon-p'), 'WS-P1', { counters: { usedCount: 5 } }));
    await assertFails(usePromo(buyer('anon-p'), 'WS-P1', { counters: { usedCount: increment(1), generatedRevenue: 500 } }));
    await assertFails(usePromo(buyer('anon-p'), 'WS-P1', { counters: { usedCount: increment(1), commissionEarned: 50 } }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { discountPercent: 99 }));
  });

  test('a code at its usage limit is not used again', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'promos/promo1'), { ...promo, usageLimit: 1 })
    );
    await assertSucceeds(usePromo(buyer('anon-p'), 'WS-P1'));
    await assertFails(usePromo(buyer('anon-p'), 'WS-P2'));
  });

  // Owner's decision 08.10 (audit 07.10, finding 9): a code with a limit — only with a Google sign-in. The rule that
  // refuses anonymous sign-ins comes in the second PR of stage 2 (attack E2 in tests/audit-attacks.test.mjs); the
  // Google buyer keeps using it either way
  test('a buyer signed in with Google uses a code with a limit', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'promos/promo1'), { ...promo, usageLimit: 5 });
      await setDoc(doc(ctx.firestore(), 'orders/WS-G1'), order({ id: 'WS-G1', promoCode: 'SALE', customerUid: 'alice' }));
    });
    await assertSucceeds(usePromo(customer('alice'), 'WS-G1'));
  });
});

describe('orders', () => {
  test('guest can place an order but not read orders', async () => {
    await assertSucceeds(guestOrder(order({ id: 'MS-2' })));
    await assertFails(getDoc(doc(guest(), 'orders/MS-alice')));
    await assertFails(getDocs(collection(guest(), 'orders')));
  });

  test('cannot overwrite an existing order or create a pre-shipped one', async () => {
    await assertFails(guestOrder(order({ id: 'MS-bob' })));
    await assertFails(guestOrder(order({ id: 'MS-3', status: 'delivered' })));
    await assertFails(guestOrder(order({ id: 'MS-4', items: [] })));
    // «Оплачен» ставит только администратор; оплата при получении — не оплата
    await assertFails(guestOrder(order({ id: 'MS-5', paymentStatus: 'paid' })));
    await assertFails(placeOrder(customer(), 'alice', order({ id: 'MS-6', customerUid: 'alice', paymentStatus: 'paid' })));
    await assertSucceeds(guestOrder(order({ id: 'MS-7', paymentStatus: 'paid_on_delivery' })));
    // markup in an order number would reach the admin's reports
    const badId = 'MS-<img src=x onerror=alert(1)>';
    await assertFails(guestOrder(order({ id: badId })));
  });

  test('an order from the browser has only its own fields, sane texts and at most 30 lines', async () => {
    await assertFails(guestOrder(order({ id: 'MS-8', placedVia: 'server' })));
    await assertFails(guestOrder(order({ id: 'MS-9', customerName: '' })));
    await assertFails(guestOrder(order({ id: 'MS-10', customerName: 'x'.repeat(5000) })));
    await assertFails(guestOrder(order({ id: 'MS-11', deliveryFee: -300 })));
    const line = order().items[0];
    await assertFails(guestOrder(order({ id: 'MS-12', items: Array(31).fill(line) })));
    await assertSucceeds(guestOrder(order({ id: 'MS-13', items: Array(30).fill(line) })));
    // the admin creates orders without these limits
    await assertSucceeds(setDoc(doc(owner(), 'orders/MS-14'), { id: 'MS-14', status: 'accepted', items: [] }));
  });

  test('sums of an order from the browser stay in sane bounds (audit 02.10, finding 3)', async () => {
    await assertFails(guestOrder(order({ id: 'MS-27', discountAmount: 1e12 })));
    await assertFails(guestOrder(order({ id: 'MS-28', totalPrice: 1e12 })));
    await assertFails(guestOrder(order({ id: 'MS-29', deliveryFee: 5e6 })));
    // a line as toOrderLineProduct writes it from the browser: photos dropped
    const line = order().items[0];
    await assertSucceeds(guestOrder(order({ id: 'MS-30', items: [{ ...line, product: {
      ...line.product, originalPrice: 12000, category: 'coats', categoryLabel: 'Пальто', material: 'Шерсть', colors: [], sizes: ['M'], images: [],
    } }] })));
  });

  test('the order keeps Фамилия / Имя / Отчество and the address parts (owner\'s request 02.10)', async () => {
    const parts = { customerLastName: 'Петров', customerFirstName: 'Иван', customerMiddleName: 'Сергеевич' };
    const address = { region: 'Россия', city: 'Москва', street: 'Тверская', house: '7', comment: 'Позвонить за час' };
    await assertSucceeds(guestOrder(order({ id: 'MS-40', ...parts, deliveryAddressParts: address })));
    await assertFails(guestOrder(order({ id: 'MS-41', customerLastName: 'x'.repeat(61) })));
    const tooMany = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'x']));
    await assertFails(guestOrder(order({ id: 'MS-42', deliveryAddressParts: tooMany })));
    await assertFails(guestOrder(order({ id: 'MS-43', deliveryAddressParts: 'Москва' })));
  });

  test('the order keeps its delivery kind and the first history entry («Доработки 4»)', async () => {
    const log = [{ status: 'accepted', at: '2026-10-02T09:00:00.000Z', by: 'customer' }];
    await assertSucceeds(guestOrder(order({ id: 'MS-44', deliveryKind: 'carrier', statusLog: log })));
    await assertFails(guestOrder(order({ id: 'MS-45', deliveryKind: 'teleport' })));
    await assertFails(guestOrder(order({ id: 'MS-46', statusLog: [...log, { ...log[0], status: 'delivered' }] })));
  });

  test('an order only under a sign-in, with its rate mark, at most once in 30 s (audit stage 5)', async () => {
    // without sign-in, or without the rate mark in the same batch
    await assertFails(setDoc(doc(guest(), 'orders/MS-60'), order({ id: 'MS-60' })));
    await assertFails(setDoc(doc(buyer('anon-a'), 'orders/MS-60'), order({ id: 'MS-60', customerUid: 'anon-a' })));
    // a guest's order without its uid or with another one
    await assertFails(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-60', customerUid: null })));
    await assertFails(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-60', customerUid: 'anon-b' })));
    // the mark of another order, a made-up time, another buyer's mark
    await assertFails(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-60' }), { lastOrderAt: serverTimestamp(), orderId: 'MS-61' }));
    await assertFails(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-60' }), { lastOrderAt: Timestamp.fromMillis(0), orderId: 'MS-60' }));
    await assertFails(placeOrder(buyer('anon-a'), 'anon-b', order({ id: 'MS-60', customerUid: 'anon-a' })));
    await assertSucceeds(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-60' })));
    // the second order of the same sign-in right away — refused; after 30 s — taken
    await assertFails(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-61' })));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'order_rate/anon-a'), { lastOrderAt: Timestamp.fromMillis(Date.now() - 31_000), orderId: 'MS-60' })
    );
    await assertSucceeds(placeOrder(buyer('anon-a'), 'anon-a', order({ id: 'MS-61' })));
    // the mark alone (without a new order) is not moved, someone else's is not read
    await assertFails(setDoc(doc(buyer('anon-b'), 'order_rate/anon-b'), { lastOrderAt: serverTimestamp(), orderId: 'MS-62' }));
    await assertSucceeds(getDoc(doc(buyer('anon-a'), 'order_rate/anon-a')));
    await assertFails(getDoc(doc(buyer('anon-b'), 'order_rate/anon-a')));
  });

  // Находка 22: заказ ровно в том виде, в каком его собирает сайт (buildClientOrder → scripts/client-order-sample.ts).
  // Новое поле заказа без правки isClientOrderShape делает этот тест красным, а не отклоняет заказы на живом сайте
  test('the order exactly as the site builds it is accepted (all optional fields, and a 1-click order)', async () => {
    const samples = JSON.parse(readFileSync('tests/.generated/client-orders.json', 'utf8'));
    for (const [name, sample] of Object.entries(samples)) {
      const uid = `sample-${name}`;
      await assertSucceeds(placeOrder(buyer(uid), uid, { ...sample, customerUid: uid }));
    }
  });

  // docs/orders-scale-plan.md, этапы 2–3: каждая запись заказа ставит время сервера, админка читает только изменённые
  // заказы. Без отметки или со своим временем запись отклоняется
  test('an order from the browser carries the server\'s time of the write, never one of its own', async () => {
    await assertSucceeds(guestOrder(order({ id: 'WS-STAMP-1', updatedAt: serverTimestamp() })));
    const db = buyer('anon-unstamped');
    const batch = writeBatch(db);
    batch.set(doc(db, 'orders/WS-STAMP-0'), { ...order({ id: 'WS-STAMP-0' }), customerUid: 'anon-unstamped' });
    batch.set(doc(db, 'order_rate/anon-unstamped'), { lastOrderAt: serverTimestamp(), orderId: 'WS-STAMP-0' });
    await assertFails(batch.commit());
    await assertFails(guestOrder(order({ id: 'WS-STAMP-2', updatedAt: Timestamp.fromMillis(Date.now() + 86_400_000) })));
    await assertFails(guestOrder(order({ id: 'WS-STAMP-3', updatedAt: Timestamp.fromMillis(0) })));
    await assertFails(guestOrder(order({ id: 'WS-STAMP-4', updatedAt: 'вчера' })));
  });

  test('customer cannot place an order in someone else\'s name', async () => {
    await assertFails(placeOrder(customer('alice'), 'alice', order({ id: 'MS-5', customerUid: 'bob' })));
    await assertSucceeds(placeOrder(customer('alice'), 'alice', order({ id: 'MS-6', customerUid: 'alice' })));
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

// Аудит 07.10, находка 41: склад админки кодом сайта (applyAdminStockChanges — «Склад и SKU», правка состава заказа,
// восстановление и отмена восстановленного): транзакция на вариант против остатка в базе, с записью журнала в ней же
describe('admin stock changes (applyAdminStockChanges)', () => {
  const at = new Date('2026-10-07T10:00:00.000Z');
  const shirt = {
    id: 'p5',
    title: 'Рубашка',
    price: 3000,
    inStock: true,
    colors: [{ name: 'Белый', hex: '#FFFFFF' }, { name: 'Синий', hex: '#2C4A6B' }],
    sizes: ['M', 'L'],
    // «Синий» has no saved variants yet (a colour from an old CSV import)
    skus: [
      { id: 'p5-Белый-M', color: 'Белый', size: 'M', stock: 2, skuCode: 'WS-P5-W-M' },
      { id: 'p5-Белый-L', color: 'Белый', size: 'L', stock: 0, skuCode: 'WS-P5-W-L' },
    ],
  };
  const setShirt = (fields = {}) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'products/p5'), { ...shirt, ...fields }));
  const change = (fields) => ({ productId: 'p5', productTitle: 'Рубашка', color: 'Белый', size: 'M', delta: 0, ...fields });
  const stockOf = async (color, size) =>
    (await read('products/p5')).skus.find((s) => s.color === color && s.size === size)?.stock;
  const journal = async () =>
    (await getDocs(query(collection(owner(), 'stock_movements'), where('productId', '==', 'p5')))).docs.map((d) => d.data());

  beforeEach(() => setShirt());

  test('a receipt adds the difference to the stock in the database and writes the journal', async () => {
    // the admin saw 2 and adds 5; a buyer took 1 meanwhile — that sale stays sold
    await setShirt({ skus: [{ ...shirt.skus[0], stock: 1 }, shirt.skus[1]] });
    const { failed } = await applyAdminStockChanges([change({ delta: 5 })], { reason: 'Приход', operator: 'Администратор', at }, owner());
    assert.deepEqual(failed, []);
    assert.equal(await stockOf('Белый', 'M'), 6);
    const [entry] = await journal();
    assert.equal(entry.type, 'receipt');
    assert.equal(entry.orderId, undefined);
    assert.deepEqual(
      [entry.changeQuantity, entry.previousStock, entry.newStock, entry.reason, entry.operator, entry.skuCode, entry.createdAt],
      [5, 1, 6, 'Приход', 'Администратор', 'WS-P5-W-M', at.toISOString()]
    );
  });

  test('a write-off stops at 0, the product is sold out; by an order the entry is «order» with its number', async () => {
    const { failed } = await applyAdminStockChanges(
      [change({ delta: -5 })],
      { orderId: 'WS-70', reason: 'Правка состава #WS-70', operator: 'Администратор', at },
      owner()
    );
    assert.deepEqual(failed, []);
    assert.equal(await stockOf('Белый', 'M'), 0);
    assert.equal((await read('products/p5')).inStock, false);
    const [entry] = await journal();
    assert.deepEqual([entry.type, entry.orderId, entry.changeQuantity, entry.newStock], ['order', 'WS-70', -2, 0]);
    // nothing left to take: no second entry
    await applyAdminStockChanges([change({ delta: -1 })], { reason: 'Списание', operator: 'Администратор', at }, owner());
    assert.equal((await journal()).length, 1);
  });

  test('an inventory count sets the exact stock (setTo) with the reason of its variant', async () => {
    const { failed } = await applyAdminStockChanges(
      [change({ delta: 7, setTo: 9, reason: 'Инвентаризация склада (Оприходование излишка)' }), change({ size: 'L', setTo: 0 })],
      { reason: 'Инвентаризация склада', operator: 'Инспектор склада', at },
      owner()
    );
    assert.deepEqual(failed, []);
    assert.equal(await stockOf('Белый', 'M'), 9);
    assert.equal(await stockOf('Белый', 'L'), 0);
    // the count equal to the stock changes nothing and writes nothing
    const entries = await journal();
    assert.equal(entries.length, 1);
    assert.deepEqual(
      [entries[0].reason, entries[0].operator, entries[0].previousStock, entries[0].newStock],
      ['Инвентаризация склада (Оприходование излишка)', 'Инспектор склада', 2, 9]
    );
  });

  test('a colour × size of the product without a saved variant gets one; a variant not of the product fails', async () => {
    const { failed } = await applyAdminStockChanges(
      [change({ color: 'Синий', size: 'L', delta: 4 }), change({ color: 'Красный', delta: 1 }), change({ productId: 'gone', delta: 1 })],
      { reason: 'Приход', operator: 'Администратор', at },
      owner()
    );
    assert.deepEqual(failed.map((f) => `${f.productId} ${f.color}`), ['p5 Красный', 'gone Белый']);
    const { skus } = await read('products/p5');
    assert.equal(skus.length, 3);
    assert.deepEqual((({ color, size, stock }) => ({ color, size, stock }))(skus[2]), { color: 'Синий', size: 'L', stock: 4 });
    assert.deepEqual(skus.slice(0, 2), shirt.skus);
    assert.equal((await journal()).length, 1);
  });

  test('a product taken off sale stays off after a receipt; a sold-out one goes back on sale', async () => {
    await setShirt({ hiddenFromSale: true, inStock: false });
    await applyAdminStockChanges([change({ delta: 3 })], { reason: 'Приход', operator: 'Администратор', at }, owner());
    assert.equal(await stockOf('Белый', 'M'), 5);
    assert.equal((await read('products/p5')).inStock, false);
    // an older product: «Снят с витрины» was inStock == false with stock left
    await setShirt({ inStock: false });
    await applyAdminStockChanges([change({ delta: 1 })], { reason: 'Приход', operator: 'Администратор', at }, owner());
    assert.equal((await read('products/p5')).inStock, false);
    // sold out, not taken off sale: on sale again
    await setShirt({ inStock: false, skus: shirt.skus.map((s) => ({ ...s, stock: 0 })) });
    await applyAdminStockChanges([change({ delta: 2 })], { reason: 'Приход', operator: 'Администратор', at }, owner());
    assert.equal((await read('products/p5')).inStock, true);
  });

  test('a buyer running the admin\'s code changes nothing', async () => {
    const { failed } = await applyAdminStockChanges([change({ delta: 5 })], { reason: 'Приход', operator: 'Администратор', at }, customer());
    assert.equal(failed.length, 1);
    assert.equal(await stockOf('Белый', 'M'), 2);
  });

  // Аудит 07.10, находка 2: после «Правки состава» номера строк не совпадают с записями `{заказ}_{строка}` — возврат
  // по сумме журнала заказа по вариантам, удалённый вариант ничего не получает, повтор ничего не возвращает
  test('a cancelled order after «Правка состава» returns what its journal holds, by variant, once', async () => {
    const entry = (id, fields) =>
      env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), 'stock_movements', id), {
          id, productId: 'p5', productTitle: 'Рубашка', color: 'Белый', size: 'M', type: 'order', orderId: 'WS-71',
          reason: 'Заказ #WS-71', operator: 'Покупатель', createdAt: at.toISOString(), ...fields,
        })
      );
    // ordered 2 × M (line 0) and 1 × L (line 1); the admin took one M back, then removed the line L and the size L
    await entry('WS-71_0', { changeQuantity: -2, previousStock: 4, newStock: 2 });
    await entry('WS-71_1', { size: 'L', changeQuantity: -1, previousStock: 1, newStock: 0 });
    await entry('adj-1', { changeQuantity: 1, previousStock: 2, newStock: 3, reason: 'Правка состава #WS-71', operator: 'Администратор' });
    await setShirt({ sizes: ['M'], skus: [{ ...shirt.skus[0], stock: 3 }] });
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'orders/WS-71'), { id: 'WS-71', customerUid: 'alice', isCancelled: true, isAdjusted: true })
    );
    const items = [{ product: { id: 'p5', title: 'Рубашка' }, selectedColor: 'Белый', selectedSize: 'M', quantity: 1 }];
    const order = { id: 'WS-71', items, isAdjusted: true };

    // the buyer's browser leaves it to the admin
    assert.equal(await returnCancelledOrderStock(order, {}, customer('alice')), false);
    assert.equal(
      await returnCancelledOrderStock(order, { operator: 'Администратор', missingIsNothing: true }, owner()),
      true
    );
    assert.equal(await stockOf('Белый', 'M'), 4);
    assert.equal((await read('products/p5')).skus.length, 1);
    assert.equal((await read('orders/WS-71')).stockReturned, true);
    await returnCancelledOrderStock(order, { operator: 'Администратор', missingIsNothing: true }, owner());
    assert.equal(await stockOf('Белый', 'M'), 4);
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
    updatedAt: serverTimestamp(),
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

  test('the cancellation stamps the server\'s time of the write (orders-scale-plan, stages 2–3)', async () => {
    const { updatedAt: _stamp, ...unstamped } = cancelFields();
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-20'), unstamped));
    await assertFails(cancel(customer('alice'), { updatedAt: Timestamp.fromMillis(Date.now() + 86_400_000) }));
    await assertSucceeds(cancel(customer('alice'), { updatedAt: serverTimestamp() }));
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
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-20'), { stockReturned: true, updatedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(customer('alice'), 'orders/WS-20'), { stockReturned: true, updatedAt: serverTimestamp() }));
  });

  // Аудит 07.10, находка 40: тот же путь кодом сайта (useCustomerOrders → firebaseSync.ts), а не копией записей
  test('the site\'s own code cancels the order and returns exactly what the line took, once (finding 40, 07.10)', async () => {
    const at = new Date('2026-10-02T18:00:00.000Z');
    await assertFails(cancelOrderAsCustomer('WS-20', 'Заказ больше не нужен', '', at, customer('bob')));
    await assertSucceeds(cancelOrderAsCustomer('WS-20', 'Заказ больше не нужен', 'Купил в другом месте', at, customer('alice')));
    const cancelled = await read('orders/WS-20');
    assert.equal(cancelled.isCancelled, true);
    assert.equal(cancelled.cancelledBy, 'customer');
    assert.equal(cancelled.cancelComment, 'Купил в другом месте');
    assert.equal(cancelled.stockReturned, false);

    // someone else cannot return the goods of this order
    await assertFails(returnCancelledOrderStock({ id: 'WS-20', items: cancelled.items }, {}, customer('bob')));
    assert.equal(await returnCancelledOrderStock({ id: 'WS-20', items: cancelled.items }, {}, customer('alice')), true);
    assert.equal((await read('products/p1')).skus[0].stock, 3);
    assert.equal((await read('products/p1')).lastStockMovement, 'WS-20_0_return');
    assert.deepEqual(
      (({ type, orderId, lineIndex, productId, changeQuantity, reason, operator }) => ({ type, orderId, lineIndex, productId, changeQuantity, reason, operator }))(
        await read('stock_movements/WS-20_0_return')
      ),
      { type: 'return', orderId: 'WS-20', lineIndex: 0, productId: 'p1', changeQuantity: 2, reason: 'Отмена заказа #WS-20', operator: 'Покупатель' }
    );
    assert.equal((await read('orders/WS-20')).stockReturned, true);

    // the second tab (or a retry at the next visit) returns nothing twice
    assert.equal(await returnCancelledOrderStock({ id: 'WS-20', items: cancelled.items }, {}, customer('alice')), true);
    assert.equal((await read('products/p1')).skus[0].stock, 3);
  });

  test('a line without a write-off entry: the buyer\'s code leaves the order «not returned» (finding 40, 07.10)', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'stock_movements/WS-20_0')));
    await assertSucceeds(cancelOrderAsCustomer('WS-20', 'Заказ больше не нужен', '', new Date(), customer('alice')));
    const { items } = await read('orders/WS-20');
    // nothing was taken, so nothing comes back; the admin decides in «Заказы» («Вернуть на склад»)
    assert.equal(await returnCancelledOrderStock({ id: 'WS-20', items }, {}, customer('alice')), false);
    assert.equal((await read('products/p1')).skus[0].stock, 1);
    assert.equal((await read('orders/WS-20')).stockReturned, false);
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
    updateDoc(doc(db, 'orders/WS-30'), { status: 'delivered', statusLog: [...log, mine], updatedAt: serverTimestamp(), ...fields });

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

  test('«Я получил заказ» stamps only the server\'s time of the write (orders-scale-plan, stage 2)', async () => {
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [...log, mine] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [...log, mine], updatedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(customer('alice'), 'orders/WS-30'), { status: 'delivered', statusLog: [...log, mine], updatedAt: serverTimestamp() }));
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

  test('the site\'s own code: «Я получил заказ» (finding 40, 07.10)', async () => {
    const at = new Date('2026-10-03T08:00:00.000Z');
    await assertFails(confirmOrderReceipt({ id: 'WS-30', statusLog: log }, at, customer('bob')));
    await assertSucceeds(confirmOrderReceipt({ id: 'WS-30', statusLog: log }, at, customer('alice')));
    const saved = await read('orders/WS-30');
    assert.equal(saved.status, 'delivered');
    assert.deepEqual(saved.statusLog, [...log, { status: 'delivered', at: at.toISOString(), by: 'customer' }]);
    assert.equal(saved.paymentStatus, 'pending');
  });
});

describe('payment receipt from the buyer', () => {
  const details = { sbp: { phone: '79991234567', bank: 'Т-Банк', holder: 'Иванов Иван Иванович' } };
  const at = '2026-10-03T08:00:00.000Z';
  const receipt = { method: 'sbp', at, messageId: 'msg-receipt-WS-40' };
  const entry = { event: 'receipt', at, by: 'customer' };
  const submit = (db, fields = {}) =>
    updateDoc(doc(db, 'orders/WS-40'), { paymentStatus: 'receipt_review', paymentReceipt: receipt, paymentLog: [entry], updatedAt: serverTimestamp(), ...fields });
  const message = (uid, fields = {}) => ({
    id: 'msg-receipt-WS-40', sender: 'user', text: 'Клиент прикрепил подтверждение оплаты к заказу № WS-40',
    imageId: 'msg-receipt-WS-40', threadId: uid, isInternalNote: false, receiptOrderId: 'WS-40', ...fields,
  });
  const sendReceipt = (db, uid) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chat_images/msg-receipt-WS-40'), { data: 'data:image/jpeg;base64,AAAA' });
    batch.set(doc(db, 'chat_messages/msg-receipt-WS-40'), message(uid));
    return batch.commit();
  };
  const set = (fields) => env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'orders/WS-40'), fields));

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/WS-40'), order({ id: 'WS-40', customerUid: 'alice', paymentDetails: details }));
      await deleteDoc(doc(ctx.firestore(), 'chat_messages/msg-receipt-WS-40'));
    });
  });

  test('the buyer sends a receipt photo to the chat and the order waits for the check', async () => {
    // the message comes from the buyer's own chat with the receipt field
    await assertSucceeds(sendReceipt(customer('alice'), 'alice'));
    await assertFails(submit(guest()));
    await assertFails(submit(customer('bob')));
    // never «Оплачен», no other fields, only a filled way, one own entry
    await assertFails(submit(customer('alice'), { paymentStatus: 'paid' }));
    await assertFails(submit(customer('alice'), { totalPrice: 1 }));
    await assertFails(submit(customer('alice'), { paymentReceipt: { ...receipt, method: 'card' } }));
    await assertFails(submit(customer('alice'), { paymentLog: [{ ...entry, by: 'admin' }] }));
    await assertFails(submit(customer('alice'), { paymentLog: [{ ...entry, event: 'confirmed' }] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-40'), { paymentStatus: 'receipt_review', paymentReceipt: receipt, paymentLog: [entry] }));
    await assertFails(submit(customer('alice'), { updatedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(submit(customer('alice'), { updatedAt: serverTimestamp() }));
  });

  test('not without the photo message, not someone else\'s message, not twice, not without requisites', async () => {
    await assertFails(submit(customer('alice')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'chat_messages/msg-receipt-WS-40'), message('bob')));
    await assertFails(submit(customer('alice')));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'chat_messages/msg-receipt-WS-40'), message('alice', { receiptOrderId: 'WS-41' }))
    );
    await assertFails(submit(customer('alice')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'chat_messages/msg-receipt-WS-40'), message('alice')));
    await set({ paymentStatus: 'receipt_review' });
    await assertFails(submit(customer('alice')));
    await set({ paymentStatus: 'pending', paymentDetails: deleteField() });
    await assertFails(submit(customer('alice')));
    await set({ paymentDetails: details, isCancelled: true });
    await assertFails(submit(customer('alice')));
  });

  test('the site\'s own code sends the receipt photo to the chat and the order waits for the check (finding 40, 07.10)', async () => {
    const at = new Date('2026-10-03T08:00:00.000Z');
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    const message = await submitPaymentReceipt({ id: 'WS-40' }, 'sbp', photo, { threadId: 'alice', threadName: 'Алиса' }, at, customer('alice'));
    assert.equal(message.receiptOrderId, 'WS-40');
    const stored = await read(`chat_messages/${message.id}`);
    assert.equal(stored.threadId, 'alice');
    assert.equal(stored.imageId, message.id);
    assert.equal(stored.imageUrl, undefined); // the photo is a document of its own (stage 6, finding 20)
    assert.equal((await read(`chat_images/${message.id}`)).data, photo);
    const saved = await read('orders/WS-40');
    assert.equal(saved.paymentStatus, 'receipt_review');
    assert.deepEqual(saved.paymentReceipt, { method: 'sbp', at: at.toISOString(), messageId: message.id });
    assert.deepEqual(saved.paymentLog, [{ event: 'receipt', at: at.toISOString(), by: 'customer' }]);
    // a second receipt for an order already waiting for the check is refused
    await assertFails(submitPaymentReceipt(saved, 'sbp', photo, { threadId: 'alice' }, new Date(at.getTime() + 60_000), customer('alice')));
  });

  test('the site\'s own code: not someone else\'s order (finding 40, 07.10)', async () => {
    // bob's photo reaches his own chat, but the order of alice does not take it
    await assertFails(submitPaymentReceipt({ id: 'WS-40' }, 'sbp', 'data:image/jpeg;base64,AAAA', { threadId: 'bob' }, new Date(), customer('bob')));
    assert.equal((await read('orders/WS-40')).paymentStatus, 'pending');
  });

  test('templates of requisites — only the admin', async () => {
    const template = { id: 't1', name: 'Т-Банк СБП', kind: 'sbp', fields: details.sbp };
    await assertFails(getDocs(collection(customer('alice'), 'payment_templates')));
    await assertFails(setDoc(doc(customer('alice'), 'payment_templates/t1'), template));
    await assertSucceeds(setDoc(doc(owner(), 'payment_templates/t1'), template));
    await assertSucceeds(getDocs(collection(owner(), 'payment_templates')));
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

  test('the author does not pose as the store (finding 31)', async () => {
    const db = customer('alice');
    for (const authorName of ['Wasat Shop (официально)', 'АДМИНИСТРАТОР', 'Служба поддержки', 'admin']) {
      await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName })));
    }
    await assertSucceeds(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName: 'Администратова Анна' })));
  });

  // Owner's decision 08.10 (audit 07.10, finding 10): the name is compared after normalization — no invisible marks,
  // Latin lookalikes read as Cyrillic — and with the store name from «Витрина» («Wasat Shop» without it)
  test('lookalike letters, invisible marks and the store name do not pass; a name of two alphabets does', async () => {
    const db = customer('alice');
    for (const authorName of [
      'Wasat Shop', 'Wаsаt Shор', 'Wasat​Shop', 'W a s a t-Shop', 'Аdmin', 'ADMlN',
      'Адми​нистратор', 'Адми­нистратор', 'Служба поддeржки', 'Оfficial',
    ]) {
      await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName })));
    }
    for (const authorName of ['Ivan Петров', 'Alice', 'Ада Минт', 'Badminton fan']) {
      await assertSucceeds(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName })));
    }
    // the store renamed in «Витрина»: its name in any case, with «ё» or Latin lookalikes
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'settings/storefront'), { storeName: 'Лён и Ко' }));
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName: 'ЛЕН И КО' })));
    await assertFails(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName: 'Лен и Ko' })));
    await assertSucceeds(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName: 'Wasat Shop' })));
    await assertSucceeds(setDoc(doc(db, 'reviews/p1_alice'), review('alice', { authorName: 'Алёна' })));
  });

  test('«Полезно» only to an existing review (finding 16)', async () => {
    await assertFails(setDoc(doc(customer('bob'), 'review_votes/p1_alice_bob'), { reviewId: 'p1_alice', productId: 'p1', uid: 'bob' }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reviews/p1_alice'), review('alice')));
    await assertSucceeds(setDoc(doc(customer('bob'), 'review_votes/p1_alice_bob'), { reviewId: 'p1_alice', productId: 'p1', uid: 'bob' }));
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
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'reviews/p1_alice'), review('alice')));
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
    await assertFails(guestOrder(order({ id: 'MS-9' })));
    await assertFails(placeOrder(customer('alice'), 'alice', order({ id: 'MS-10', customerUid: 'alice' })));
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
    await assertSucceeds(setDoc(doc(db, 'chat_messages/m8'), msg('m8', { threadId: 'alice', threadName: 'Алиса', timestamp: '12:00' })));
    // the thread's name does not pose as the store either (audit 07.10, finding 10)
    await assertFails(setDoc(doc(db, 'chat_messages/m8b'), msg('m8b', { threadId: 'alice', threadName: 'Wasat​Shop' })));
    await assertFails(setDoc(doc(db, 'chat_messages/m8c'), msg('m8c', { threadId: 'alice', threadName: 'Аdmin' })));
    await assertSucceeds(setDoc(doc(db, 'chat_messages/m8d'), msg('m8d', { threadId: 'alice', threadName: 'Ivan Петров' })));
    // a photo goes only as its own document chat_images (check 04.10, finding 4), never inside the message
    await assertFails(setDoc(doc(db, 'chat_messages/m13'), msg('m13', { threadId: 'alice', imageUrl: 'data:image/png;base64,AA' })));
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

  test('profile: only its own fields of sane size and the Google account\'s email (findings 25, 23)', async () => {
    const db = customer('dave');
    await assertFails(setDoc(doc(db, 'users/dave'), { uid: 'dave', name: 'x', role: 'admin' }));
    await assertFails(setDoc(doc(db, 'users/dave'), { uid: 'dave', name: 'z'.repeat(900) }));
    await assertFails(setDoc(doc(db, 'users/dave'), { uid: 'dave', email: 'victim@example.com' }));
    await assertSucceeds(setDoc(doc(db, 'users/dave'), {
      uid: 'dave', name: 'Дэйв', email: 'dave@example.com', phone: '+79990000000', avatar: 'https://lh3.googleusercontent.com/a/x',
      address: { street: '', city: '', postalCode: '' }, savedAddresses: [], notificationsEnabled: true,
      bodyMeasurements: { height: 180 }, updatedAt: '2026-10-03T08:00:00.000Z',
    }));
    // an old profile with a field the site no longer writes still saves the editable ones
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/dave'), { legacyField: 1 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'users/dave'), { name: 'Дэйв Смит' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'users/dave'), { email: 'victim@example.com' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'users/dave'), { savedAddresses: Array.from({ length: 11 }, (_, i) => ({ id: String(i) })) }, { merge: true }));
  });

  // The site writes only the Google account's photo or '' (googleAvatarUrl, audit 07.10, finding 8); a foreign link is
  // refused by the rule of the second PR — test E1 in tests/audit-attacks.test.mjs
  test('avatar: the Google account photo or none, as the site writes it', async () => {
    const db = customer('erin');
    await assertSucceeds(setDoc(doc(db, 'users/erin'), {
      uid: 'erin', name: 'Эрин', avatar: 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c',
    }));
    await assertSucceeds(setDoc(doc(db, 'users/erin'), { avatar: '' }, { merge: true }));
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

// Этап 6 (находка 18): полные фото товара — отдельные документы, читает любой посетитель, пишет администратор
describe('product photos', () => {
  const photo = { productId: 'p1', data: 'data:image/jpeg;base64,AAAA' };

  test('anyone reads a photo, only the admin writes it, and only a picture', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'product_photos/p1_a'), photo));
    await assertSucceeds(getDoc(doc(guest(), 'product_photos/p1_a')));
    await assertFails(setDoc(doc(customer(), 'product_photos/p1_b'), photo));
    await assertFails(setDoc(doc(guest(), 'product_photos/p1_b'), photo));
    // a link or an extra field is not a photo of the store
    await assertFails(setDoc(doc(owner(), 'product_photos/p1_c'), { productId: 'p1', data: 'https://attacker.example/x.png' }));
    await assertFails(setDoc(doc(owner(), 'product_photos/p1_d'), { ...photo, note: 'x' }));
    await assertFails(deleteDoc(doc(customer(), 'product_photos/p1_a')));
    await assertSucceeds(deleteDoc(doc(owner(), 'product_photos/p1_a')));
  });
});

// Каталог частями, этап 5: картинки баннера — отдельный документ, читает любой посетитель, пишет администратор
describe('banner pictures', () => {
  const pictures = { bannerId: 'b1', image: 'data:image/jpeg;base64,AAAA', desktopImage: 'data:image/webp;base64,BBBB' };

  test('anyone reads the pictures, only the admin writes them, and only pictures of their banner', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'banner_images/b1'), pictures));
    await assertSucceeds(getDoc(doc(guest(), 'banner_images/b1')));
    await assertFails(setDoc(doc(customer(), 'banner_images/b2'), { ...pictures, bannerId: 'b2' }));
    await assertFails(setDoc(doc(guest(), 'banner_images/b2'), { ...pictures, bannerId: 'b2' }));
    await assertFails(setDoc(doc(owner(), 'banner_images/b3'), pictures));
    await assertFails(setDoc(doc(owner(), 'banner_images/b1'), { ...pictures, image: 'https://attacker.example/x.png' }));
    await assertFails(setDoc(doc(owner(), 'banner_images/b1'), { ...pictures, note: 'x' }));
    await assertFails(deleteDoc(doc(customer(), 'banner_images/b1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'banner_images/b1')));
  });
});

// Каталог частями, этап 6: превью фото товара — читает любой, пишет администратор
describe('product previews', () => {
  const previews = { productId: 'p1', images: ['data:image/jpeg;base64,AAAA', '', 'data:image/webp;base64,BBBB'] };

  test('anyone reads the previews, only the admin writes them, and only a list for that product', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'product_previews/p1'), previews));
    await assertSucceeds(getDoc(doc(guest(), 'product_previews/p1')));
    await assertFails(setDoc(doc(customer(), 'product_previews/p2'), { ...previews, productId: 'p2' }));
    await assertFails(setDoc(doc(guest(), 'product_previews/p2'), { ...previews, productId: 'p2' }));
    await assertFails(setDoc(doc(owner(), 'product_previews/p2'), previews));
    await assertFails(setDoc(doc(owner(), 'product_previews/p1'), { ...previews, images: 'data:image/jpeg;base64,AAAA' }));
    await assertFails(setDoc(doc(owner(), 'product_previews/p1'), { ...previews, images: Array(31).fill('') }));
    await assertFails(setDoc(doc(owner(), 'product_previews/p1'), { ...previews, note: 'x' }));
    await assertFails(deleteDoc(doc(customer(), 'product_previews/p1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'product_previews/p1')));
  });
});

// Каталог частями, этап 2: индекс каталога и миниатюры выводятся из товаров — читает любой, пишет администратор
describe('catalog index and product thumbs', () => {
  const part = { format: 1, part: 0, parts: 1, hash: '1-abc', entries: Bytes.fromUint8Array(new Uint8Array([31, 139])), updatedAt: '2026-10-04T00:00:00.000Z' };
  const thumb = { productId: 'p1', key: 'p:p1_a', data: 'data:image/jpeg;base64,AAAA' };

  test('anyone reads the index, only the admin writes it, and only its own fields', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'catalog_index/p0'), part));
    await assertSucceeds(getDocs(collection(guest(), 'catalog_index')));
    await assertFails(setDoc(doc(customer(), 'catalog_index/p0'), part));
    await assertFails(setDoc(doc(guest(), 'catalog_index/p1'), part));
    await assertFails(setDoc(doc(owner(), 'catalog_index/p0'), { ...part, note: 'x' }));
    await assertFails(setDoc(doc(owner(), 'catalog_index/p0'), { ...part, entries: '[]' }));
    await assertFails(setDoc(doc(owner(), 'catalog_index/main'), part));
    await assertFails(deleteDoc(doc(customer(), 'catalog_index/p0')));
    await assertSucceeds(deleteDoc(doc(owner(), 'catalog_index/p0')));
  });

  test('anyone reads a miniature, only the admin writes it, and only a picture of that product', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'product_thumbs/p1'), thumb));
    await assertSucceeds(getDoc(doc(guest(), 'product_thumbs/p1')));
    await assertFails(setDoc(doc(customer(), 'product_thumbs/p2'), { ...thumb, productId: 'p2' }));
    await assertFails(setDoc(doc(owner(), 'product_thumbs/p2'), thumb));
    await assertFails(setDoc(doc(owner(), 'product_thumbs/p1'), { ...thumb, data: 'https://attacker.example/x.png' }));
    await assertFails(setDoc(doc(owner(), 'product_thumbs/p1'), { ...thumb, data: `data:image/jpeg;base64,${'A'.repeat(100_000)}` }));
    await assertFails(deleteDoc(doc(guest(), 'product_thumbs/p1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'product_thumbs/p1')));
  });
});

// Находка 26 (аудит 02.10): гость вошёл через Google — заказы и переписка анонимного входа переходят в аккаунт.
// Обе стороны подтверждают связь: guest_links/{гость} пишет гость, account_guests/{аккаунт}_{гость} — аккаунт
describe('guest data goes to the account after sign-in', () => {
  const linkBoth = async (guestUid = 'anon-g', accountUid = 'alice') => {
    await setDoc(doc(customer(accountUid), 'account_guests', `${accountUid}_${guestUid}`), { accountUid, guestUid });
    await setDoc(doc(buyer(guestUid), 'guest_links', guestUid), { accountUid });
  };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'orders/WS-G1'), order({ id: 'WS-G1', customerUid: 'anon-g' }));
      await setDoc(doc(db, 'orders/WS-B1'), order({ id: 'WS-B1', customerUid: 'bob' }));
      for (let i = 0; i < 30; i++) {
        await setDoc(doc(db, `chat_messages/g${i}`), { id: `g${i}`, sender: i % 2 ? 'admin' : 'user', text: 'x', threadId: 'anon-g', isInternalNote: false, sentAt: Timestamp.now() });
      }
      await setDoc(doc(db, 'chat_messages/gn'), { id: 'gn', sender: 'admin', text: 'заметка', threadId: 'anon-g', isInternalNote: true, sentAt: Timestamp.now() });
    });
  });

  test('with both halves of the link the guest moves its orders and the whole chat it sees, in batches', async () => {
    await linkBoth();
    const db = buyer('anon-g');
    await assertSucceeds(updateDoc(doc(db, 'orders/WS-G1'), { customerUid: 'alice', updatedAt: serverTimestamp() }));
    const batch = writeBatch(db);
    for (let i = 0; i < 30; i++) batch.update(doc(db, `chat_messages/g${i}`), { threadId: 'alice' });
    await assertSucceeds(batch.commit());
    // the account now reads them
    await assertSucceeds(getDoc(doc(customer('alice'), 'orders/WS-G1')));
    // staff notes stay where they are; only the owner changes in an order
    await assertFails(updateDoc(doc(db, 'chat_messages/gn'), { threadId: 'alice' }));
  });

  test('the hand-over stamps the server\'s time of the write (orders-scale-plan, stages 2–3)', async () => {
    await linkBoth();
    const db = buyer('anon-g');
    await assertFails(updateDoc(doc(db, 'orders/WS-G1'), { customerUid: 'alice' }));
    await assertFails(updateDoc(doc(db, 'orders/WS-G1'), { customerUid: 'alice', updatedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(db, 'orders/WS-G1'), { customerUid: 'alice', updatedAt: serverTimestamp() }));
  });

  test('without the account\'s half nothing moves: orders cannot be planted on someone else', async () => {
    await setDoc(doc(buyer('anon-g'), 'guest_links', 'anon-g'), { accountUid: 'bob' });
    await assertFails(updateDoc(doc(buyer('anon-g'), 'orders/WS-G1'), { customerUid: 'bob' }));
    await assertFails(updateDoc(doc(buyer('anon-g'), 'chat_messages/g0'), { threadId: 'bob' }));
  });

  test('only the guest\'s own orders and only the owner field; links are written only by their side', async () => {
    await linkBoth();
    await assertFails(updateDoc(doc(buyer('anon-g'), 'orders/WS-B1'), { customerUid: 'alice' }));
    await assertFails(updateDoc(doc(buyer('anon-g'), 'orders/WS-G1'), { customerUid: 'alice', totalPrice: 1 }));
    await assertFails(updateDoc(doc(buyer('anon-g'), 'orders/WS-G1'), { customerUid: 'mallory' }));
    // a Google account cannot pose as a guest, a guest cannot confirm for an account
    await assertFails(setDoc(doc(customer('bob'), 'guest_links', 'bob'), { accountUid: 'alice' }));
    await assertFails(setDoc(doc(buyer('anon-x'), 'account_guests', 'anon-x_anon-g'), { accountUid: 'anon-x', guestUid: 'anon-g' }));
    await assertFails(setDoc(doc(customer('bob'), 'account_guests', 'alice_anon-g'), { accountUid: 'alice', guestUid: 'anon-g' }));
  });

  // Аудит 07.10, находка 40: передача кодом сайта (useSupportChat → handOverGuestData), а не копией записей
  test('the site\'s own code moves the guest\'s orders and the chat it sees to the account (finding 40, 07.10)', async () => {
    const moved = await handOverGuestData({ uid: 'anon-g', db: buyer('anon-g') }, 'alice', customer('alice'));
    assert.deepEqual(moved, { orderIds: ['WS-G1'], messages: 30 });
    assert.equal((await read('orders/WS-G1')).customerUid, 'alice');
    assert.equal((await read('orders/WS-B1')).customerUid, 'bob');
    await assertSucceeds(getDoc(doc(customer('alice'), 'orders/WS-G1')));
    const thread = await getDocs(query(collection(owner(), 'chat_messages'), where('threadId', '==', 'alice')));
    assert.equal(thread.size, 30);
    // the staff note stays in the guest's old dialog
    assert.equal((await read('chat_messages/gn')).threadId, 'anon-g');
  });
});

// Этап 6 (находка 20): фото сообщения чата — отдельный документ chat_images/{id сообщения}. Доступ — как к сообщению
describe('chat photos apart from messages', () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const message = (id, uid, extra = {}) => ({
    id, sender: 'user', text: '', threadId: uid, isInternalNote: false, sentAt: serverTimestamp(), imageId: id, ...extra,
  });
  const sendWithPhoto = (db, id, uid, extra = {}, data = photo) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chat_images', id), { data });
    batch.set(doc(db, 'chat_messages', id), message(id, uid, extra));
    return batch.commit();
  };

  test('a customer sends a photo with its message and reads it; others do not', async () => {
    await assertSucceeds(sendWithPhoto(customer('alice'), 'm1', 'alice'));
    await assertSucceeds(getDoc(doc(customer('alice'), 'chat_images/m1')));
    await assertFails(getDoc(doc(customer('bob'), 'chat_images/m1')));
    await assertFails(getDoc(doc(guest(), 'chat_images/m1')));
    await assertSucceeds(getDoc(doc(owner(), 'chat_images/m1')));
  });

  test('no photo without its message, no message pointing at a missing photo, no photo in someone else\'s thread', async () => {
    await assertFails(setDoc(doc(customer('alice'), 'chat_images/m2'), { data: photo }));
    await assertFails(setDoc(doc(customer('alice'), 'chat_messages/m3'), message('m3', 'alice')));
    await assertFails(sendWithPhoto(customer('alice'), 'm4', 'bob'));
    await assertFails(sendWithPhoto(customer('alice'), 'm5', 'alice', {}, 'https://attacker.example/x.png'));
    await assertFails(sendWithPhoto(customer('alice'), 'm6', 'alice', { imageId: 'other' }));
  });

  test('the photo goes with its message («удалить у всех»), staff notes stay hidden', async () => {
    await assertSucceeds(sendWithPhoto(customer('alice'), 'm7', 'alice'));
    const db = customer('alice');
    const batch = writeBatch(db);
    batch.delete(doc(db, 'chat_images', 'm7'));
    batch.delete(doc(db, 'chat_messages', 'm7'));
    await assertSucceeds(batch.commit());
    // a staff photo in an internal note is not the customer's
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chat_messages/n1'), { ...message('n1', 'alice'), sender: 'admin', isInternalNote: true, sentAt: Timestamp.now() });
      await setDoc(doc(ctx.firestore(), 'chat_images/n1'), { data: photo });
    });
    await assertFails(getDoc(doc(customer('alice'), 'chat_images/n1')));
  });

  test('a receipt photo may be larger than a chat photo (check 04.10, finding 13)', async () => {
    const large = 'data:image/jpeg;base64,' + 'A'.repeat(800_000);
    await assertFails(sendWithPhoto(customer('alice'), 'm8', 'alice', {}, large));
    await assertSucceeds(sendWithPhoto(customer('alice'), 'm9', 'alice', { receiptOrderId: 'WS-1' }, large));
    await assertFails(sendWithPhoto(customer('alice'), 'm10', 'alice', { receiptOrderId: 'WS-1' }, large + 'A'.repeat(100_001)));
  });

  test('a customer deletes a photo like the message: own and within 15 minutes (check 04.10, finding 8)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'chat_messages/old1'), { ...message('old1', 'alice'), sentAt: Timestamp.fromMillis(Date.now() - 16 * 60_000) });
      await setDoc(doc(db, 'chat_images/old1'), { data: photo });
    });
    await assertFails(deleteDoc(doc(customer('alice'), 'chat_images/old1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'chat_images/old1')));
  });
});

// Журнал ошибок у покупателей (docs/ops-plan.md, этап 2): отчёт создаёт любой посетитель, но только в одной из 30 ячеек
// текущего часа, без перезаписи и с полями ограниченной длины; читает и удаляет только администратор
describe('errors on customers\' screens', () => {
  const hour = () => Math.floor(Date.now() / 3_600_000);
  const report = (overrides = {}) => ({
    kind: 'error',
    message: 'TypeError: Cannot read properties of undefined',
    stack: 'at /assets/index-abc.js:1:2',
    page: '/product/p1',
    release: 'abc1234',
    browser: 'Mozilla/5.0 (Linux; Android 14) Chrome/129',
    createdAt: serverTimestamp(),
    ...overrides,
  });

  test('a visitor without sign-in sends a report; only the admin reads and removes it', async () => {
    const id = `${hour()}_0`;
    await assertSucceeds(setDoc(doc(guest(), 'client_errors', id), report()));
    await assertSucceeds(setDoc(doc(customer(), 'client_errors', `${hour()}_1`), { kind: 'console', message: 'Order was not saved: FirebaseError', page: '/checkout', createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(guest(), 'client_errors', id)));
    await assertFails(getDocs(collection(customer(), 'client_errors')));
    await assertSucceeds(getDocs(query(collection(owner(), 'client_errors'), orderBy('createdAt', 'desc'), limit(10))));
    await assertFails(deleteDoc(doc(customer(), 'client_errors', id)));
    await assertSucceeds(deleteDoc(doc(owner(), 'client_errors', id)));
  });

  test('at most 30 reports an hour: no overwrite, no other slots or hours', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'client_errors', `${hour()}_29`), report()));
    // the slot is taken: a second report there (or an attacker wiping a real one) is refused
    await assertFails(setDoc(doc(guest(), 'client_errors', `${hour()}_29`), report({ message: 'x' })));
    await assertFails(setDoc(doc(guest(), 'client_errors', `${hour()}_30`), report()));
    await assertFails(setDoc(doc(guest(), 'client_errors', `${hour() + 5}_1`), report()));
    await assertFails(setDoc(doc(guest(), 'client_errors', `${hour() - 5}_1`), report()));
    await assertFails(setDoc(doc(guest(), 'client_errors', 'random-id'), report()));
    await assertFails(setDoc(doc(guest(), 'client_errors', `${hour()}_1_2`), report()));
    // a phone with its clock an hour off still reports
    await assertSucceeds(setDoc(doc(guest(), 'client_errors', `${hour() - 1}_2`), report()));
  });

  test('only the report\'s fields, of limited size, with the server\'s time', async () => {
    const id = (slot) => `${hour()}_${slot}`;
    await assertFails(setDoc(doc(guest(), 'client_errors', id(3)), report({ customerPhone: '+79990000000' })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(4)), report({ message: 'x'.repeat(501) })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(5)), report({ message: '' })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(6)), report({ stack: 'x'.repeat(2001) })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(7)), report({ page: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(8)), report({ browser: 'x'.repeat(301) })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(9)), report({ kind: 'spam' })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(10)), report({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(guest(), 'client_errors', id(11)), report({ message: { text: 'x' } })));
  });
});
