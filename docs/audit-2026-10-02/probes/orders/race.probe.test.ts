import { expect, test } from 'bun:test';
import { initializeApp } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/firestore/index.js';
import { placeOrderCore } from '/home/user/Wasatofficial-Shop-/functions/src/placeOrder';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8280';
const db = getFirestore(initializeApp({ projectId: 'demo-orders-race' }, 'race'));
const req = (promoCode?: string) => ({ items: [{ productId: 'p', color: 'Черный', size: 'M', quantity: 1 }], deliveryMethodId: 'c',
  deliveryAddress: 'Москва', paymentMethod: 'Перевод', contact: { name: 'И', phone: '+7999' }, ...(promoCode ? { promoCode } : {}) });
async function reset(stock: number) {
  for (const c of ['products', 'orders', 'promos', 'delivery_methods', 'settings', 'stock_movements']) await db.recursiveDelete(db.collection(c));
  await db.doc('products/p').set({ id: 'p', title: 'Пальто', price: 10000, inStock: true, skus: [{ id: 'p-m', color: 'Черный', size: 'M', stock }] });
  await db.doc('delivery_methods/c').set({ id: 'c', title: 'Курьер', price: 300, isActive: true });
}
test('серверный режим: 5 одновременных заказов на последний товар — принят ровно один', async () => {
  await reset(1);
  const res = await Promise.allSettled([1, 2, 3, 4, 5].map(() => placeOrderCore(db, req(), null)));
  const ok = res.filter((r) => r.status === 'fulfilled').length;
  const stock = (await db.doc('products/p').get()).data()!.skus[0].stock;
  console.log('принято', ok, 'остаток', stock, 'ошибки', res.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message).join(' | '));
  expect(ok).toBe(1); expect(stock).toBe(0);
});
test('серверный режим: одноразовый промокод в 3 одновременных заказах — со скидкой ровно один', async () => {
  await reset(10);
  await db.doc('promos/x').set({ id: 'x', code: 'ONCE', active: true, discountType: 'fixed', discountValue: 1000, usageLimit: 1, usedCount: 0 });
  const res = await Promise.allSettled([1, 2, 3].map(() => placeOrderCore(db, req('ONCE'), null)));
  const ok = res.filter((r) => r.status === 'fulfilled').length;
  const used = (await db.doc('promos/x').get()).data()!.usedCount;
  console.log('со скидкой принято', ok, 'usedCount', used);
  expect(ok).toBe(1); expect(used).toBe(1);
});
