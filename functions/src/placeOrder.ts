/**
 * Server-side order placement: prices, delivery fee, promo discount and stock are
 * taken from Firestore — never from the client — and applied in one transaction.
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { CartItem, DeliveryMethod, Order, Product, ProductSKU, PromoCode, StorefrontSettings } from '../../src/types';
import type { PlaceOrderItem, PlaceOrderRequest } from '../../src/shared/orderApi';
import {
  QUICK_ORDER_DELIVERY_ID,
  QUICK_ORDER_DELIVERY_TITLE,
  calcOrderTotals,
  getAvailableDeliveryMethods,
  validatePromo,
  type PricingLine,
} from '../../src/shared/orderPricing';
import { INITIAL_DELIVERY_METHODS } from '../../src/data/deliveryData';
import { extractColorName, extractSizeName, generateDefaultSKUs } from '../../src/utils/inventory';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages } from '../../src/utils/deliveryStages';

export type OrderErrorCode = 'invalid-argument' | 'failed-precondition' | 'not-found';

/** Errors with a user-facing (Russian) message, mapped to HttpsError by the handler. */
export class OrderError extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;

function requireString(value: unknown, field: string, maxLength: number, required = true): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new OrderError('invalid-argument', `Не заполнено поле: ${field}`);
    return '';
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new OrderError('invalid-argument', `Некорректное поле: ${field}`);
  }
  return value.trim();
}

/** Validates and normalizes the untrusted callable payload. */
export function parsePlaceOrderRequest(data: unknown): PlaceOrderRequest {
  if (!data || typeof data !== 'object') {
    throw new OrderError('invalid-argument', 'Пустой запрос');
  }
  const raw = data as Record<string, unknown>;

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new OrderError('invalid-argument', 'Корзина пуста');
  }
  if (raw.items.length > MAX_ITEMS) {
    throw new OrderError('invalid-argument', `Слишком много позиций в заказе (максимум ${MAX_ITEMS})`);
  }
  const items: PlaceOrderItem[] = raw.items.map((it: unknown) => {
    const item = (it || {}) as Record<string, unknown>;
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new OrderError('invalid-argument', 'Некорректное количество товара');
    }
    return {
      productId: requireString(item.productId, 'товар', 128),
      color: requireString(item.color, 'цвет', 128, false),
      size: requireString(item.size, 'размер', 64, false),
      quantity,
    };
  });

  const contact = (raw.contact || {}) as Record<string, unknown>;
  const promoCode = requireString(raw.promoCode, 'промокод', 64, false).toUpperCase();

  return {
    items,
    deliveryMethodId: requireString(raw.deliveryMethodId, 'способ доставки', 64),
    deliveryAddress: requireString(raw.deliveryAddress, 'адрес доставки', 1000),
    paymentMethod: requireString(raw.paymentMethod, 'способ оплаты', 128),
    ...(promoCode ? { promoCode } : {}),
    contact: {
      name: requireString(contact.name, 'имя', 128),
      phone: requireString(contact.phone, 'телефон', 64),
      email: requireString(contact.email, 'email', 256, false),
    },
  };
}

function formatMoscowTime(now: Date): string {
  return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
}

function randomOrderId(): string {
  return `WS-${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
}

function skuKey(color: unknown, size: unknown): string {
  return `${extractColorName(color).trim().toLowerCase()}|${extractSizeName(size).trim().toLowerCase()}`;
}

/** Firestore rejects `undefined`; drop such fields the same way the storefront does. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Places an order atomically. `customerUid` is the caller's Firebase Auth uid,
 * or null for guest checkout.
 */
export async function placeOrderCore(
  db: Firestore,
  request: PlaceOrderRequest,
  customerUid: string | null,
  now: Date = new Date()
): Promise<Order> {
  const isQuickOrder = request.deliveryMethodId === QUICK_ORDER_DELIVERY_ID;
  if (isQuickOrder && request.promoCode) {
    throw new OrderError('invalid-argument', 'Промокод нельзя применить к заказу в 1 клик');
  }

  const productIds = [...new Set(request.items.map((i) => i.productId))];
  const productRefs = productIds.map((id) => db.collection('products').doc(id));

  return db.runTransaction(async (tx) => {
    // ---- Reads (all reads must happen before any write) ----
    const productSnaps = await tx.getAll(...productRefs);
    const products = new Map<string, { ref: DocumentReference; data: Product }>();
    productSnaps.forEach((snap, idx) => {
      if (!snap.exists) {
        throw new OrderError('not-found', `Товар ${productIds[idx]} больше не продается`);
      }
      products.set(snap.id, { ref: productRefs[idx], data: { ...(snap.data() as Product), id: snap.id } });
    });

    const settingsSnap = await tx.get(db.collection('settings').doc('storefront'));
    const settings = (settingsSnap.exists ? settingsSnap.data() : undefined) as StorefrontSettings | undefined;

    let promo: { ref: DocumentReference; data: PromoCode } | null = null;
    if (request.promoCode) {
      const promoSnap = await tx.get(db.collection('promos').where('code', '==', request.promoCode).limit(1));
      if (promoSnap.empty) {
        throw new OrderError('not-found', 'Промокод не найден');
      }
      const doc = promoSnap.docs[0];
      promo = { ref: doc.ref, data: doc.data() as PromoCode };
    }

    let orderRef = db.collection('orders').doc(randomOrderId());
    for (let attempt = 0; (await tx.get(orderRef)).exists; attempt++) {
      if (attempt >= 3) throw new Error('Could not allocate a unique order id');
      orderRef = db.collection('orders').doc(randomOrderId());
    }

    let deliveryMethods: DeliveryMethod[] = [];
    if (!isQuickOrder) {
      const methodsSnap = await tx.get(db.collection('delivery_methods'));
      deliveryMethods = methodsSnap.empty
        ? INITIAL_DELIVERY_METHODS
        : methodsSnap.docs.map((d) => ({ ...(d.data() as DeliveryMethod), id: d.id }));
    }

    // ---- Lines, stock check ----
    const lines: PricingLine[] = [];
    const cartItems: CartItem[] = [];
    const requestedBySku = new Map<string, Map<string, number>>(); // productId -> skuKey -> qty

    request.items.forEach((item, idx) => {
      const product = products.get(item.productId)!.data;
      lines.push({ productId: product.id, category: product.category, price: product.price, quantity: item.quantity });
      cartItems.push({
        id: `cart-${idx + 1}`,
        product,
        selectedColor: item.color,
        selectedSize: item.size,
        quantity: item.quantity,
      });
      const perProduct = requestedBySku.get(product.id) ?? new Map<string, number>();
      const key = skuKey(item.color, item.size);
      perProduct.set(key, (perProduct.get(key) ?? 0) + item.quantity);
      requestedBySku.set(product.id, perProduct);
    });

    const stockUpdates: { ref: DocumentReference; skus: ProductSKU[] }[] = [];
    for (const [productId, requested] of requestedBySku) {
      const { ref, data: product } = products.get(productId)!;
      const skus = product.skus && product.skus.length > 0 ? product.skus : generateDefaultSKUs(product);
      const updatedSkus = skus.map((sku) => ({ ...sku }));
      for (const [key, quantity] of requested) {
        const sku = updatedSkus.find((s) => skuKey(s.color, s.size) === key);
        const [color, size] = key.split('|');
        if (!sku) {
          throw new OrderError('invalid-argument', `Вариант «${product.title}» (${color}, ${size}) не найден`);
        }
        if (sku.stock < quantity) {
          throw new OrderError(
            'failed-precondition',
            `Недостаточно товара «${product.title}» (${sku.color}, ${sku.size}): доступно ${sku.stock} шт.`
          );
        }
        sku.stock -= quantity;
      }
      stockUpdates.push({ ref, skus: updatedSkus });
    }

    // ---- Promo & delivery ----
    if (promo) {
      const promoError = validatePromo(promo.data, lines, now.getTime());
      if (promoError) throw new OrderError('failed-precondition', promoError);
    }

    let deliveryTitle = QUICK_ORDER_DELIVERY_TITLE;
    let deliveryFee = 0;
    if (!isQuickOrder) {
      const subtotal = lines.reduce((acc, l) => acc + l.price * l.quantity, 0);
      const method = getAvailableDeliveryMethods(deliveryMethods, settings, subtotal).find(
        (m) => m.id === request.deliveryMethodId
      );
      if (!method) {
        throw new OrderError('invalid-argument', 'Выбранный способ доставки недоступен');
      }
      deliveryTitle = method.title;
      deliveryFee = method.price || 0;
    }

    const totals = calcOrderTotals(lines, promo?.data, deliveryFee);

    // ---- Order document (same shape as orders created by the storefront) ----
    const paymentStatus: Order['paymentStatus'] = request.paymentMethod.toLowerCase().includes('получении')
      ? 'paid_on_delivery'
      : 'paid';

    const orderBase: Order = {
      id: orderRef.id,
      date: `Сегодня, ${formatMoscowTime(now)}`,
      createdAt: now.toISOString(),
      items: cartItems,
      status: 'accepted',
      totalPrice: totals.total,
      deliveryAddress: request.deliveryAddress,
      deliveryMethod: deliveryTitle,
      deliveryFee: totals.deliveryFee,
      discountAmount: totals.discount,
      promoCode: promo?.data.code,
      customerName: request.contact.name,
      customerPhone: request.contact.phone,
      customerEmail: request.contact.email || undefined,
      customerUid: customerUid ?? undefined,
      paymentMethod: request.paymentMethod,
      paymentStatus,
      estimatedDelivery: 'Через 1-2 дня',
      placedVia: 'server',
    };
    const order: Order = stripUndefined({
      ...orderBase,
      historySteps: getDefaultHistorySteps(orderBase),
      deliveryStages: getSynchronizedDeliveryStages(orderBase),
    });

    // ---- Writes ----
    tx.create(orderRef, order);
    for (const { ref, skus } of stockUpdates) {
      tx.update(ref, { skus, inStock: skus.some((s) => s.stock > 0) });
    }
    if (promo) {
      const commissionPercent = promo.data.partnerCommissionPercent || 10;
      tx.update(promo.ref, stripUndefined({
        usedCount: (promo.data.usedCount || 0) + 1,
        generatedRevenue: (promo.data.generatedRevenue || 0) + totals.total,
        commissionEarned: promo.data.isReferral
          ? (promo.data.commissionEarned || 0) + Math.round((totals.total * commissionPercent) / 100)
          : promo.data.commissionEarned,
      }));
    }

    return order;
  });
}
