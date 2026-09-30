import { initializeApp } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/firestore/index.js';
import cfg from '/home/user/Wasatofficial-Shop-/firebase-applet-config.json';
import demo from '/tmp/claude-0/-home-user-Wasatofficial-Shop-/6ae9196d-6e10-572e-9337-53506395115c/scratchpad/current-demo.json';
const { PRODUCTS, INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } = demo as any;
initializeApp({ projectId: cfg.projectId });
const db = getFirestore(cfg.firestoreDatabaseId);
const j = (o: unknown) => JSON.parse(JSON.stringify(o));
if (process.env.EMPTY === '1') { console.log('empty db'); process.exit(0); }
const b = db.batch();
for (const p of PRODUCTS) b.set(db.doc('products/' + p.id), j(p));
const cats = [...new Map(PRODUCTS.map((p) => [p.category, { id: p.category, name: p.categoryLabel || p.category }])).values()];
b.set(db.doc('settings/storefront'), {
  storeName: 'Wasat Shop', freeDeliveryThreshold: 5000, courierDeliveryPrice: 350, isExpressEnabled: true, isStoreOnline: true, returnPeriodDays: 14,
  isStoreBannerVisible: true, storeBannerText: 'Скидка 10% на первый заказ по коду WELCOME10', bannerBadgeText: 'Акция',
  phone: '+7 (495) 111-22-33', email: 'shop@example.ru', telegram: '@wasat_shop',
  categories: cats,
  paymentMethods: [
    { id: 'phone', title: 'Перевод по номеру телефона', description: 'После подтверждения менеджер пришлет номер для перевода.', isActive: true },
    { id: 'cash', title: 'Наличными или картой при получении', onDelivery: true, isActive: true },
  ],
  faqItems: [
    { id: 'q1', question: 'Как вернуть товар?', answer: 'В течение {RETURN_DAYS} дней с момента получения.', isActive: true },
    { id: 'q2', question: 'Сколько идет доставка?', answer: 'По Москве — 1–2 дня, в регионы — 3–7 дней.', isActive: true },
  ],
  labelFormats: [{ id: 'f58x40', name: '58 × 40', widthMm: 58, heightMm: 40 }],
});
b.set(db.doc('settings/server'), { serverOrdersEnabled: false });
INITIAL_DELIVERY_METHODS.forEach((m, i) => b.set(db.doc('delivery_methods/' + m.id), j({ ...m, sortOrder: i + 1 })));
INITIAL_PICKUP_POINTS.forEach((pt) => b.set(db.doc('pickup_points/' + pt.id), j(pt)));
b.set(db.doc('promos/p1'), { id: 'p1', code: 'WELCOME10', title: 'Первый заказ', description: 'Скидка 10% на первый заказ', discountPercent: 10, discountType: 'percent', discountValue: 10, active: true, usedCount: 3, usageLimit: 100, minOrderAmount: 0, generatedRevenue: 21500 });
b.set(db.doc('promos/p2'), { id: 'p2', code: 'MINUS500', title: 'Минус 500 ₽', description: 'От 5 000 ₽', discountPercent: 0, discountType: 'fixed', discountValue: 500, active: true, usedCount: 1, minOrderAmount: 5000, generatedRevenue: 7990 });
b.set(db.doc('banners/b1'), { id: 'b1', title: 'Лен для жаркого лета', subtitle: 'Рубашки и брюки из натурального льна', btnText: 'Смотреть', image: 'https://img.test/banner-1.jpg', active: true, badge: 'Новинка', actionType: 'category', targetCategory: 'shirts', order: 0 });
b.set(db.doc('banners/b2'), { id: 'b2', title: 'Скидка 10% на первый заказ', subtitle: 'Промокод WELCOME10', btnText: 'В каталог', image: 'https://img.test/banner-2.jpg', active: true, badge: 'Акция', actionType: 'catalog', order: 1 });
const now = Date.now();
const names = ['Иван Петров', 'Сергей Иванов', 'Алексей Смирнов', 'Дмитрий Козлов', 'Андрей Новиков'];
const statuses = ['accepted', 'assembling', 'in_transit', 'delivered', 'delivered', 'delivered', 'ready'];
for (let i = 0; i < 18; i++) {
  const p0 = PRODUCTS[i % PRODUCTS.length], p1 = PRODUCTS[(i + 2) % PRODUCTS.length];
  const at = new Date(now - (i * 1.6 + 0.2) * 86400000);
  const q = 1 + (i % 2);
  const id = `WS-${10000100 + i}`;
  const status = statuses[i % statuses.length];
  b.set(db.doc('orders/' + id), j({
    id, createdAt: at.toISOString(), date: at.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    status, isCancelled: i === 5, totalPrice: p0.price * q + p1.price, deliveryAddress: 'Москва, ул. Тверская, д. 7, кв. 12', deliveryMethod: i % 3 ? 'Курьером до двери' : 'Пункт выдачи',
    deliveryFee: 0, customerName: names[i % names.length], customerPhone: '+7999000112' + (i % 10), customerEmail: `buyer${i % 5}@example.ru`,
    customerUid: i % 5 ? `cust-${i % 5}` : undefined, paymentMethod: i % 2 ? 'Перевод по номеру телефона' : 'Наличными или картой при получении (при получении)',
    paymentStatus: status === 'delivered' ? 'paid' : i % 2 ? 'paid' : 'paid_on_delivery', estimatedDelivery: 'Через 1-2 дня',
    items: [{ id: 'c1', product: p0, selectedColor: p0.colors?.[0]?.name || '', selectedSize: p0.sizes?.[0] || 'M', quantity: q },
            { id: 'c2', product: p1, selectedColor: p1.colors?.[0]?.name || '', selectedSize: p1.sizes?.[1] || p1.sizes?.[0] || 'M', quantity: 1 }],
  }));
}
for (let u = 1; u < 5; u++) b.set(db.doc('users/cust-' + u), { uid: 'cust-' + u, name: names[u], email: `buyer${u}@example.ru`, phone: '+7999000112' + u, avatar: '', address: { street: '', city: '', postalCode: '' }, savedAddresses: [], savedCards: [], notificationsEnabled: true, createdAt: new Date(now - u * 9 * 86400000).toISOString() });
const msg = (id, sender, text, thread, name, minsAgo) => ({ id, sender, text, timestamp: '12:0' + (minsAgo % 10), threadId: thread, threadName: name, isInternalNote: false, sentAt: new Date(now - minsAgo * 60000) });
b.set(db.doc('chat_messages/m1'), msg('m1', 'user', 'Здравствуйте! Подойдет ли размер L при росте 182 см?', 'cust-1', names[1], 50));
b.set(db.doc('chat_messages/m2'), msg('m2', 'admin', 'Добрый день! Да, L подойдет: посадка стандартная.', 'cust-1', names[1], 40));
b.set(db.doc('chat_messages/m3'), msg('m3', 'user', 'Когда приедет мой заказ WS-10000102?', 'cust-2', names[2], 5));
b.set(db.doc('reviews/linen-shirt-01_cust-1'), { id: 'linen-shirt-01_cust-1', productId: 'linen-shirt-01', uid: 'cust-1', authorName: 'Сергей', rating: 5, comment: 'Отличная рубашка, лен плотный, не просвечивает. Размер в размер.', pros: 'Ткань, посадка', date: '20 сент. 2026', createdAt: new Date(now - 6 * 86400000).toISOString(), sizePurchased: 'L', colorPurchased: 'Бежевый' });
await b.commit();
console.log('seeded design data');
process.exit(0);
