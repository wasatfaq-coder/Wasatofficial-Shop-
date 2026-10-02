// Пробы правил (клиентский режим). Тест записан «как должно быть»: assertFails. Падение = дыра подтверждена.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

let env;
const anon = () => env.unauthenticatedContext().firestore();
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-orders-probe',
    firestore: { rules: readFileSync('/home/user/Wasatofficial-Shop-/firestore.rules', 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'promos/once'), { id: 'once', code: 'SORRY500', active: true, discountType: 'fixed', discountValue: 500, usageLimit: 1, usedCount: 0 });
    await setDoc(doc(db, 'promos/used'), { id: 'used', code: 'USED1', active: true, usageLimit: 1, usedCount: 1 });
    await setDoc(doc(db, 'promos/ref'), { id: 'ref', code: 'BLOG', active: true, isReferral: true, partnerCommissionPercent: 10, usedCount: 0, generatedRevenue: 0, commissionEarned: 0 });
    await setDoc(doc(db, 'products/p1'), { id: 'p1', title: 'Пальто', price: 10000, inStock: true,
      skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 3, skuCode: 'WS-001-M', barcode: '4600000000017' }] });
  });
});

test('R1 гость без входа не «сжигает» одноразовый код компенсации из чата', async () => {
  await assertFails(updateDoc(doc(anon(), 'promos/once'), { usedCount: increment(1) }));
});
test('R2 счётчик не растёт выше лимита использований', async () => {
  await assertFails(updateDoc(doc(anon(), 'promos/used'), { usedCount: increment(1) }));
});
test('R3 гость не начисляет партнёру 3 000 000 ₽ комиссии тремя записями', async () => {
  const db = anon();
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    try { await updateDoc(doc(db, 'promos/ref'), { usedCount: increment(1), generatedRevenue: increment(1000000), commissionEarned: increment(1000000) }); }
    catch (e) { lastError = e; }
  }
  let commission;
  await env.withSecurityRulesDisabled(async (ctx) => { commission = (await getDoc(doc(ctx.firestore(), 'promos/ref'))).data().commissionEarned; });
  console.log('commissionEarned после 3 записей гостя:', commission, 'ошибка:', lastError?.code ?? 'нет');
  if (commission > 0) throw new Error(`комиссия партнёра накручена до ${commission}`);
});
test('R4 гость не переписывает артикул и штрихкод варианта (этикетки и сканер)', async () => {
  await assertFails(updateDoc(doc(anon(), 'products/p1'), {
    skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 3, skuCode: 'HACK', barcode: '0000000000000' }],
  }));
});
