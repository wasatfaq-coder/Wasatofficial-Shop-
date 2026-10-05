// Half a year of orders after launch (docs/roadmap.md: 10+ orders a day): 1 800 orders of 900 buyers, half of them with
// a Google profile, the rest guests. Written to the emulator only (`bun run measure:admin`, docs/orders-scale-plan.md):
// the real database cannot be restored from the repository. Orders are built by the same buildClientOrder as on the
// site, then moved along their chain as the admin does, so a document weighs what a real one does
import { buildClientOrder } from '../../src/utils/clientOrder';
import { PRODUCT_COUNT, productId } from './catalog300';
import type { CartItem, Order, Product } from '../../src/types';

export const ORDER_COUNT = 1_800;
export const BUYER_COUNT = 900;
/** Buyers with a Google profile (`users/{uid}`); the rest order as guests */
export const PROFILE_COUNT = 450;
/** The latest day of the half year: orders go back from it */
const LAST_DAY = Date.parse('2026-10-03T21:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];

const LAST_NAMES = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов'];
const FIRST_NAMES = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Иван', 'Артём', 'Никита', 'Михаил', 'Егор'];
const MIDDLE_NAMES = ['Сергеевич', 'Андреевич', 'Иванович', 'Петрович', 'Олегович', 'Игоревич'];
const CITIES = ['Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск', 'Краснодар'];
const STREETS = ['Тверская', 'Ленина', 'Мира', 'Садовая', 'Советская', 'Гагарина', 'Пушкина'];
const CATEGORIES = [
  ['shirts', 'Рубашки', 'Рубашка'],
  ['tshirts', 'Футболки', 'Футболка'],
  ['polo', 'Поло', 'Поло'],
  ['trousers', 'Брюки', 'Брюки'],
  ['jackets', 'Куртки', 'Куртка'],
] as const;
const COLORS = ['Белый', 'Черный', 'Темно-синий', 'Бежевый', 'Хаки'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const METHODS = [
  { id: 'courier', type: 'courier', title: 'Курьером до двери', fee: 350 },
  { id: 'pickup', type: 'pickup', title: 'Пункт выдачи', fee: 0 },
  { id: 'post', type: 'post', title: 'Почта России', fee: 400 },
] as const;
const PAYMENTS = ['Перевод по номеру телефона', 'Наличными или картой при получении (при получении)'];

export const buyerUid = (b: number) => (b < PROFILE_COUNT ? `buyer${b}` : `guest${b}`);

interface Buyer {
  uid: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
}

const buyers: Buyer[] = Array.from({ length: BUYER_COUNT }, (_, b) => ({
  uid: buyerUid(b),
  lastName: pick(LAST_NAMES),
  firstName: pick(FIRST_NAMES),
  middleName: pick(MIDDLE_NAMES),
  phone: `+7999${String(1_000_000 + b).slice(1)}`,
  email: b < PROFILE_COUNT || rnd() < 0.5 ? `buyer${b}@example.ru` : '',
  city: pick(CITIES),
  street: pick(STREETS),
  house: String(1 + Math.floor(rnd() * 90)),
  apartment: String(1 + Math.floor(rnd() * 200)),
}));

const fullName = (b: Buyer) => `${b.lastName} ${b.firstName} ${b.middleName}`;

function line(n: number): CartItem {
  const k = Math.floor(rnd() * PRODUCT_COUNT);
  const [category, categoryLabel, noun] = CATEGORIES[k % CATEGORIES.length];
  const price = 1_990 + (k % 12) * 500;
  const color = pick(COLORS);
  const size = pick(SIZES);
  const product = {
    id: productId(k),
    title: `${noun} модель ${k + 1}`,
    price,
    originalPrice: k % 3 === 0 ? price + 1_000 : undefined,
    category,
    categoryLabel,
    material: 'Хлопок 100%',
    colors: COLORS,
    sizes: SIZES,
    images: [],
  } as unknown as Product;
  return { id: `cart-${n}`, product, quantity: rnd() < 0.85 ? 1 : 2, selectedColor: color, selectedSize: size };
}

/** The chain the admin moves an order along, with the payment and history the site writes on each step */
function moveAlong(order: Order, steps: Order['status'][], placedAt: number, paid: boolean): Order {
  const log = [...(order.statusLog ?? [])];
  steps.forEach((status, i) => log.push({ status, at: new Date(placedAt + (i + 1) * 0.6 * DAY).toISOString(), by: 'admin' }));
  return {
    ...order,
    status: steps[steps.length - 1] ?? order.status,
    statusLog: log,
    paymentStatus: paid ? 'paid' : order.paymentStatus,
    trackingNumber: steps.includes('in_transit') && order.deliveryKind === 'carrier' ? `RA${100000000 + Math.floor(rnd() * 899999999)}RU` : undefined,
  };
}

/** Orders newest first: the last three days still in work, older ones received (and paid), some cancelled */
export function orders(): Order[] {
  const out: Order[] = [];
  for (let i = 0; i < ORDER_COUNT; i++) {
    const placedAt = LAST_DAY - Math.floor((i / ORDER_COUNT) * 180 * DAY) - Math.floor(rnd() * 8) * 60 * 60 * 1000;
    const buyer = buyers[Math.floor(rnd() * BUYER_COUNT)];
    const method = pick(METHODS);
    const items = Array.from({ length: rnd() < 0.7 ? 1 : 2 }, (_, n) => line(n + 1));
    const subtotal = items.reduce((s, it) => s + it.product.price * it.quantity, 0);
    const promo = rnd() < 0.15 ? `SALE${Math.floor(rnd() * 4)}` : undefined;
    const discount = promo ? Math.round(subtotal * 0.1) : 0;
    const address = `${buyer.city}, ул. ${buyer.street}, ${buyer.house}, кв. ${buyer.apartment}`;
    let order = buildClientOrder({
      id: `WS-${String(100_000 + ORDER_COUNT - i)}`,
      placedAt: new Date(placedAt),
      items,
      totalPrice: subtotal - discount + method.fee,
      deliveryAddress: method.type === 'pickup' ? 'Пункт выдачи на Тверской, ул. Тверская, 7' : address,
      deliveryMethod: method.title,
      method: { id: method.id, type: method.type, title: method.title },
      customerName: fullName(buyer),
      nameParts: { lastName: buyer.lastName, firstName: buyer.firstName, middleName: buyer.middleName },
      customerPhone: buyer.phone,
      customerEmail: buyer.email,
      customerUid: buyer.uid,
      addressParts:
        method.type === 'pickup'
          ? undefined
          : { region: buyer.city, city: buyer.city, street: buyer.street, house: buyer.house, apartment: buyer.apartment },
      paymentMethod: pick(PAYMENTS),
      deliveryFee: method.fee,
      discountAmount: discount,
      promoCode: promo,
    });
    const ageDays = (LAST_DAY - placedAt) / DAY;
    const chain: Order['status'][] = ['assembling', 'in_transit', method.type === 'courier' ? 'delivered' : 'ready', 'delivered'];
    if (rnd() < 0.08) {
      order = {
        ...order,
        isCancelled: true,
        cancelledBy: rnd() < 0.5 ? 'customer' : 'admin',
        cancelledAt: new Date(placedAt + DAY / 4).toISOString(),
        cancelReason: 'changed_mind',
        archived: ageDays > 30 ? true : undefined,
      } as Order;
    } else if (ageDays > 3) {
      order = moveAlong(order, [...new Set(chain)], placedAt, true);
    } else {
      order = moveAlong(order, chain.slice(0, Math.floor(rnd() * 3)), placedAt, rnd() < 0.5);
    }
    out.push(order);
  }
  return out;
}

/** Google profiles of the buyers who signed in, as the site writes them (`isOwnProfileWrite`) */
export function profiles(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const b of buyers.slice(0, PROFILE_COUNT)) {
    out[`users/${b.uid}`] = {
      uid: b.uid,
      name: fullName(b),
      lastName: b.lastName,
      firstName: b.firstName,
      middleName: b.middleName,
      email: b.email,
      phone: b.phone,
      avatar: '',
      address: { street: `ул. ${b.street}`, city: b.city, postalCode: '101000', house: b.house, apartment: b.apartment },
      savedAddresses: [],
      notificationsEnabled: true,
      bonusPoints: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };
  }
  // the owner keeps notes on a few regulars (admin-only `customer_notes`)
  for (let b = 0; b < 30; b++) out[`customer_notes/${buyerUid(b)}`] = { managerNotes: 'Постоянный покупатель, звонить после 18:00', tags: ['VIP'] };
  return out;
}
