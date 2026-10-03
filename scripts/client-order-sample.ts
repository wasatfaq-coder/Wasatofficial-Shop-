// Образцы заказа из браузера для теста правил (аудит 02.10, находка 22): тест пишет то, что собирает buildClientOrder,
// а не рукописную заготовку. Запускается перед `bun run test:rules`, пишет tests/.generated/client-orders.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildClientOrder } from '../src/utils/clientOrder';
import { toOrderLineProduct } from '../src/shared/orderLine';
import type { CartItem, Product } from '../src/types';

const product = {
  id: 'p1', title: 'Пальто', price: 10000, originalPrice: 12000, category: 'coats', categoryLabel: 'Пальто',
  material: 'Шерсть', colors: ['Черный'], sizes: ['M'], images: ['data:image/png;base64,AAAA'], description: 'Текст',
  skus: [{ id: 'p1-m', color: 'Черный', size: 'M', stock: 3 }], inStock: true,
} as unknown as Product;
const items: CartItem[] = [{ id: 'cart-1', product: { ...toOrderLineProduct(product), images: [] }, quantity: 1, selectedColor: 'Черный', selectedSize: 'M' }];
const placedAt = new Date('2026-10-03T12:00:00.000Z');

// every optional field filled: a field the rules do not know fails the test
const full = buildClientOrder({
  id: 'WS-SAMPLE-FULL', placedAt, items, totalPrice: 9350, deliveryAddress: 'Москва, ул. Тверская, 7, кв. 1',
  deliveryMethod: 'Курьер', method: { id: 'courier', type: 'courier', title: 'Курьер' },
  customerName: 'Петров Иван Сергеевич', nameParts: { lastName: 'Петров', firstName: 'Иван', middleName: 'Сергеевич' },
  customerPhone: '+79990000000', customerEmail: 'ivan@example.com', customerUid: 'SAMPLE_UID',
  addressParts: { region: 'Москва', city: 'Москва', street: 'Тверская', house: '7', apartment: '1', comment: 'Позвонить' },
  paymentMethod: 'Перевод по номеру телефона', deliveryFee: 350, discountAmount: 1000, promoCode: 'SALE',
});
// a 1-click order: no delivery choice, no promo, payment agreed later
const quick = buildClientOrder({
  id: 'WS-SAMPLE-QUICK', placedAt, items, totalPrice: 10000, deliveryAddress: 'Уточнит менеджер', deliveryMethod: 'Уточнит менеджер',
  customerName: 'Покупатель', customerPhone: '+79990000000', customerEmail: '', customerUid: 'SAMPLE_UID',
  paymentMethod: 'Уточнит менеджер', deliveryFee: 0,
});

mkdirSync('tests/.generated', { recursive: true });
// JSON drops undefined fields, as sanitizeForFirestore does before the write
writeFileSync('tests/.generated/client-orders.json', JSON.stringify({ full, quick }, null, 1));
console.log('client order samples: tests/.generated/client-orders.json');
