// Замеры области «данные»: node probe.mjs внутри emulators:exec (порт 8380)
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, onSnapshot, query, limit, orderBy, setDoc, updateDoc, writeBatch, where } from 'firebase/firestore';

const ADMIN_EMAIL = 'gunh83975@gmail.com';
const out = [];
const log = (...a) => { const s = a.join(' '); console.log(s); out.push(s); };
const kb = (n) => (n / 1024).toFixed(0) + ' КБ';
const mb = (n) => (n / 1048576).toFixed(1) + ' МБ';
const size = (v) => Buffer.byteLength(JSON.stringify(v));

const env = await initializeTestEnvironment({
  projectId: 'demo-data',
  firestore: { host: '127.0.0.1', port: 8380, rules: readFileSync('/home/user/Wasatofficial-Shop-/firestore.rules', 'utf8') },
});
const guest = env.unauthenticatedContext().firestore();
const owner = env.authenticatedContext('owner', { email: ADMIN_EMAIL, email_verified: true }).firestore();
const alice = env.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore();

const photo = (bytes) => 'data:image/jpeg;base64,' + randomBytes(Math.floor(bytes * 3 / 4)).toString('base64');
const N = Number(process.env.N || 200);
const PHOTO = Number(process.env.PHOTO || 170_000);
const sizes = ['46', '48', '50', '52', '54'];
const colors = ['Чёрный', 'Синий'];
const mkProduct = (i) => ({
  id: `prod-${i}`, title: `Пальто ${i}`, category: 'coats', categoryLabel: 'Пальто', price: 9000 + i, rating: 0, reviewsCount: 0,
  description: 'Шерсть 80%, кашемир 20%. '.repeat(20), images: [photo(PHOTO), photo(PHOTO), photo(PHOTO)],
  sizes, colors, inStock: true,
  skus: colors.flatMap((c) => sizes.map((s) => ({ sku: `WS-${i}-${c}-${s}`, color: c, size: s, stock: 5, barcode: '46' + i + s }))),
});

// ---------- seed ----------
let t = Date.now();
const productBytes = [];
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (let i = 0; i < N; i += 5) {
    const b = writeBatch(db);
    for (let j = i; j < Math.min(N, i + 5); j++) { const p = mkProduct(j); productBytes.push(size(p)); b.set(doc(db, 'products', p.id), p); }
    await b.commit();
  }
  const b2 = writeBatch(db);
  for (let i = 0; i < 300; i++) b2.set(doc(db, 'reviews', `prod-${i % N}_u${i}`), { id: `prod-${i % N}_u${i}`, productId: `prod-${i % N}`, uid: `u${i}`, author: 'Иван', rating: 5, text: 'Хорошее пальто, сел отлично. '.repeat(4), date: '2026-09-01' });
  await b2.commit();
  const b3 = writeBatch(db);
  for (let i = 0; i < 450; i++) b3.set(doc(db, 'review_votes', `prod-${i % 300}_u${i}_v${i}`), { reviewId: `prod-${i % 300}_u${i}`, uid: `v${i}` });
  await b3.commit();
  const b4 = writeBatch(db);
  for (let i = 0; i < 10; i++) b4.set(doc(db, 'promos', `promo-${i}`), { id: `promo-${i}`, code: `CODE${i}`, discountPercent: 10, usedCount: 0, isActive: true });
  for (let i = 0; i < 3; i++) b4.set(doc(db, 'banners', `b${i}`), { id: `b${i}`, title: 'Осень', image: photo(300_000), order: i });
  for (let i = 0; i < 4; i++) b4.set(doc(db, 'delivery_methods', `d${i}`), { id: `d${i}`, name: 'СДЭК', price: 350 });
  for (let i = 0; i < 5; i++) b4.set(doc(db, 'pickup_points', `pp${i}`), { id: `pp${i}`, address: 'Москва, ул. Ленина, 1' });
  b4.set(doc(db, 'settings', 'storefront'), { storeName: 'Wasat Shop', faqItems: [], categories: [], paymentMethods: [{ id: 'cash', name: 'Наличные' }] });
  b4.set(doc(db, 'settings', 'server'), { serverOrdersEnabled: false });
  await b4.commit();
  // admin side
  const line = (k) => ({ product: { id: `prod-${k}`, title: `Пальто ${k}`, price: 9000, category: 'coats', categoryLabel: 'Пальто' }, quantity: 1, selectedSize: '48', selectedColor: 'Чёрный' });
  for (let i = 0; i < 1000; i += 400) {
    const b = writeBatch(db);
    for (let j = i; j < Math.min(1000, i + 400); j++) b.set(doc(db, 'orders', `WS-${100000 + j}`), {
      id: `WS-${100000 + j}`, status: 'delivered', createdAt: new Date(Date.UTC(2026, 0, 1) + j * 3600e3).toISOString(), date: '1 января 2026',
      items: [line(j % N), line((j + 1) % N)], totalPrice: 18350, deliveryFee: 350, customerName: 'Иван Петров', customerPhone: '+79990000000',
      customerEmail: 'ivan@example.com', deliveryAddress: 'Москва, ул. Ленина, д. 1, кв. 2', paymentMethod: 'Наличные', customerUid: `u${j % 300}`,
      historySteps: [{ status: 'accepted', date: '1 января', completed: true }, { status: 'delivered', date: '3 января', completed: true }],
    });
    await b.commit();
  }
  const b5 = writeBatch(db);
  for (let i = 0; i < 300; i++) b5.set(doc(db, 'users', `u${i}`), { uid: `u${i}`, name: 'Иван', email: `u${i}@example.com`, phone: '+79990000000', bonusPoints: 0 });
  for (let i = 0; i < 50; i++) b5.set(doc(db, 'customer_notes', `u${i}`), { managerNotes: 'Постоянный', tags: ['vip'] });
  await b5.commit();
  for (let i = 0; i < 600; i += 100) {
    const b = writeBatch(db);
    for (let j = i; j < i + 100; j++) b.set(doc(db, 'chat_messages', `msg-${1700000000000 + j * 60000}`), {
      id: `msg-${1700000000000 + j * 60000}`, threadId: `u${j % 40}`, sender: j % 2 ? 'user' : 'support', text: 'Здравствуйте, когда доставка?',
      isInternalNote: false, sentAt: new Date(1700000000000 + j * 60000), ...(j % 10 === 0 ? { imageUrl: photo(200_000) } : {}),
    });
    await b.commit();
  }
  for (let i = 0; i < 2000; i += 400) {
    const b = writeBatch(db);
    for (let j = i; j < i + 400; j++) b.set(doc(db, 'stock_movements', `WS-${100000 + j}_0`), { id: `WS-${100000 + j}_0`, productId: `prod-${j % N}`, sku: 'x', delta: -1, reason: 'order', createdAt: new Date(Date.UTC(2026, 0, 1) + j * 1800e3).toISOString() });
    await b.commit();
  }
  const b6 = writeBatch(db);
  for (let i = 0; i < N; i++) b6.set(doc(db, 'product_costs', `prod-${i}`), { costPrice: 4000 });
  for (let i = 0; i < 40; i++) { b6.set(doc(db, 'support_threads', `u${i}`), { threadId: `u${i}`, status: 'open', updatedAt: 1 }); b6.set(doc(db, 'support_status', `u${i}`), { status: 'open', updatedAt: 1 }); }
  await b6.commit();
});
log(`Засев: ${N} товаров, товар ≈ ${kb(productBytes[0])} (3 фото по ${kb(PHOTO)}), ${((Date.now() - t) / 1000).toFixed(0)} с`);

// ---------- A. guest visit: the subscriptions of App.tsx:428-503 ----------
async function snapshotOnce(db, q) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const unsub = onSnapshot(q, (s) => {
      if (s.metadata.fromCache && s.empty) return;
      const docs = s.docs ? s.docs : [s];
      const bytes = docs.reduce((a, d) => a + (d.exists?.() === false ? 0 : size(d.data())), 0);
      unsub(); resolve({ n: s.docs ? s.size : 1, bytes, ms: Date.now() - t0 });
    }, reject);
  });
}
const guestQueries = {
  products: collection(guest, 'products'), reviews: collection(guest, 'reviews'), review_votes: collection(guest, 'review_votes'),
  promos: collection(guest, 'promos'), 'settings/server': doc(guest, 'settings', 'server'), 'settings/storefront': doc(guest, 'settings', 'storefront'),
  banners: collection(guest, 'banners'), delivery_methods: collection(guest, 'delivery_methods'), pickup_points: collection(guest, 'pickup_points'),
};
log('\n## Визит гостя (подписки App.tsx:428-503)');
log('| Что | Документов (= чтений) | Объём | Время до ответа |');
let gN = 0, gB = 0;
for (const [name, q] of Object.entries(guestQueries)) {
  const r = await snapshotOnce(guest, q); gN += r.n; gB += r.bytes;
  log(`| ${name} | ${r.n} | ${kb(r.bytes)} | ${r.ms} мс |`);
}
log(`| **Итого гость** | **${gN}** | **${mb(gB)}** | |`);

// ---------- B. admin opening the site (App.tsx:509-521, 562-566) ----------
log('\n## Администратор открыл сайт (сверх гостевого)');
const adminQueries = {
  'orders (все)': collection(owner, 'orders'), 'users (все)': collection(owner, 'users'), customer_notes: collection(owner, 'customer_notes'),
  product_costs: collection(owner, 'product_costs'), 'chat_messages limit(500)': query(collection(owner, 'chat_messages'), limit(500)),
};
let aN = 0, aB = 0;
for (const [name, q] of Object.entries(adminQueries)) {
  const r = await snapshotOnce(owner, q); aN += r.n; aB += r.bytes;
  log(`| ${name} | ${r.n} | ${kb(r.bytes)} | ${r.ms} мс |`);
}
log(`| **Итого админ сверх гостя** | **${aN}** | **${mb(aB)}** | |`);
const tabQueries = {
  'stock_movements desc limit 500 («Склад»)': query(collection(owner, 'stock_movements'), orderBy('createdAt', 'desc'), limit(500)),
  'support_threads («Поддержка»)': collection(owner, 'support_threads'),
};
for (const [name, q] of Object.entries(tabQueries)) { const r = await snapshotOnce(owner, q); log(`| ${name} | ${r.n} | ${kb(r.bytes)} | ${r.ms} мс |`); }

// chat order check (old finding 27, side check)
const chat = await getDocs(query(collection(owner, 'chat_messages'), limit(500)));
log(`\nЧат админа limit(500): первый ${chat.docs[0].id}, последний ${chat.docs.at(-1).id}; самое новое в базе msg-${1700000000000 + 599 * 60000} ${chat.docs.some((d) => d.id === `msg-${1700000000000 + 599 * 60000}`) ? 'видно' : 'НЕ видно'}`);

// ---------- C. backup: exportDatabase reads every collection as admin ----------
const BACKUP = ['products', 'product_costs', 'promos', 'settings', 'banners', 'delivery_methods', 'pickup_points', 'orders', 'users', 'customer_notes', 'admins', 'reviews', 'review_votes', 'chat_messages', 'support_threads', 'support_status', 'stock_movements'];
let bN = 0, bB = 0; const failed = [];
for (const name of BACKUP) {
  try { const s = await getDocs(collection(owner, name)); bN += s.size; bB += s.docs.reduce((a, d) => a + size(d.data()), 0); }
  catch (e) { failed.push(`${name}: ${e.code}`); }
}
log(`\n## Копия базы: ${bN} чтений, ${mb(bB)} JSON; не прочитано: ${failed.join(', ') || 'нет'}`);
// collections that exist in the emulator but are not in BACKUP_COLLECTIONS (check with admin-free context)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const extra of ['test']) { const s = await getDocs(collection(db, extra)); log(`вне копии: ${extra} — ${s.size} док.`); }
});

// ---------- D. batch with many photo products: request size ----------
log('\n## Пакетное изменение товаров (syncAllProductsToFirestore → setDocs, один пакет до 450 товаров)');
for (const k of [10, 25]) {
  const b = writeBatch(owner);
  let bytes = 0;
  for (let i = 0; i < k; i++) { const p = { ...mkProduct(i), price: 7777 }; bytes += size(p); b.set(doc(owner, 'products', p.id), p); }
  try { await b.commit(); log(`${k} товаров (${mb(bytes)}) одним пакетом: эмулятор ПРИНЯЛ`); }
  catch (e) { log(`${k} товаров (${mb(bytes)}) одним пакетом: ОТКАЗ ${e.code} ${String(e.message).slice(0, 160)}`); }
}

// ---------- E. stale product form overwrites a customer's stock deduction ----------
log('\n## Форма товара открыта до покупки, сохранена после');
const formSnapshot = (await getDocs(query(collection(owner, 'products'), where('id', '==', 'prod-100')))).docs[0].data(); // handleOpenEditProduct: formSkus = prod.skus
const bought = formSnapshot.skus.map((s, i) => (i === 0 ? { ...s, stock: 0 } : s));
await updateDoc(doc(alice, 'products', 'prod-100'), { skus: bought, inStock: true }); // saveStockToFirestore (покупатель)
const afterBuy = (await getDocs(query(collection(owner, 'products'), where('id', '==', 'prod-100')))).docs[0].data().skus[0].stock;
await setDoc(doc(owner, 'products', 'prod-100'), { ...formSnapshot, description: 'Новый текст' }); // AdminProductsTab:559-576 → setDocs (batch.set)
const afterSave = (await getDocs(query(collection(owner, 'products'), where('id', '==', 'prod-100')))).docs[0].data().skus[0].stock;
log(`остаток варианта: до покупки 5 → после покупки ${afterBuy} → после «Сохранить» в форме ${afterSave}`);

writeFileSync(process.env.OUT || 'probe.out.txt', out.join('\n') + '\n');
await env.cleanup();
process.exit(0);
