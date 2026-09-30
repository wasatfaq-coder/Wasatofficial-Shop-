// Атаки на firestore.rules из обзора рисков 30.09.2026 (docs/audit-2026-09-30-plan.md).
// Запуск вместе с остальными тестами правил: bun run test:rules.
//
// Каждый тест записан так, как должно быть: запрос злоумышленника отклонён. Пока уязвимость открыта, тест помечен
// `todo` с номером находки и этапа плана — он выполняется, но его падение не делает CI красным. Этап, который закрывает
// уязвимость, снимает пометку `todo`, и с этого момента тест защищает от возврата дыры.
// Тесты S1 и C1 — то, что уже держит: они без пометки.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'gunh83975@gmail.com';

let env;

const anon = () => env.unauthenticatedContext().firestore(); // посетитель без входа
const guestChat = (uid = 'anon1') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const customer = (uid = 'mallory') =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();

const product = {
  id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true,
  skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 1 }],
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
  // Свой projectId: в том же эмуляторе параллельно идут tests/firestore.rules.test.mjs (demo-manstyle)
  env = await initializeTestEnvironment({
    projectId: 'demo-audit-attacks',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

describe('Клиентский режим заказов (settings/server нет — так сейчас на живом сайте)', () => {
  beforeEach(() => seed(undefined));

  test('A1 посетитель без входа не может обнулить остаток и снять товар с продажи',
    { todo: 'находка 1, этап 1' }, async () => {
      await assertFails(updateDoc(doc(anon(), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false,
      }));
    });

  test('A2 никто, кроме администратора, не может увеличить остаток (продажа того, чего нет)',
    { todo: 'находка 1, этап 1: правилами не проверить (лимит 1000 выражений), нужны серверные заказы' }, async () => {
      await assertFails(updateDoc(doc(customer(), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 9999 }], inStock: true,
      }));
    });

  test('A3 посетитель без входа не может раздуть товар мусорными вариантами (~900 КБ скачивает каждый покупатель)',
    async () => {
      const junk = Array.from({ length: 3000 }, (_, i) => ({ id: `x${i}`, color: 'x'.repeat(200), size: 'XL', stock: 1 }));
      await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: junk }));
    });

  test('A4 посетитель без входа не может «израсходовать» промокод и накрутить комиссию партнёра',
    async () => {
      await assertFails(updateDoc(doc(anon(), 'promos/promo1'), {
        usedCount: 1_000_000, generatedRevenue: 99_000_000, commissionEarned: 9_900_000,
      }));
    });

  test('A5 посетитель без входа не может записать заказ на 1 ₽ с чужими ценами',
    { todo: 'находка 2, этап 1' }, async () => {
      // «Оплачен» и чужие поля (placedVia) правила уже не пускают; остаётся сумма, которую никто не сверяет
      await assertFails(setDoc(doc(anon(), 'orders/WS-FAKE1'), {
        id: 'WS-FAKE1', status: 'accepted', totalPrice: 1, paymentStatus: 'pending', paymentMethod: 'Перевод',
        deliveryMethod: 'Курьер',
        items: [{ product: { ...product, price: 1, image: 'https://attacker.example/pixel.gif' }, quantity: 5, selectedSize: 'M' }],
        customerName: 'Иван', customerPhone: '+70000000000', deliveryAddress: 'где угодно',
      }));
    });

  test('A6 заказ с произвольными полями и мусором в строках отклоняется (иначе — спам заказами без ограничений)',
    async () => {
      await assertFails(setDoc(doc(anon(), 'orders/SPAM-1'), {
        id: 'SPAM-1', status: 'accepted', totalPrice: 0, items: [{ x: 'y'.repeat(20000) }],
      }));
    });

  test('A7 последний товар: покупатель не пишет остаток напрямую, иначе двое покупают одну вещь (гонка без транзакции)',
    { todo: 'находка 6, этап 1' }, async () => {
      // Оба покупателя видели остаток 1 и оба записали 0 — оба заказа прошли бы. Закрывается заказом через placeOrder.
      await assertFails(updateDoc(doc(customer('alice'), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false,
      }));
    });
});

describe('Серверный режим заказов (serverOrdersEnabled=true) — клиентские лазейки закрыты', () => {
  beforeEach(() => seed(true));

  test('S1 остатки, промокод и заказ напрямую — отказ', async () => {
    await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: [], inStock: false }));
    await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 999 }));
    await assertFails(setDoc(doc(anon(), 'orders/WS-X'), { id: 'WS-X', status: 'accepted', totalPrice: 1, items: [{}] }));
  });
});

describe('Оба режима', () => {
  beforeEach(() => seed(true));

  test('B1 посетитель без входа не получает список всех промокодов (личные и партнёрские, с лимитами и выручкой)',
    { todo: 'находка 10, этап 3' }, async () => {
      await assertFails(getDocs(collection(anon(), 'promos')));
    });

  test('B2 посетитель без входа не читает шаблоны ответов поддержки',
    { todo: 'находка 41, этап 7' }, async () => {
      // settings/server покупатель читает по замыслу: по нему сайт выбирает режим заказов
      await assertSucceeds(getDoc(doc(anon(), 'settings/server')));
      await assertFails(getDoc(doc(anon(), 'settings/quick_phrases')));
    });

  test('B3 анонимный гость чата не может записать сообщение с чужим id и картинкой ~850 КБ (вытесняет обращения в админке)',
    { todo: 'находка 27, этап 7' }, async () => {
      const id = '0000-spam-0001'; // сортируется раньше настоящих msg-<время>, а админка берёт limit(500) без orderBy
      await assertFails(setDoc(doc(guestChat('anon1'), `chat_messages/${id}`), {
        id, sender: 'user', text: 'спам', threadId: 'anon1', isInternalNote: false,
        imageUrl: 'data:image/png;base64,' + 'A'.repeat(850_000),
        threadName: 'Служба поддержки', sentAt: serverTimestamp(),
      }));
    });

  test('B4 «Полезно» нельзя поставить несуществующему отзыву (эти голоса скачивает каждый посетитель)',
    { todo: 'находка 25, этап 6' }, async () => {
      await assertFails(setDoc(doc(customer('mallory'), 'review_votes/nope_victim_mallory'), {
        reviewId: 'nope_victim', productId: 'nope', uid: 'mallory',
      }));
    });

  test('B5 покупатель не пишет в свой профиль произвольные поля и ~900 КБ (админка грузит профили всех)',
    { todo: 'находка 41, этап 7' }, async () => {
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), {
        uid: 'mallory', name: 'x', role: 'admin', isAdmin: true, blob: 'z'.repeat(900_000),
      }));
    });

  test('C1 держит: чужой заказ, бонусы, admins, почта владельца без подтверждения, чужой чат', async () => {
    await assertFails(getDoc(doc(customer('mallory'), 'orders/WS-REAL1')));
    await assertFails(getDocs(query(collection(anon(), 'orders'))));
    await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { bonusPoints: 100000 }, { merge: true }));
    await assertFails(setDoc(doc(customer('mallory'), 'admins/mallory'), { x: 1 }));
    const fakeOwner = env.authenticatedContext('evil', { email: ADMIN_EMAIL, email_verified: false }).firestore();
    await assertFails(getDocs(collection(fakeOwner, 'orders')));
    await assertFails(getDocs(query(collection(guestChat('anon2'), 'chat_messages'),
      where('threadId', '==', 'anon1'), where('isInternalNote', '==', false))));
    await assertFails(getDocs(query(collection(guestChat('anon1'), 'chat_messages'), limit(5))));
  });
});
