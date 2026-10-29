/**
 * Server-side order placement: prices, delivery fee, promo discount and stock are
 * taken from Firestore — never from the client — and applied in one transaction.
 */
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { CartItem, DeliveryMethod, Order, Product, ProductSKU, PromoCode, StorefrontSettings } from '../../src/types';
import {
  initialPaymentStatus,
  STORE_PAUSED_TEXT,
  storeAcceptsOrders,
  type PlaceOrderItem,
  type PlaceOrderRequest,
} from '../../src/shared/orderApi';
import { formatOrderDate } from '../../src/shared/orderDate';
import { orderProductIds, toOrderLineProduct } from '../../src/shared/orderLine';
import { expandPackLines, ORDER_LINES_MAX, packLineProblems } from '../../src/shared/packLines';
import { productSizePacks, sameColor, sizePackColors } from '../../src/shared/sizePacks';
import { ADDRESS_PART_KEYS, cleanAddressParts, fullName, type AddressParts } from '../../src/shared/personName';
import {
  QUICK_ORDER_DELIVERY_ID,
  QUICK_ORDER_DELIVERY_TITLE,
  calcOrderTotals,
  getAvailableDeliveryMethods,
  promoSignInProblem,
  toPricingLine,
  validatePromo,
  type PricingLine,
} from '../../src/shared/orderPricing';
import { brokenPackExcess, goesBrokenPack, isBrokenPackLine, priceCartLines, saleChannelOf, wholesaleLineProblems } from '../../src/shared/wholesalePricing';
import { extractColorName, extractSizeName, generateDefaultSKUs, getOrderableStock, isHiddenFromSale, skuCodeForLine } from '../../src/utils/inventory';
import { orderStockMovements, STOCK_MOVEMENTS_COLLECTION } from '../../src/shared/stockMovements';
import { deliveryKindOfMethod, estimatedDeliveryOf, initialStatusLog, type DeliveryKind } from '../../src/shared/orderFlow';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages } from '../../src/utils/deliveryStages';
import { buildOrderCostDoc, ORDER_COSTS_COLLECTION } from '../../src/utils/orderCosts';

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
const ORDER_ID_RE = /^[A-Za-z0-9-]{1,40}$/;

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
      ...(item.wholesale === true ? { wholesale: true } : {}),
      ...(item.broken === true ? { broken: true } : {}),
      ...(typeof item.packId === 'string' && item.packId.trim() ? { packId: requireString(item.packId, 'ростовка', 64) } : {}),
    };
  });

  const contact = (raw.contact || {}) as Record<string, unknown>;
  const promoCode = requireString(raw.promoCode, 'промокод', 64, false).toUpperCase();
  const orderId = requireString(raw.orderId, 'номер заказа', 40, false);
  if (orderId && !ORDER_ID_RE.test(orderId)) {
    throw new OrderError('invalid-argument', 'Некорректное поле: номер заказа');
  }

  return {
    ...(orderId ? { orderId } : {}),
    items,
    deliveryMethodId: requireString(raw.deliveryMethodId, 'способ доставки', 64),
    deliveryAddress: requireString(raw.deliveryAddress, 'адрес доставки', 1000),
    paymentMethod: requireString(raw.paymentMethod, 'способ оплаты', 128),
    ...(promoCode ? { promoCode } : {}),
    contact: {
      name: requireString(contact.name, 'имя', 128),
      phone: requireString(contact.phone, 'телефон', 64),
      email: requireString(contact.email, 'email', 256, false),
      lastName: requireString(contact.lastName, 'фамилия', 60, false) || undefined,
      firstName: requireString(contact.firstName, 'имя', 60, false) || undefined,
      middleName: requireString(contact.middleName, 'отчество', 60, false) || undefined,
    },
    addressParts: parseAddressParts(raw.addressParts),
  };
}

/** Parts of the delivery address (admin card): only known text fields of sane length */
function parseAddressParts(value: unknown): AddressParts | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const parts: AddressParts = {};
  for (const key of ADDRESS_PART_KEYS) {
    const text = requireString(source[key], 'адрес', key === 'comment' ? 300 : 120, false);
    if (text) parts[key] = text;
  }
  return cleanAddressParts(parts);
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
 * or null for guest checkout. `signedInWithGoogle` defaults to `Boolean(customerUid)` when not explicitly passed.
 */
export async function placeOrderCore(
  db: Firestore,
  request: PlaceOrderRequest,
  customerUid: string | null,
  now: Date = new Date(),
  signedInWithGoogle: boolean = Boolean(customerUid)
): Promise<Order> {
  const isQuickOrder = request.deliveryMethodId === QUICK_ORDER_DELIVERY_ID;
  if (isQuickOrder && request.promoCode) {
    throw new OrderError('invalid-argument', 'Промокод нельзя применить к заказу в 1 клик');
  }

  const productIds = [...new Set(request.items.map((i) => i.productId))];
  const productRefs = productIds.map((id) => db.collection('products').doc(id));
  const costRefs = productIds.map((id) => db.collection('product_costs').doc(id));

  return db.runTransaction(async (tx) => {
    // ---- Reads (all reads must happen before any write) ----
    if (request.orderId && ORDER_ID_RE.test(request.orderId)) {
      const existingSnap = await tx.get(db.collection('orders').doc(request.orderId));
      if (existingSnap.exists) {
        const existingOrder = existingSnap.data() as Order;
        if (customerUid && existingOrder.customerUid === customerUid) {
          const { updatedAt: _u, ...cleanOrder } = existingOrder as Order & { updatedAt?: unknown };
          return cleanOrder as Order;
        }
      }
    }

    const productSnaps = await tx.getAll(...productRefs);
    const costSnaps = await tx.getAll(...costRefs);
    const products = new Map<string, { ref: DocumentReference; data: Product }>();
    const productCosts = new Map<string, number>();
    productSnaps.forEach((snap, idx) => {
      if (!snap.exists) {
        throw new OrderError('not-found', `Товар ${productIds[idx]} больше не продается`);
      }
      const data = { ...(snap.data() as Product), id: snap.id };
      products.set(snap.id, { ref: productRefs[idx], data });
      if (typeof data.costPrice === 'number' && Number.isFinite(data.costPrice) && data.costPrice >= 0) {
        productCosts.set(snap.id, data.costPrice);
      }
    });
    costSnaps.forEach((snap, idx) => {
      if (!snap.exists) return;
      const rawCost = snap.data()?.costPrice;
      if (typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0) {
        productCosts.set(productIds[idx], rawCost);
      }
    });

    const settingsSnap = await tx.get(db.collection('settings').doc('storefront'));
    const settings = (settingsSnap.exists ? settingsSnap.data() : undefined) as StorefrontSettings | undefined;
    // «Технические работы» in «Витрина»: no orders, also not from a page opened before the switch
    if (!storeAcceptsOrders(settings)) {
      throw new OrderError('failed-precondition', `${STORE_PAUSED_TEXT}. Напишите в чат поддержки.`);
    }

    let promo: { ref: DocumentReference; data: PromoCode } | null = null;
    if (request.promoCode) {
      const promoSnap = await tx.get(db.collection('promos').where('code', '==', request.promoCode).limit(1));
      if (promoSnap.empty) {
        throw new OrderError('not-found', 'Промокод не найден');
      }
      const doc = promoSnap.docs[0];
      promo = { ref: doc.ref, data: { ...(doc.data() as PromoCode), id: doc.id } };
    }

    let orderRef =
      request.orderId && ORDER_ID_RE.test(request.orderId)
        ? db.collection('orders').doc(request.orderId)
        : db.collection('orders').doc(randomOrderId());
    for (let attempt = 0; (await tx.get(orderRef)).exists; attempt++) {
      if (attempt >= 3) throw new Error('Could not allocate a unique order id');
      orderRef = db.collection('orders').doc(randomOrderId());
    }

    let deliveryMethods: DeliveryMethod[] = [];
    if (!isQuickOrder) {
      const methodsSnap = await tx.get(db.collection('delivery_methods'));
      deliveryMethods = methodsSnap.docs.map((d) => ({ ...(d.data() as DeliveryMethod), id: d.id }));
    }

    // ---- Lines, stock check ----
    const lines: PricingLine[] = [];
    const cartItems: CartItem[] = [];
    const requestedBySku = new Map<string, Map<string, number>>(); // productId -> skuKey -> qty

    request.items.forEach((item, idx) => {
      const product = products.get(item.productId)!.data;
      // «Снят с витрины» in the admin: not for sale even though stock is left
      if (isHiddenFromSale(product)) {
        throw new OrderError('failed-precondition', `Товар «${product.title}» больше не продается`);
      }
      if (item.packId) {
        // a size pack: only a pack the product has, in one of its colours; sizes and price come from the product
        // a product «Только в розницу» keeps its packs but does not sell them, as on the site (audit 29.10, finding 17)
        const pack = saleChannelOf(product) === 'retail' ? undefined : productSizePacks(product).find((p) => p.id === item.packId);
        if (!pack || !sizePackColors(product, pack).some((c) => sameColor(c, item.color))) {
          throw new OrderError('failed-precondition', `Ростовка товара «${product.title}» больше не продаётся`);
        }
        cartItems.push({
          id: `cart-${idx + 1}`,
          // the pack is priced from the product's packs; the order line keeps the light copy (removed below)
          product: { ...toOrderLineProduct(product), sizePacks: product.sizePacks },
          selectedColor: item.color,
          selectedSize: '',
          quantity: item.quantity,
          priceKind: 'pack',
          packId: item.packId,
        });
        return;
      }
      if (item.broken === true) {
        if (!goesBrokenPack(product, item.color, item.size, (sz) => getOrderableStock(product, item.color, sz, false))) {
          throw new OrderError(
            'failed-precondition',
            `«${product.title}» (${item.color}, ${item.size}): больше не продаётся как разбитая упаковка`
          );
        }
      }
      cartItems.push({
        id: `cart-${idx + 1}`,
        product: toOrderLineProduct(product),
        selectedColor: item.color,
        selectedSize: item.size,
        quantity: item.quantity,
        ...(item.broken === true
          ? { priceKind: 'broken' as const }
          : item.wholesale === true
          ? { priceKind: 'wholesale' as const }
          : {}),
      });
    });

    // a broken pack sells only the pieces left above whole packs, summed over the variant's lines (review 16.10, finding 1)
    const brokenExcess = brokenPackExcess(
      request.items
        .filter((item) => item.broken === true && products.has(item.productId))
        .map((item) => ({
          product: products.get(item.productId)!.data,
          color: item.color,
          size: item.size,
          quantity: item.quantity,
        }))
    );
    if (brokenExcess.length > 0) {
      throw new OrderError(
        'failed-precondition',
        brokenExcess.map((e) => `«${e.product.title}» (${e.color}, ${e.size}): разбитой упаковкой — не больше ${e.pieces} шт.`).join('; ')
      );
    }

    const effectiveWholesale = settings?.brokenPackDiscount
      ? { ...settings.wholesale, brokenPackDiscount: settings.brokenPackDiscount }
      : settings?.wholesale;

    // Prices of the lines: retail — the product's price, wholesale — the wholesale price minus the volume step of «Опт»,
    // broken pack — wholesale minus brokenPackDiscount, a size pack — its own price; the browser never sends a price
    const pricedItems = priceCartLines(cartItems, effectiveWholesale);
    const wholesaleProblems = [...wholesaleLineProblems(pricedItems, effectiveWholesale), ...packLineProblems(pricedItems)];
    if (wholesaleProblems.length > 0) {
      throw new OrderError('failed-precondition', wholesaleProblems.join('; '));
    }
    // a pack becomes a line per size (stage 19): stock, the journal and the order work line by line
    const orderLines = expandPackLines(pricedItems).map((line) => {
      const { sizePacks: _packs, ...lineProduct } = line.product;
      const { packSizes: _sizes, packUnavailable: _gone, ...rest } = line;
      return { ...rest, product: lineProduct as Product };
    });
    if (orderLines.length > ORDER_LINES_MAX) {
      throw new OrderError('invalid-argument', `Слишком много позиций в заказе: ростовка — строка на каждый размер (максимум ${ORDER_LINES_MAX})`);
    }
    cartItems.splice(0, cartItems.length, ...orderLines);
    lines.push(...cartItems.map(toPricingLine));
    // a size pack or a broken pack line is never a preorder (owner's decision 12.10): its sizes must be in stock
    const noPreorderKeys = new Set<string>();
    for (const line of cartItems) {
      const perProduct = requestedBySku.get(line.product.id) ?? new Map<string, number>();
      const key = skuKey(line.selectedColor, line.selectedSize);
      perProduct.set(key, (perProduct.get(key) ?? 0) + line.quantity);
      requestedBySku.set(line.product.id, perProduct);
      if (line.packGroup || isBrokenPackLine(line)) noPreorderKeys.add(`${line.product.id}|${key}`);
    }

    const stockUpdates: { ref: DocumentReference; skus: ProductSKU[] }[] = [];
    // Admin → «Витрина» → «Предзаказ»: a sold-out variant is ordered without taking it from stock
    const preorderMode = settings?.isPreorderMode === true;
    const preorderKeys = new Set<string>(); // productId|skuKey
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
        if (preorderMode && sku.stock <= 0 && !noPreorderKeys.has(`${productId}|${key}`)) {
          preorderKeys.add(`${productId}|${key}`);
          continue;
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
    for (const item of cartItems) {
      if (preorderKeys.has(`${item.product.id}|${skuKey(item.selectedColor, item.selectedSize)}`)) {
        item.isPreorder = true;
      }
    }

    // ---- Promo & delivery ----
    if (promo) {
      const signInProblem = promoSignInProblem(promo.data, signedInWithGoogle);
      if (signInProblem) throw new OrderError('failed-precondition', signInProblem);
      const promoError = validatePromo(promo.data, lines, now.getTime());
      if (promoError) throw new OrderError('failed-precondition', promoError);
    }

    let deliveryTitle = QUICK_ORDER_DELIVERY_TITLE;
    let deliveryFee = 0;
    let deliveryKind: DeliveryKind | undefined;
    let estimatedDelivery: string | undefined;
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
      deliveryKind = deliveryKindOfMethod(method);
      estimatedDelivery = estimatedDeliveryOf(method);
    }

    const totals = calcOrderTotals(lines, promo?.data, deliveryFee);

    // ---- Order document (same shape as orders created by the storefront) ----
    const paymentStatus = initialPaymentStatus(request.paymentMethod);

    const orderBase: Order = {
      id: orderRef.id,
      date: formatOrderDate(now),
      createdAt: now.toISOString(),
      items: cartItems,
      // the review rule checks «Покупка подтверждена» by it (ревью 11.10, находка 2)
      productIds: orderProductIds(cartItems),
      status: 'accepted',
      totalPrice: totals.total,
      deliveryAddress: request.deliveryAddress,
      deliveryMethod: deliveryTitle,
      deliveryFee: totals.deliveryFee,
      discountAmount: totals.discount,
      promoCode: promo?.data.code,
      customerName: fullName(request.contact) || request.contact.name,
      customerLastName: request.contact.lastName,
      customerFirstName: request.contact.firstName,
      customerMiddleName: request.contact.middleName,
      customerPhone: request.contact.phone,
      customerEmail: request.contact.email || undefined,
      customerUid: customerUid ?? undefined,
      paymentMethod: request.paymentMethod,
      paymentStatus,
      deliveryAddressParts: request.addressParts,
      estimatedDelivery,
      deliveryKind,
      statusLog: initialStatusLog(now),
      placedVia: 'server',
    };
    const order: Order = stripUndefined({
      ...orderBase,
      historySteps: getDefaultHistorySteps(orderBase),
      deliveryStages: getSynchronizedDeliveryStages(orderBase),
    });

    // ---- Writes ----
    // updatedAt — the server's time of the write, as every write of an order (docs/orders-scale-plan.md, stage 2)
    tx.create(orderRef, { ...order, updatedAt: FieldValue.serverTimestamp() });
    for (const { ref, skus } of stockUpdates) {
      tx.update(ref, { skus, inStock: skus.some((s) => s.stock > 0) });
    }
    // The owner sees the write-off in «Склад и SKU» → «Журнал движений»
    const catalog = [...products.values()].map((p) => p.data);
    for (const movement of orderStockMovements(order, now, (line) => skuCodeForLine(catalog, line))) {
      tx.create(db.collection(STOCK_MOVEMENTS_COLLECTION).doc(movement.id), stripUndefined(movement));
    }
    if (promo) {
      // the percent is not made up (owner's decision 02.10, finding 47): without it — no commission
      const commissionPercent = promo.data.partnerCommissionPercent || 0;
      tx.update(promo.ref, stripUndefined({
        usedCount: (promo.data.usedCount || 0) + 1,
        lastOrderId: order.id,
        generatedRevenue: (promo.data.generatedRevenue || 0) + totals.total,
        commissionEarned: promo.data.isReferral
          ? (promo.data.commissionEarned || 0) + Math.round((totals.total * commissionPercent) / 100)
          : promo.data.commissionEarned,
      }));
      tx.set(db.collection('promo_uses').doc(order.id), {
        orderId: order.id,
        promoId: promo.ref.id,
        createdAt: now.toISOString(),
      });
    }
    const costDoc = buildOrderCostDoc(order, productCosts, now);
    if (costDoc) {
      tx.create(db.collection(ORDER_COSTS_COLLECTION).doc(order.id), stripUndefined(costDoc));
    }

    return order;
  });
}
