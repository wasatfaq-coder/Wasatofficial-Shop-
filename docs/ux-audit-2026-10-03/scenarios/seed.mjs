// node seed.mjs [empty]  — only into own emulator (8580, demo-ux)
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8580';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/user/Wasatofficial-Shop-/functions/package.json');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const U = '/tmp/claude-0/-home-user-Wasatofficial-Shop-/2b208f14-8bf5-5160-a59d-115c60d1396c/scratchpad/audit/ux';
const cfg = JSON.parse(fs.readFileSync(U + '/app/firebase-applet-config.json'));
if (cfg.projectId !== 'demo-ux') throw new Error('not demo project');
const DB = cfg.firestoreDatabaseId;
await fetch(`http://127.0.0.1:8580/emulator/v1/projects/demo-ux/databases/${DB}/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9590/emulator/v1/projects/demo-ux/accounts`, { method: 'DELETE' });
if (process.argv[2] === 'empty') { console.log('empty db'); process.exit(0); }
const demo = JSON.parse(fs.readFileSync(U + '/demo.json'));
const { INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } = demo;
// the blazer had the shirts' category: its label hid «Рубашка» in the category chips
const PRODUCTS = demo.PRODUCTS.map((p) => (p.id === 'blazer-classic-07' ? { ...p, category: 'blazers', categoryLabel: 'Пиджак' } : p));
initializeApp({ projectId: 'demo-ux' });
const db = getFirestore(DB);
const j = (o) => JSON.parse(JSON.stringify(o));
const b = db.batch();
for (const p of PRODUCTS) { const { costPrice, reviews, ...rest } = p; b.set(db.doc('products/' + p.id), j({ ...rest, reviewsCount: 0, rating: 0 })); }
const cats = [...new Map(PRODUCTS.map((p) => [p.category, { id: p.category, name: p.categoryLabel || p.category, icon: 'shirt' }])).values()];
b.set(db.doc('settings/storefront'), {
  storeName: 'Wasat Shop', freeDeliveryThreshold: 5000, isExpressEnabled: true, isStoreOnline: true, returnPeriodDays: 14, lowStockThreshold: 3,
  phone: '+7 (495) 111-22-33', email: 'shop@example.ru', telegram: '@wasat_shop', whatsapp: '', pickupAddress: '', workingHours: '',
  categories: cats,
  paymentMethods: [
    { id: 'phone', title: 'Перевод по номеру телефона', description: 'После подтверждения менеджер пришлет номер для перевода.', isActive: true },
    { id: 'cash', title: 'Наличными или картой при получении', onDelivery: true, isActive: true },
  ],
  faqItems: [
    { id: 'q1', question: 'Как вернуть товар?', answer: 'В течение {RETURN_DAYS} дней с момента получения.', isActive: true },
  ],
});
b.set(db.doc('settings/server'), { serverOrdersEnabled: false });
INITIAL_DELIVERY_METHODS.forEach((m, i) => b.set(db.doc('delivery_methods/' + m.id), j({ ...m, sortOrder: i + 1 })));
b.set(db.doc('pickup_points/pp1'), { id: 'pp1', name: 'Пункт выдачи на Тверской', city: 'Москва', address: 'ул. Тверская, 7', schedule: '10:00–21:00', phone: '+7 (495) 111-22-33', isActive: true, isDefault: true });
b.set(db.doc('promos/p1'), { id: 'p1', code: 'WELCOME10', title: 'Первый заказ', description: 'Скидка 10% на первый заказ', discountPercent: 10, discountType: 'percent', discountValue: 10, active: true, usedCount: 3, usageLimit: 100, minOrderAmount: 0, isPublic: true });
b.set(db.doc('banners/b1'), { id: 'b1', title: 'Лен для жаркого лета', subtitle: 'Рубашки и брюки из натурального льна', btnText: 'Смотреть', image: 'https://img.test/banner-1.jpg', active: true, badge: 'Новинка', actionType: 'category', targetCategory: 'shirts', order: 0 });
const now = Date.now();
const names = ['Иван Петров', 'Сергей Иванов', 'Алексей Смирнов', 'Дмитрий Козлов', 'Андрей Новиков'];
const statuses = ['accepted', 'assembling', 'in_transit', 'delivered', 'ready'];
const line = (p, size, q) => ({ id: 'c' + p.id + size, product: { id: p.id, title: p.title, price: p.price, category: p.category, categoryLabel: p.categoryLabel, colors: p.colors, sizes: p.sizes, images: [], material: p.material || '', description: '', inStock: true, rating: 0, reviewsCount: 0 }, selectedColor: p.colors?.[0]?.name || '', selectedSize: size, quantity: q });
for (let i = 0; i < 8; i++) {
  const p0 = PRODUCTS[i % PRODUCTS.length];
  const at = new Date(now - (i * 1.6 + 0.2) * 86400000);
  const id = `WS-${10000100 + i}`;
  const status = statuses[i % statuses.length];
  b.set(db.doc('orders/' + id), j({
    id, createdAt: at.toISOString(), date: at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
    status, totalPrice: p0.price + 350, deliveryFee: 350, discountAmount: 0, deliveryAddress: 'Москва, ул. Тверская, д. 7, кв. 12', deliveryMethod: 'Курьером до двери',
    customerName: names[i % names.length], customerPhone: '+7999000112' + (i % 10), customerEmail: `buyer${i % 5}@example.ru`,
    customerUid: i % 5 ? `cust-${i % 5}` : undefined, paymentMethod: 'Перевод по номеру телефона',
    paymentStatus: status === 'delivered' ? 'paid' : 'pending',
    items: [line(p0, p0.sizes[1] || p0.sizes[0], 1)],
  }));
}
for (let u = 1; u < 5; u++) b.set(db.doc('users/cust-' + u), { uid: 'cust-' + u, name: names[u], email: `buyer${u}@example.ru`, phone: '+7999000112' + u, avatar: '', address: { street: '', city: '', postalCode: '' }, savedAddresses: [], savedCards: [], notificationsEnabled: true, createdAt: new Date(now - u * 9 * 86400000).toISOString() });
const msg = (id, sender, text, thread, name, minsAgo) => ({ id, sender, text, timestamp: '12:00', threadId: thread, threadName: name, isInternalNote: false, sentAt: new Date(now - minsAgo * 60000) });
b.set(db.doc('chat_messages/m1'), msg('m1', 'user', 'Здравствуйте! Подойдет ли размер L при росте 182 см?', 'cust-1', names[1], 50));
b.set(db.doc('chat_messages/m3'), msg('m3', 'user', 'Когда приедет мой заказ WS-10000102?', 'cust-2', names[2], 5));
await b.commit();
console.log('seeded');
process.exit(0);
