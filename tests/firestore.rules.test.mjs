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
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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

  test('customer can deduct stock but not rewrite reviews or rating inside the product', async () => {
    await assertSucceeds(
      updateDoc(doc(guest(), 'products/p1'), { skus: [{ size: 'M', stock: 2 }], inStock: true })
    );
    await assertFails(
      updateDoc(doc(customer(), 'products/p1'), { reviews: [{ rating: 4 }], rating: 4, reviewsCount: 1 })
    );
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { reviews: [{ rating: 1 }] }));
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
    // markup in an order number would reach the admin's reports
    const badId = 'MS-<img src=x onerror=alert(1)>';
    await assertFails(setDoc(doc(guest(), 'orders', badId), order({ id: badId })));
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
  });

  test('reviews and admin actions still work', async () => {
    await assertSucceeds(setDoc(doc(customer('alice'), 'reviews/p1_alice'), review('alice')));
    await assertSucceeds(setDoc(doc(owner(), 'orders/MS-11'), order({ id: 'MS-11' })));
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
