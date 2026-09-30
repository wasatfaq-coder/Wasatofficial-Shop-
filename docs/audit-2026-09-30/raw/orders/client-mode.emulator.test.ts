// Аудит заказов: клиентский режим (settings/server отсутствует) на эмуляторе Firestore с боевыми firestore.rules.
// Каждый тест проходит, если риск ПОДТВЕРЖДЁН.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { mergeProductReviews, withoutCollectionReviews } from '/home/user/Wasatofficial-Shop-/src/utils/reviews';
import { deductStockWithLogs } from '/home/user/Wasatofficial-Shop-/src/utils/inventory';
import type { CartItem, Product } from '/home/user/Wasatofficial-Shop-/src/types';

let env: RulesTestEnvironment;
const guest = () => env.unauthenticatedContext().firestore();
const customer = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();

// Товар в том виде, как его создаёт админка (AdminProductsTab: без поля reviews)
const shirt: Product = {
  id: 'p1', title: 'Рубашка', price: 10000, category: 'shirts', inStock: true, rating: 0, reviewsCount: 0,
  colors: [{ name: 'Белый', hex: '#fff' }], sizes: ['M'],
  skus: [{ id: 'p1-Белый-M', color: 'Белый', size: 'M', stock: 1, skuCode: 'WS-SH01-БЕЛ-M' }],
} as unknown as Product;
const promo = { id: 'promo1', code: 'VIP50', active: true, discountType: 'percent', discountValue: 50, usageLimit: 1, usedCount: 0, generatedRevenue: 0, isReferral: true, commissionEarned: 0 };
const strip = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const item = (qty = 1): CartItem => ({ id: 'c1', product: shirt, selectedColor: 'Белый', selectedSize: 'M', quantity: qty });
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: 'accepted', items: [strip(item())], totalPrice: 10000, paymentStatus: 'pending', ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-audit-orders',
    firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8280 },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/p1'), strip(shirt));
    await setDoc(doc(db, 'promos/promo1'), promo);
  });
});

describe('S1: заказ с произвольной суммой', () => {
  test('гость без входа записывает заказ за 1 ₽ на товар за 10 000 ₽ со статусом «Оплачен»', async () => {
    const fake = order('WS-FAKE1', {
      totalPrice: 1, paymentStatus: 'paid',
      items: [{ ...strip(item(5)), product: { ...strip(shirt), price: 0.2 } }],
    });
    await assertSucceeds(setDoc(doc(guest(), 'orders/WS-FAKE1'), fake));
  });
});

describe('S2: склад и витрина без входа', () => {
  test('гость обнуляет остаток и снимает товар с продажи', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'products/p1'), { skus: [{ ...shirt.skus![0], stock: 0 }], inStock: false }));
  });
  test('гость ставит остаток 9999 (перепродажа того, чего нет)', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'products/p1'), { skus: [{ ...shirt.skus![0], stock: 9999 }] }));
  });
  test('гость пишет в skus произвольные поля (например, штрихкод и артикул)', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'products/p1'), { skus: [{ id: 'x', color: 'X', size: 'X', stock: 1, barcode: '2000000000000', skuCode: 'HACK' }] }));
  });
});

describe('S3: промокоды без входа', () => {
  test('гость «сжигает» лимит одноразового промокода, не делая заказа', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1 }));
  });
  test('гость накручивает партнёру комиссию и выручку', async () => {
    await assertSucceeds(updateDoc(doc(guest(), 'promos/promo1'), { commissionEarned: 1_000_000, generatedRevenue: 99_000_000 }));
  });
});

describe('S4: последний товар, два покупателя', () => {
  test('оба оформляют и оба списывают остаток 1 → 2 заказа, остаток 0, ни одной ошибки', async () => {
    // Путь completeOrderLocally: заказ → deductStockWithLogs по своему снимку каталога → setDoc товара целиком
    const snapshotA = [strip(shirt)];
    const snapshotB = [strip(shirt)]; // оба видели stock=1
    const a = customer('alice');
    const b = customer('bob');
    await assertSucceeds(setDoc(doc(a, 'orders/WS-A'), order('WS-A', { customerUid: 'alice' })));
    await assertSucceeds(setDoc(doc(b, 'orders/WS-B'), order('WS-B', { customerUid: 'bob' })));
    const [pa] = deductStockWithLogs(snapshotA, [item()], 'WS-A').updatedProducts;
    const [pb] = deductStockWithLogs(snapshotB, [item()], 'WS-B').updatedProducts;
    await assertSucceeds(setDoc(doc(a, 'products/p1'), strip(withoutCollectionReviews(pa))));
    await assertSucceeds(setDoc(doc(b, 'products/p1'), strip(withoutCollectionReviews(pb))));
    let stock = -1;
    await env.withSecurityRulesDisabled(async (ctx) => {
      stock = (await getDoc(doc(ctx.firestore(), 'products/p1'))).data()!.skus[0].stock;
    });
    expect(stock).toBe(0); // продано 2, было 1 — перепродажа незаметна: остаток не «-1»
  });
});

describe('S5: списание со склада отклоняется, если у товара есть отзыв', () => {
  test('без отзывов списание проходит (контроль)', async () => {
    const products = mergeProductReviews([strip(shirt)], [], []);
    const [p] = deductStockWithLogs(products, [item()], 'WS-1').updatedProducts;
    await assertSucceeds(setDoc(doc(customer('alice'), 'products/p1'), strip(withoutCollectionReviews(p))));
  });
  test('после первого отзыва покупателя списание отклоняется правилами — заказ есть, остаток прежний', async () => {
    const review = { id: 'p1_carol', productId: 'p1', uid: 'carol', authorName: 'Carol', rating: 5, comment: 'ok', date: '1 сент', createdAt: '2026-09-01' };
    const products = mergeProductReviews([strip(shirt)], [review as never], []);
    const [p] = deductStockWithLogs(products, [item()], 'WS-2').updatedProducts;
    const written = strip(withoutCollectionReviews(p));
    expect(written.reviews).toEqual([]); // появилось поле reviews: [] — его нет в базе
    await assertSucceeds(setDoc(doc(customer('alice'), 'orders/WS-2'), order('WS-2', { customerUid: 'alice' })));
    await assertFails(setDoc(doc(customer('alice'), 'products/p1'), written));
  });
});

describe('S6: контроль — серверный режим закрывает прямые записи', () => {
  test('при serverOrdersEnabled гость не может ни заказ, ни склад, ни промокод', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings/server'), { serverOrdersEnabled: true });
    });
    await assertFails(setDoc(doc(guest(), 'orders/WS-FAKE2'), order('WS-FAKE2', { totalPrice: 1 })));
    await assertFails(updateDoc(doc(guest(), 'products/p1'), { skus: [], inStock: false }));
    await assertFails(updateDoc(doc(guest(), 'promos/promo1'), { usedCount: 1 }));
  });
});
