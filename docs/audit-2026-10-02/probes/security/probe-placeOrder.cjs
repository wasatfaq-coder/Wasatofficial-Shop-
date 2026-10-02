// Проба: placeOrder без входа (нет request.auth), способ оплаты не из настроек, склад выбирается целиком, промокод партнёра.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const cfg = require('/home/user/Wasatofficial-Shop-/firebase-applet-config.json');
initializeApp({ projectId: 'demo-security' });
const db = getFirestore(cfg.firestoreDatabaseId);
const URL = 'http://127.0.0.1:5101/demo-security/europe-west1/placeOrder';
const call = async (data) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  return { status: r.status, body: await r.json() };
};
(async () => {
  await db.doc('settings/server').set({ serverOrdersEnabled: true });
  await db.doc('settings/storefront').set({ paymentMethods: [{ id: 'cash', title: 'Наличными при получении' }] });
  await db.doc('delivery_methods/courier').set({ id: 'courier', title: 'Курьер', price: 500, isActive: true, active: true, enabled: true });
  await db.doc('products/p1').set({ id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true,
    skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 99 }] });
  await db.doc('promos/promo1').set({ id: 'promo1', code: 'BLOGGER15', discountPercent: 15, usageLimit: 3, usedCount: 0, active: true,
    isReferral: true, partnerCommissionPercent: 10, generatedRevenue: 0, commissionEarned: 0 });
  const base = { deliveryMethodId: 'quick-order', deliveryAddress: 'x', contact: { name: 'Бот', phone: '1' } };
  const r1 = await call({ ...base, items: [{ productId: 'p1', color: 'Черный', size: 'M', quantity: 99 }], paymentMethod: 'Оплачено онлайн картой' });
  console.log('1) без входа, 99 шт., способ оплаты не из настроек:', r1.status, r1.body.order ? { id: r1.body.order.id, paymentMethod: r1.body.order.paymentMethod, paymentStatus: r1.body.order.paymentStatus, total: r1.body.order.totalPrice, customerUid: r1.body.order.customerUid ?? null } : r1.body);
  console.log('   остаток после:', (await db.doc('products/p1').get()).data().skus[0].stock, 'inStock:', (await db.doc('products/p1').get()).data().inStock);
  // восстановим склад и сожжём партнёрский промокод гостевыми заказами
  await db.doc('products/p1').update({ skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 99 }], inStock: true });
  const del = (await db.collection('delivery_methods').get()).docs.map((d) => d.id);
  for (let i = 0; i < 3; i++) {
    const r = await call({ ...base, deliveryMethodId: del[0], items: [{ productId: 'p1', color: 'Черный', size: 'M', quantity: 1 }], paymentMethod: 'x', promoCode: 'BLOGGER15' });
    console.log(`2.${i}) гость с промокодом:`, r.status, r.body.order ? r.body.order.id : JSON.stringify(r.body).slice(0, 160));
  }
  console.log('   промокод после:', (await db.doc('promos/promo1').get()).data());
  const r4 = await call({ ...base, deliveryMethodId: del[0], items: [{ productId: 'p1', color: 'Черный', size: 'M', quantity: 1 }], paymentMethod: 'x', promoCode: 'BLOGGER15' });
  console.log('3) настоящий покупатель после этого:', r4.status, JSON.stringify(r4.body).slice(0, 160));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
