process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8280';
const { initializeApp } = require('/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/app');
const { getFirestore } = require('/home/user/Wasatofficial-Shop-/functions/node_modules/firebase-admin/lib/firestore');
const app = initializeApp({ projectId: 'ai-studio-applet-webapp-e9574' });
const db = getFirestore(app, 'ai-studio-manstyle-2b22f2fb-6b7b-4e97-90a0-bda904528869');
const cmd = process.argv[2];
(async () => {
  if (cmd === 'seed') {
    for (const c of ['orders', 'stock_movements', 'products', 'promos']) {
      const s = await db.collection(c).get(); for (const d of s.docs) await d.ref.delete();
    }
    const base = { price: 10000, category: 'coats', categoryLabel: 'Пальто', description: 'Тест', images: [], sizes: ['M'], colors: [{ name: 'Черный', hex: '#000000' }] };
    await db.doc('products/p1').set({ ...base, id: 'p1', title: 'Пальто последнее', inStock: true,
      skus: [{ id: 'p1-Черный-M', color: 'Черный', size: 'M', stock: 1, skuCode: 'WS-P1-M' }] });
    await db.doc('products/p2').set({ ...base, id: 'p2', title: 'Пальто снятое', inStock: false,
      skus: [{ id: 'p2-Черный-M', color: 'Черный', size: 'M', stock: 2, skuCode: 'WS-P2-M' }] });
    await db.doc('settings/storefront').set({ storeName: 'Тест', categories: [{ id: 'coats', name: 'Пальто', icon: 'other' }],
      paymentMethods: [{ id: 'pay1', title: 'Перевод на карту', isActive: true }] });
    await db.doc('delivery_methods/deliv-1').set({ id: 'deliv-1', title: 'Курьер', price: 300, isActive: true, type: 'courier', duration: '1-2 дня' });
    console.log('seeded');
  } else {
    const orders = await db.collection('orders').get();
    orders.forEach((d) => { const o = d.data(); console.log('ORDER', d.id, 'total', o.totalPrice, 'items', o.items.map((i) => `${i.product.id}×${i.quantity}${i.isPreorder ? '(пред)' : ''}`).join(',')); });
    for (const id of ['p1', 'p2']) { const p = (await db.doc(`products/${id}`).get()).data(); console.log('PRODUCT', id, 'inStock', p.inStock, 'stock', p.skus.map((s) => s.stock).join(',')); }
    const mv = await db.collection('stock_movements').get();
    mv.forEach((d) => console.log('MOVE', d.id, d.data().productId, d.data().changeQuantity));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
