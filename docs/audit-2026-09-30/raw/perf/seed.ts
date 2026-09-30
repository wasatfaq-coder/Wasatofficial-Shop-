import { initializeApp } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/firestore/index.js';
import cfg from '/home/user/Wasatofficial-Shop-/firebase-applet-config.json';
import demo from '/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/current-demo.json';
import photos from '/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/risk/perf/photos.json';
const { PRODUCTS, INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } = demo as any;
initializeApp({ projectId: cfg.projectId });
const db = getFirestore(cfg.firestoreDatabaseId);
const j = (o: unknown) => JSON.parse(JSON.stringify(o));
const SET = process.env.DATASET || 'live';
const N = SET === 'live' ? 7 : Number(SET.replace('p', ''));
const products: any[] = [];
for (let i = 0; i < N; i++) {
  const t = PRODUCTS[i % PRODUCTS.length];
  let images: string[];
  if (SET === 'live') images = i === 0 ? [photos[0], photos[1], photos[2]] : [];
  else { const k = (i % 3) + 1; images = Array.from({ length: k }, (_, m) => photos[(i * 3 + m) % photos.length]); }
  const id = SET === 'live' && i < PRODUCTS.length ? t.id : `${t.id}-${i}`;
  products.push(j({ ...t, id, title: i < PRODUCTS.length ? t.title : `${t.title} ${i + 1}`, images, isPopular: i % 2 === 0, isNew: i % 5 === 0, rating: 0, reviewsCount: 0 }));
}
let bytes = 0; const t0 = Date.now();
// few docs per commit: request size limit
for (let i = 0; i < products.length; i += 5) {
  const b = db.batch();
  for (const p of products.slice(i, i + 5)) { b.set(db.doc('products/' + p.id), p); bytes += JSON.stringify(p).length; }
  await b.commit();
}
const cats = [...new Map(PRODUCTS.map((p: any) => [p.category, { id: p.category, name: p.categoryLabel || p.category }])).values()];
const b = db.batch();
b.set(db.doc('settings/storefront'), {
  storeName: 'Wasat Shop', freeDeliveryThreshold: 5000, courierDeliveryPrice: 350, isExpressEnabled: true, isStoreOnline: true, returnPeriodDays: 14,
  isStoreBannerVisible: true, storeBannerText: 'Скидка 10% на первый заказ', bannerBadgeText: 'Акция',
  phone: '+7 (495) 111-22-33', email: 'shop@example.ru', telegram: '@wasat_shop', categories: cats,
  paymentMethods: [{ id: 'phone', title: 'Перевод по номеру телефона', description: 'Менеджер пришлет номер.', isActive: true }],
  faqItems: [{ id: 'q1', question: 'Как вернуть товар?', answer: 'В течение 14 дней.', isActive: true }],
});
b.set(db.doc('settings/server'), { serverOrdersEnabled: false });
INITIAL_DELIVERY_METHODS.forEach((m: any, i: number) => b.set(db.doc('delivery_methods/' + m.id), j({ ...m, sortOrder: i + 1 })));
INITIAL_PICKUP_POINTS.forEach((pt: any) => b.set(db.doc('pickup_points/' + pt.id), j(pt)));
for (let k = 1; k <= 7; k++) b.set(db.doc('promos/p' + k), { id: 'p' + k, code: 'CODE' + k, title: 'Промо ' + k, discountPercent: 10, discountType: 'percent', discountValue: 10, active: true, usedCount: 0, minOrderAmount: 0 });
for (let k = 1; k <= 3; k++) b.set(db.doc('banners/b' + k), { id: 'b' + k, title: 'Баннер ' + k, subtitle: 'Подзаголовок', btnText: 'Смотреть', image: '', active: true, actionType: 'catalog', order: k });
await b.commit();
console.log(`seeded ${SET}: ${products.length} products, ${(bytes / 1024 / 1024).toFixed(2)} MB of product JSON, max doc ${Math.round(Math.max(...products.map((p) => JSON.stringify(p).length)) / 1024)} KB, ${Date.now() - t0} ms`);
if (SET === 'live' && process.env.ORDER_TEST === '1') {
  const big = products[0];
  const order = { id: 'WS-TEST-1', createdAt: new Date().toISOString(), date: 'x', status: 'accepted', totalPrice: 5980, items: [
    { id: 'c1', product: big, selectedColor: 'Бежевый', selectedSize: 'M', quantity: 1 },
    { id: 'c2', product: big, selectedColor: 'Бежевый', selectedSize: 'L', quantity: 1 }] };
  console.log('order JSON size KB', Math.round(JSON.stringify(order).length / 1024));
  try { await db.doc('orders/WS-TEST-1').set(order); console.log('ORDER 2 lines WRITE OK'); } catch (e: any) { console.log('ORDER 2 lines WRITE FAILED:', e.code, e.message.slice(0, 200)); }
  const order1 = { ...order, id: 'WS-TEST-2', items: order.items.slice(0, 1) };
  try { await db.doc('orders/WS-TEST-2').set(order1); console.log('ORDER 1 line WRITE OK'); } catch (e: any) { console.log('ORDER 1 line FAILED', e.message.slice(0, 200)); }
  await db.doc('orders/WS-TEST-2').delete();
}
process.exit(0);
