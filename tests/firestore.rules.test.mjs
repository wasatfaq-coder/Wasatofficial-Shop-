// Tests for firestore.rules. Run with: bun run test:rules
// (starts the Firestore emulator via `firebase emulators:exec`).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

const order = (overrides = {}) => ({
  id: 'MS-1',
  status: 'accepted',
  items: [{ productId: 'p1', quantity: 1 }],
  totalPrice: 10000,
  paymentStatus: 'paid',
  ...overrides,
});

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

  test('customer can deduct stock and add reviews', async () => {
    await assertSucceeds(
      updateDoc(doc(guest(), 'products/p1'), { skus: [{ size: 'M', stock: 2 }], inStock: true })
    );
    await assertSucceeds(
      updateDoc(doc(customer(), 'products/p1'), { reviews: [{ rating: 4 }], rating: 4, reviewsCount: 1 })
    );
  });

  test('admins (owner email or /admins doc) can manage products', async () => {
    await assertSucceeds(updateDoc(doc(owner(), 'products/p1'), { price: 9000 }));
    await assertSucceeds(setDoc(doc(extraAdmin(), 'products/p2'), { ...product, id: 'p2' }));
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
});

describe('promos', () => {
  test('customer can only bump usage counters', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1, generatedRevenue: 500 }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { discountPercent: 99 }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: -5 }));
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
  });

  test('customer cannot place an order in someone else\'s name', async () => {
    await assertFails(setDoc(doc(customer('alice'), 'orders/MS-5'), order({ id: 'MS-5', customerUid: 'bob' })));
    await assertSucceeds(setDoc(doc(customer('alice'), 'orders/MS-6'), order({ id: 'MS-6', customerUid: 'alice' })));
  });

  test('customer reads only own orders', async () => {
    const db = customer('alice');
    await assertSucceeds(getDocs(query(collection(db, 'orders'), where('customerUid', '==', 'alice'))));
    await assertFails(getDoc(doc(db, 'orders/MS-bob')));
    await assertFails(getDocs(collection(db, 'orders')));
  });

  test('only admin updates or deletes orders', async () => {
    await assertFails(updateDoc(doc(customer('alice'), 'orders/MS-alice'), { status: 'delivered' }));
    await assertSucceeds(updateDoc(doc(owner(), 'orders/MS-alice'), { status: 'delivered' }));
    await assertSucceeds(getDocs(collection(owner(), 'orders')));
    await assertSucceeds(deleteDoc(doc(owner(), 'orders/MS-bob')));
  });
});

describe('chat', () => {
  test('customer can post user messages only', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'chat_messages/m1'), { id: 'm1', sender: 'user', text: 'Привет' }));
    await assertFails(setDoc(doc(guest(), 'chat_messages/m2'), { id: 'm2', sender: 'admin', text: 'fake' }));
    await assertFails(
      setDoc(doc(guest(), 'chat_messages/m3'), { id: 'm3', sender: 'user', text: 'x', isInternalNote: true })
    );
    await assertSucceeds(setDoc(doc(owner(), 'chat_messages/m4'), { id: 'm4', sender: 'admin', text: 'ok' }));
  });

  test('only admin deletes messages', async () => {
    await assertFails(deleteDoc(doc(guest(), 'chat_messages/m1')));
    await assertSucceeds(deleteDoc(doc(owner(), 'chat_messages/m1')));
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

  test('nobody can grant admin rights from the client', async () => {
    await assertFails(setDoc(doc(customer('alice'), 'admins/alice'), { role: 'admin' }));
    await assertFails(setDoc(doc(owner(), 'admins/alice'), { role: 'admin' }));
  });
});
