// Атаки на firestore.rules из обзоров рисков 30.09 и 02.10.2026 (docs/audit-2026-09-30-plan.md,
// docs/audit-2026-10-02-plan.md; пробы 02.10 — docs/audit-2026-10-02/probes/), проверки перед запуском 04.10
// (docs/audit-2026-10-04-plan.md, тесты D1–D5) и аудита агентами ECC 07.10 (docs/audit-2026-10-07-plan.md, тесты E).
// Запуск вместе с остальными тестами правил: bun run test:rules.
//
// Каждый тест записан так, как должно быть: запрос злоумышленника отклонён. Пока уязвимость открыта, тест помечен
// `todo` с номером находки и этапа плана — он выполняется, но его падение не делает CI красным. Этап, который закрывает
// уязвимость, снимает пометку `todo`, и с этого момента тест защищает от возврата дыры.
// Тесты S1 и C1 — то, что уже держит: они без пометки.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
  writeBatch,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'gunh83975@gmail.com';

let env;

const anon = () => env.unauthenticatedContext().firestore(); // посетитель без входа
const guestChat = (uid = 'anon1') =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
// Заказ из браузера — только под входом и вместе с отметкой частоты order_rate/{uid} (этап 5): так злоумышленник
// и пишет поддельный заказ — с анонимного входа, который Firebase даёт любому посетителю
const signedOrder = (db, uid, data) => {
  const batch = writeBatch(db);
  // as placeClientOrder: with the server's time of the write (docs/orders-scale-plan.md, stage 3)
  batch.set(doc(db, 'orders', data.id), { ...data, customerUid: uid, updatedAt: serverTimestamp() });
  batch.set(doc(db, 'order_rate', uid), { lastOrderAt: serverTimestamp(), orderId: data.id });
  return batch.commit();
};
const customer = (uid = 'mallory') =>
  env.authenticatedContext(uid, { email: `${uid}@gmail.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();

const product = {
  id: 'p1', title: 'Пальто', price: 10000, category: 'coats', inStock: true,
  skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 1 }],
};
const promo = {
  id: 'promo1', code: 'BLOGGER15', discountPercent: 15, usageLimit: 50, usedCount: 2, active: true,
  isReferral: true, partnerName: '@blogger', partnerCommissionPercent: 10, generatedRevenue: 20000, commissionEarned: 2000,
};

async function seed(serverOrders) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/p1'), product);
    await setDoc(doc(db, 'promos/promo1'), promo);
    await setDoc(doc(db, 'settings/quick_phrases'), { phrases: ['Внутренний шаблон ответа'] });
    await setDoc(doc(db, 'orders/WS-REAL1'), { id: 'WS-REAL1', customerUid: 'alice', customerPhone: '+79990000000', status: 'accepted' });
    if (serverOrders !== undefined) await setDoc(doc(db, 'settings/server'), { serverOrdersEnabled: serverOrders });
  });
}

before(async () => {
  // Свой projectId: в том же эмуляторе параллельно идут tests/firestore.rules.test.mjs (demo-manstyle)
  env = await initializeTestEnvironment({
    projectId: 'demo-audit-attacks',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

describe('Клиентский режим заказов (settings/server нет — так сейчас на живом сайте)', () => {
  beforeEach(() => seed(undefined));

  test('A1 посетитель без входа не может обнулить остаток и снять товар с продажи напрямую',
    async () => {
      await assertFails(updateDoc(doc(anon(), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false,
      }));
    });

  test('A2 никто, кроме администратора, не может увеличить остаток (продажа того, чего нет)',
    async () => {
      await assertFails(updateDoc(doc(customer(), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 9999 }], inStock: true,
      }));
    });

  test('A3 посетитель без входа не может раздуть товар мусорными вариантами (~900 КБ скачивает каждый покупатель)',
    async () => {
      const junk = Array.from({ length: 3000 }, (_, i) => ({ id: `x${i}`, color: 'x'.repeat(200), size: 'XL', stock: 1 }));
      await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: junk }));
    });

  test('A4 посетитель без входа не может «израсходовать» промокод и накрутить комиссию партнёра',
    async () => {
      await assertFails(updateDoc(doc(anon(), 'promos/promo1'), {
        usedCount: 1_000_000, generatedRevenue: 99_000_000, commissionEarned: 9_900_000,
      }));
    });

  test('A5 посетитель не может записать заказ на 1 ₽ с чужими ценами',
    { todo: 'находка 3 (02.10): цены строк сверяет только placeOrder (Blaze); без Blaze администратор видит «Цены не совпадают с каталогом» (этап 5)' }, async () => {
      // «Оплачен» и чужие поля (placedVia) правила не пускают, склад и журнал поддельная строка не трогает,
      // ссылку на картинку из строки экраны не показывают (orderLineImage); остаётся сумма, которую никто не сверяет.
      // Без входа заказ больше не записать (этап 5) — злоумышленник берёт анонимный вход
      await assertFails(signedOrder(guestChat('anon-a5'), 'anon-a5', {
        id: 'WS-FAKE1', status: 'accepted', totalPrice: 1, paymentStatus: 'pending', paymentMethod: 'Перевод',
        deliveryMethod: 'Курьер',
        items: [{ product: { ...product, price: 1, image: 'https://attacker.example/pixel.gif' }, quantity: 5, selectedSize: 'M' }],
        customerName: 'Иван', customerPhone: '+70000000000', deliveryAddress: 'где угодно',
      }));
    });

  test('A6 заказ с произвольными полями и мусором в строках отклоняется (иначе — спам заказами без ограничений)',
    async () => {
      await assertFails(setDoc(doc(anon(), 'orders/SPAM-1'), {
        id: 'SPAM-1', status: 'accepted', totalPrice: 0, items: [{ x: 'y'.repeat(20000) }],
      }));
    });

  test('A7 покупатель не пишет остаток напрямую: две записи по одному снимку затирали друг друга',
    async () => {
      // Теперь списание — транзакция по строке заказа (deductOrderLineStock). Что оба заказа на последний товар
      // принимаются, — находка 4 (02.10, этап 2: оформление сверяет остаток) и серверные заказы (этап 5).
      await assertFails(updateDoc(doc(customer('alice'), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false,
      }));
    });
});

describe('Клиентский режим — пробы 02.10 (docs/audit-2026-10-02-plan.md)', () => {
  beforeEach(() => seed(undefined));

  const fakeOrder = (id, items) => signedOrder(guestChat(`anon-${id}`), `anon-${id}`, {
    id, status: 'accepted', totalPrice: 1, paymentStatus: 'pending', paymentMethod: 'Перевод', deliveryMethod: 'Курьер',
    items, customerName: 'Администратор', customerPhone: '+70000000000', deliveryAddress: 'где угодно',
  });

  test('A8 промокод без заказа не «сжигается»: 48 записей по +1 не исчерпают лимит и не начислят партнёру комиссию (находка 2)',
    async () => {
      await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 3 }));
      await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 3, commissionEarned: 1_000_000 }));
      await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: increment(1), lastOrderId: 'WS-REAL1' }));
    });

  test('A9 журнал склада не подделать: «приход +500, Администратор» по поддельному заказу (находка 8)',
    async () => {
      await assertSucceeds(fakeOrder('WS-FAKE9', [{ product: { id: 'p1', title: 'Пальто', price: 1 }, quantity: -500, selectedColor: 'Черный', selectedSize: 'M' }]));
      await assertFails(setDoc(doc(anon(), 'stock_movements/WS-FAKE9_0'), {
        id: 'WS-FAKE9_0', createdAt: 'x', date: 'x', type: 'order', orderId: 'WS-FAKE9', lineIndex: 0, skuIndex: 0,
        productId: 'p1', productTitle: 'Пальто', skuCode: '', color: 'Черный', size: 'M', changeQuantity: 500,
        reason: 'Заказ #WS-FAKE9', operator: 'Администратор',
      }));
    });

  test('A12 заказ без входа не записать, а с одного входа — не чаще раза в 30 с (спам заказами, этап 5 без Blaze)',
    async () => {
      const order = (id) => ({
        id, status: 'accepted', totalPrice: 100, paymentStatus: 'pending', paymentMethod: 'Перевод', deliveryMethod: 'Курьер',
        items: [{ product: { id: 'p1', title: 'Пальто', price: 100 }, quantity: 1, selectedSize: 'M' }],
        customerName: 'Иван', customerPhone: '+70000000000', deliveryAddress: 'Москва',
      });
      await assertFails(setDoc(doc(anon(), 'orders/WS-SPAM0'), order('WS-SPAM0')));
      await assertSucceeds(signedOrder(guestChat('anon-spam'), 'anon-spam', order('WS-SPAM1')));
      await assertFails(signedOrder(guestChat('anon-spam'), 'anon-spam', order('WS-SPAM2')));
      // чужой промокод поддельным заказом без своего входа не «сжечь»
      const visitor = anon();
      const batch = writeBatch(visitor);
      batch.update(doc(visitor, 'promos/promo1'), { usedCount: increment(1), lastOrderId: 'WS-REAL1' });
      batch.set(doc(visitor, 'promo_uses/WS-REAL1'), { orderId: 'WS-REAL1', promoId: 'promo1', createdAt: 'x' });
      await assertFails(batch.commit());
    });

  test('A10 артикул и штрихкод варианта посетитель не меняет (этикетки и сканер склада, находка 1)',
    async () => {
      await assertFails(updateDoc(doc(anon(), 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 1, skuCode: 'X', barcode: '1' }], inStock: true,
      }));
    });

  test('A11 поддельный заказ не списывает товар со склада',
    { todo: 'находка 1 (02.10): закрывают только серверные заказы (Blaze); без них товар возвращает автоотмена неоплаченных (этап 5)' }, async () => {
      // Заказ из браузера записывает кто угодно, а списание по его строке правила пропускают
      await assertSucceeds(fakeOrder('WS-FAKE11', [{ product: { id: 'p1', title: 'Пальто', price: 1 }, quantity: 99, selectedColor: 'Черный', selectedSize: 'M' }]));
      const db = anon();
      const batch = writeBatch(db);
      batch.set(doc(db, 'stock_movements/WS-FAKE11_0'), {
        id: 'WS-FAKE11_0', createdAt: 'x', date: 'x', type: 'order', orderId: 'WS-FAKE11', lineIndex: 0, skuIndex: 0,
        productId: 'p1', productTitle: 'Пальто', skuCode: '', color: 'Черный', size: 'M', changeQuantity: -1,
        reason: 'Заказ #WS-FAKE11', operator: 'Покупатель',
      });
      batch.update(doc(db, 'products/p1'), {
        skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false, lastStockMovement: 'WS-FAKE11_0',
      });
      await assertFails(batch.commit());
    });
});

describe('Серверный режим заказов (serverOrdersEnabled=true) — клиентские лазейки закрыты', () => {
  beforeEach(() => seed(true));

  test('S1 остатки, промокод и заказ напрямую — отказ', async () => {
    await assertFails(updateDoc(doc(anon(), 'products/p1'), { skus: [], inStock: false }));
    await assertFails(updateDoc(doc(anon(), 'promos/promo1'), { usedCount: 999 }));
    await assertFails(setDoc(doc(anon(), 'orders/WS-X'), { id: 'WS-X', status: 'accepted', totalPrice: 1, items: [{}] }));
  });
});

describe('Оба режима', () => {
  beforeEach(() => seed(true));

  test('B1 посетитель без входа не получает список всех промокодов (личные и партнёрские, с лимитами и выручкой)',
    { todo: 'находка 10 от 30.09: проверка кода на сервере (Blaze); покупателю список уже фильтрует isPromoListed' }, async () => {
      await assertFails(getDocs(collection(anon(), 'promos')));
    });

  test('B2 посетитель без входа не читает шаблоны ответов поддержки (находка 49, этап 3)', async () => {
      // settings/server покупатель читает по замыслу: по нему сайт выбирает режим заказов
      await assertSucceeds(getDoc(doc(anon(), 'settings/server')));
      await assertFails(getDoc(doc(anon(), 'settings/quick_phrases')));
    });

  test('B3 анонимный гость чата не может записать сообщение с картинкой ~850 КБ от имени «Службы поддержки» (находки 17 и 31, этап 3)', async () => {
      const id = '0000-spam-0001'; // сортируется раньше настоящих msg-<время>, а админка берёт limit(500) без orderBy
      await assertFails(setDoc(doc(guestChat('anon1'), `chat_messages/${id}`), {
        id, sender: 'user', text: 'спам', threadId: 'anon1', isInternalNote: false,
        imageUrl: 'data:image/png;base64,' + 'A'.repeat(850_000),
        threadName: 'Служба поддержки', sentAt: serverTimestamp(),
      }));
    });

  test('B4 «Полезно» нельзя поставить несуществующему отзыву (эти голоса скачивает каждый посетитель, находка 16, этап 3)', async () => {
      await assertFails(setDoc(doc(customer('mallory'), 'review_votes/nope_victim_mallory'), {
        reviewId: 'nope_victim', productId: 'nope', uid: 'mallory',
      }));
    });

  test('B5 покупатель не пишет в свой профиль произвольные поля и ~900 КБ (админка грузит профили всех, находка 25, этап 3)', async () => {
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), {
        uid: 'mallory', name: 'x', role: 'admin', isAdmin: true, blob: 'z'.repeat(900_000),
      }));
    });

  test('C1 держит: чужой заказ, бонусы, admins, почта владельца без подтверждения, чужой чат', async () => {
    await assertFails(getDoc(doc(customer('mallory'), 'orders/WS-REAL1')));
    await assertFails(getDocs(query(collection(anon(), 'orders'))));
    await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { bonusPoints: 100000 }, { merge: true }));
    await assertFails(setDoc(doc(customer('mallory'), 'admins/mallory'), { x: 1 }));
    const fakeOwner = env.authenticatedContext('evil', { email: ADMIN_EMAIL, email_verified: false }).firestore();
    await assertFails(getDocs(collection(fakeOwner, 'orders')));
    await assertFails(getDocs(query(collection(guestChat('anon2'), 'chat_messages'),
      where('threadId', '==', 'anon1'), where('isInternalNote', '==', false))));
    await assertFails(getDocs(query(collection(guestChat('anon1'), 'chat_messages'), limit(5))));
  });
});

describe('Проверка перед запуском 04.10 (docs/audit-2026-10-04-plan.md)', () => {
  beforeEach(() => seed(undefined));

  const realOrder = (id) => ({
    id, status: 'accepted', totalPrice: 10000, paymentStatus: 'pending', paymentMethod: 'Перевод', deliveryMethod: 'Курьер',
    items: [{ product: { id: 'p1', title: 'Пальто', price: 10000 }, quantity: 1, selectedColor: 'Черный', selectedSize: 'M' }],
    customerName: 'Алиса', customerPhone: '+70000000000', deliveryAddress: 'Москва',
  });
  const lineMovement = (orderId, changeQuantity) => ({
    id: `${orderId}_0`, createdAt: 'x', date: 'x', type: 'order', orderId, lineIndex: 0, skuIndex: 0, productId: 'p1',
    productTitle: 'Пальто', skuCode: '', color: 'Черный', size: 'M', changeQuantity, reason: `Заказ #${orderId}`, operator: 'Покупатель',
  });
  const deductLine = (db, orderId) => {
    const batch = writeBatch(db);
    batch.set(doc(db, `stock_movements/${orderId}_0`), lineMovement(orderId, -1));
    batch.update(doc(db, 'products/p1'), {
      skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 0 }], inStock: false, lastStockMovement: `${orderId}_0`,
    });
    return batch.commit();
  };

  test('D1 гость не пишет фото внутрь сообщения: админка скачивает 500 последних сообщений с фото (находка 4)', async () => {
      await assertFails(setDoc(doc(guestChat('anon-d1'), 'chat_messages/d1'), {
        id: 'd1', sender: 'user', text: '', threadId: 'anon-d1', isInternalNote: false,
        imageUrl: 'data:image/png;base64,' + 'A'.repeat(410_000), sentAt: serverTimestamp(),
      }));
    });

  test('D2 профиль пишет только вход через Google и без ~900 КБ во вложенных полях (админка грузит профили всех, находка 5)', async () => {
      const big = 'x'.repeat(90_000);
      const addresses = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: big }));
      await assertFails(setDoc(doc(guestChat('anon-d2'), 'users/anon-d2'), { uid: 'anon-d2', name: 'Гость' }));
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { uid: 'mallory', savedAddresses: addresses }));
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { uid: 'mallory', bodyMeasurements: { height: big } }));
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), { uid: 'mallory', address: { street: big } }));
      // профиль, какой пишет сайт, проходит
      await assertSucceeds(setDoc(doc(customer('mallory'), 'users/mallory'), {
        uid: 'mallory', name: 'Мэллори', address: { street: '', city: '', postalCode: '' },
        savedAddresses: Array.from({ length: 10 }, (_, i) => ({
          id: `addr-${i}`, title: 'Дом', city: 'Москва', street: 'Тверская', house: '1', entrance: '2', floor: '3',
          apartment: '4', intercom: '5', postalCode: '125009', region: 'Москва', comment: 'к'.repeat(300), isDefault: i === 0,
        })),
        bodyMeasurements: {
          height: 184, weight: 94, chest: 104, waist: 95, hips: 98, fitPreference: 'regular', preferredSize: 'XL',
          russianSizeTop: '52 (XL)', russianSizeBottom: '52', heightGroup: '4-я ростовка (176–182 см)', bodyType: '4-я (Крепкое / Свободный крой)',
        },
      }));
    });

  test('D3 списание и запись журнала по строке заказа пишет только владелец заказа и не после отмены (находка 6)',
    { todo: 'находка 6 (04.10): этап 3 — гость списывает под своим входом; этап 4 — правило требует владельца заказа' }, async () => {
      await assertSucceeds(signedOrder(customer('alice'), 'alice', realOrder('WS-D3')));
      // посторонний без входа заранее пишет нулевую запись — настоящее списание по этой строке уже не пройдёт
      await assertFails(setDoc(doc(anon(), 'stock_movements/WS-D3_0'), lineMovement('WS-D3', 0)));
      await assertFails(deductLine(anon(), 'WS-D3'));
      await assertFails(deductLine(customer('mallory'), 'WS-D3'));
      await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'orders/WS-D3'), { isCancelled: true }));
      await assertFails(deductLine(customer('alice'), 'WS-D3'));
    });

  test('D4 фото в чате покупатель удаляет только своё и только 15 минут — как само сообщение (находка 8)', async () => {
      const hourAgo = Timestamp.fromMillis(Date.now() - 3_600_000);
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'chat_messages/staff-d4'), {
          id: 'staff-d4', sender: 'support', text: 'Реквизиты', threadId: 'anon-d4', isInternalNote: false, imageId: 'staff-d4', sentAt: hourAgo,
        });
        await setDoc(doc(db, 'chat_images/staff-d4'), { data: 'data:image/png;base64,AAA' });
        await setDoc(doc(db, 'chat_messages/receipt-d4'), {
          id: 'receipt-d4', sender: 'user', text: 'Чек', threadId: 'anon-d4', isInternalNote: false, imageId: 'receipt-d4',
          receiptOrderId: 'WS-1', sentAt: hourAgo,
        });
        await setDoc(doc(db, 'chat_images/receipt-d4'), { data: 'data:image/png;base64,AAA' });
      });
      await assertFails(deleteDoc(doc(guestChat('anon-d4'), 'chat_images/staff-d4')));
      await assertFails(deleteDoc(doc(guestChat('anon-d4'), 'chat_images/receipt-d4')));
    });

  test('D5 номера банковских карт в профиль не пишутся: поле сайт не использует (находка 9)', async () => {
      await assertFails(setDoc(doc(customer('mallory'), 'users/mallory'), {
        uid: 'mallory', savedCards: [{ number: '4111111111111111', cvv: '123' }],
      }));
    });
});

describe('Аудит агентами ECC 07.10 (docs/audit-2026-10-07-plan.md)', () => {
  beforeEach(() => seed(undefined));

  // «Клиенты» показывают аватар профиля владельцу: ссылка на чужой сервер выдала бы его IP и часы работы. С этапа 2
  // сайт пишет только фото Google-аккаунта или пусто, а админка показывает только такие адреса (src/utils/googleAvatar.ts)
  test('E1 аватар профиля — только фото Google-аккаунта (https://….googleusercontent.com/…) или пусто (находка 8)', async () => {
      const db = customer('mallory');
      for (const avatar of [
        'https://attacker.example/pixel.gif',
        'http://lh3.googleusercontent.com/a/x',
        'https://lh3.googleusercontent.com.attacker.example/a/x',
        'https://attacker.example/lh3.googleusercontent.com/a/x',
        'data:image/svg+xml,<svg/>',
      ]) {
        await assertFails(setDoc(doc(db, 'users/mallory'), { uid: 'mallory', name: 'Мэллори', avatar }));
      }
      await assertSucceeds(setDoc(doc(db, 'users/mallory'), { uid: 'mallory', name: 'Мэллори', avatar: 'https://lh3.googleusercontent.com/a/ACg8oc=s96-c' }));
      await assertFails(setDoc(doc(db, 'users/mallory'), { avatar: 'https://attacker.example/pixel.gif' }, { merge: true }));
      await assertSucceeds(setDoc(doc(db, 'users/mallory'), { avatar: '' }, { merge: true }));
      // старый профиль с чужой ссылкой (до правила) сохраняет остальные поля, пока аватар не меняется
      await env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), 'users/mallory'), { avatar: 'https://images.example/old.jpg' }, { merge: true }));
      await assertSucceeds(setDoc(doc(db, 'users/mallory'), { name: 'Мэллори Смит' }, { merge: true }));
    });

  // Решение владельца 08.10: код с лимитом списывает только вход Google — анонимных входов посторонний заведёт сколько
  // угодно, и по поддельному заказу с каждого он сжигал лимит. С этапа 2 сайт не применяет такой код у гостя
  // (promoSignInProblem в src/shared/orderPricing.ts)
  test('E2 лимит промокода не сжигается поддельными заказами с анонимных входов (находка 9)', async () => {
      const usePromo = (db, orderId, promoId) => {
        const batch = writeBatch(db);
        batch.update(doc(db, 'promos', promoId), { usedCount: increment(1), lastOrderId: orderId });
        batch.set(doc(db, 'promo_uses', orderId), { orderId, promoId, createdAt: '2026-10-08T12:00:00.000Z' });
        return batch.commit();
      };
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'promos/free1'), { id: 'free1', code: 'WELCOME', discountPercent: 5, usedCount: 0, active: true });
        for (const [id, uid, code] of [['WS-E2A', 'anon-e2', 'BLOGGER15'], ['WS-E2B', 'anon-e2', 'WELCOME'], ['WS-E2C', 'alice', 'BLOGGER15']]) {
          await setDoc(doc(db, 'orders', id), { id, customerUid: uid, promoCode: code, status: 'accepted', items: [], totalPrice: 1 });
        }
      });
      // promo1 (BLOGGER15) — с лимитом 50: аноним его не списывает
      await assertFails(usePromo(guestChat('anon-e2'), 'WS-E2A', 'promo1'));
      // и не через отметку кода без лимита в том же пакете: счётчик кода с лимитом поднимается только своей отметкой
      // (ревью второго PR этапа 2)
      const anon = guestChat('anon-e2');
      const sideways = writeBatch(anon);
      sideways.update(doc(anon, 'promos', 'promo1'), { usedCount: increment(1), lastOrderId: 'WS-E2B' });
      sideways.update(doc(anon, 'promos', 'free1'), { usedCount: increment(1), lastOrderId: 'WS-E2B' });
      sideways.set(doc(anon, 'promo_uses', 'WS-E2B'), { orderId: 'WS-E2B', promoId: 'free1', createdAt: '2026-10-08T12:00:00.000Z' });
      await assertFails(sideways.commit());
      // код без лимита гость списывает, как раньше; код с лимитом — покупатель со входом Google
      await assertSucceeds(usePromo(guestChat('anon-e2'), 'WS-E2B', 'free1'));
      await assertSucceeds(usePromo(customer('alice'), 'WS-E2C', 'promo1'));
    });

  // Решение владельца 08.10: имя сравнивается после нормализации — без невидимых знаков, латинские двойники кириллицей —
  // и с названием магазина из «Витрины» (isHonestName, этап 2)
  test('E3 имя в отзыве и чате не выдаёт себя за магазин похожими буквами и невидимыми знаками (находка 10)', async () => {
      const review = (authorName) => ({
        id: 'p1_mallory', productId: 'p1', uid: 'mallory', authorName, rating: 5, comment: 'Отлично',
        date: '8 октября 2026 г.', createdAt: '2026-10-08T10:00:00.000Z',
      });
      const db = customer('mallory');
      for (const name of ['Аdmin', 'Wasat​Shop', 'Wаsаt Shор', 'Адми­нистратор', 'Служба поддeржки']) {
        await assertFails(setDoc(doc(db, 'reviews/p1_mallory'), review(name)));
      }
      await assertFails(setDoc(doc(guestChat('anon-e3'), 'chat_messages/e3'), {
        id: 'e3', sender: 'user', text: 'Ваш заказ отменён, оплатите заново', threadId: 'anon-e3', isInternalNote: false,
        threadName: 'Wasat​Shop', sentAt: serverTimestamp(),
      }));
      await assertSucceeds(setDoc(doc(db, 'reviews/p1_mallory'), review('Ivan Петров')));
    });
});
