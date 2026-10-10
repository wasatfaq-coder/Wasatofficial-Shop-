import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  orderBy,
  writeBatch,
  updateDoc,
  serverTimestamp,
  Firestore,
  QueryDocumentSnapshot,
  Timestamp,
  WriteBatch,
  increment,
  deleteField,
  runTransaction,
  documentId,
  Bytes,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { needsOwnerAttention } from './firestoreErrors';
import { changedFields, changedSince, hasFieldChanges, orderFieldsToCheck, type FieldChanges } from './fieldChanges';
import { CartItem, Product, ProductSKU, ReviewVote, StoredReview, Order, OrderStatusHistoryStep, PromoCode, StorefrontSettings, ChatMessage, SupportThreadMeta, SupportStatus, UserProfile, BannerSlide, DeliveryMethod, PickupPoint, StockMovementLog, PaymentKind, PaymentTemplate, PriceHistoryEntry, PriceChangeLog } from '../types';
import { paymentLogEntry, receiptMessageText } from './paymentDetails';
import { DEFAULT_STOREFRONT_SETTINGS, generateDefaultSKUs, inStockAfterReturn, inStockAfterStockChange, stockMovementId } from './inventory';
import { reviewVoteDocId, withoutCollectionReviews } from './reviews';
import { splitBannerImages, type BannerImagesDoc } from './bannerImages';
import { previewsMoved, splitProductPreviews, withProductPreviews, type ProductPreviewsDoc } from './productPreviews';
import type { LegalDocId, LegalTexts } from './legalDocs';
import type { RestoreWrite } from './backupRestore';
import { hasHeavyPhotos, splitProductPhotos, type PhotoDoc } from './productPhotos';
import { compressBase64Image } from './imageUpload';
import { SERVER_CONFIG_DOC_ID, ServerConfig } from '../shared/orderApi';
import {
  adjustedOrderShortfall,
  ORDER_MOVEMENT_OPERATOR,
  orderHeldStock,
  orderLineMovement,
  orderMovementId,
  orderReturnMovementId,
  lineReturnQuantity,
  lineShortfall,
  orderReturnReason,
  STOCK_MOVEMENTS_COLLECTION,
} from '../shared/stockMovements';
import { formatOrderDate } from '../shared/orderDate';
import { cancelReasonText, formatCancelledAt } from './orderCancel';
import { DELIVERY_KINDS, type OrderStatusLogEntry } from '../shared/orderFlow';
import { isCarrierOrder } from './orderFlow';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages } from './deliveryStages';
import { CLIENT_ERRORS_COLLECTION, type ClientErrorReport, type StoredClientError } from './clientErrors';
import { trackRead } from './pendingReads';
import { googleAvatarUrl } from './googleAvatar';
import { EXCHANGE_RATES_DOC_ID, readExchangeRates, type ExchangeRates } from './currencyPricing';
import { costEntryOf, hasCostData, readCostEntry, type ProductCostEntry } from './productCosts';
export type { ProductCostEntry } from './productCosts';
import {
  CATALOG_INDEX_COLLECTION,
  PRODUCT_THUMBS_COLLECTION,
  catalogIndexPartId,
  type CatalogIndexPart,
} from './catalogIndex';

/**
 * An empty collection means the owner has not added anything yet (or removed it all).
 * Demo data from src/data is never written to the database or shown in its place.
 */

/** A batch holds at most 500 writes: longer lists are committed in parts */
const BATCH_LIMIT = 450;

async function commitInChunks<T>(items: T[], add: (batch: WriteBatch, item: T) => void, targetDb: Firestore = db) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(targetDb);
    items.slice(i, i + BATCH_LIMIT).forEach((item) => add(batch, item));
    await batch.commit();
  }
}

/** set() of every document of a list (sanitized), in parts of at most BATCH_LIMIT */
async function setDocs<T extends { id: string }>(collectionName: string, items: T[]) {
  await commitInChunks(items, (batch, item) =>
    batch.set(doc(db, collectionName, item.id), sanitizeForFirestore(item))
  );
}

/**
 * A subscription the database ended with an error (audit 07.10, finding 15). A refusal — the rules, the quota, a missing
 * index — is for the owner: `console.error` reaches «Ошибки на сайте». Anything else stays a warning.
 */
function logSubscriptionError(what: string, error: unknown) {
  if (needsOwnerAttention(error)) console.error(`${what} subscription failed:`, error);
  else console.warn(`${what} subscription warning:`, error);
}

/**
 * Items of `next` that are new or changed against `previous`. The admin lists replace only the
 * edited objects, so the rest keep their identity and are not written again.
 */
export function changedItems<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const before = new Map(previous.map((item) => [item.id, item]));
  return next.filter((item) => before.get(item.id) !== item);
}

/**
 * Deletes the documents the admin removed from a list. The list editors save the new list
 * with set() only, so without this a deleted item stayed in Firestore and came back on reload.
 */
export async function deleteRemovedDocs(
  collectionName: string,
  previous: { id: string }[],
  next: { id: string }[]
) {
  const keep = new Set(next.map((item) => item.id));
  const removed = previous.filter((item) => item.id && !keep.has(item.id));
  if (removed.length === 0) return;
  try {
    await commitInChunks(removed, (batch, item) => batch.delete(doc(db, collectionName, item.id)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, collectionName);
  }
}

/**
 * Recursively sanitizes data before writing to Firestore,
 * removing any undefined fields which Firestore setDoc/writeBatch rejects.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return undefined as unknown as T;
  }
  if (data === null) {
    return null as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

/**
 * 1. PRODUCTS SYNC
 */
export function subscribeToProducts(
  onUpdate: (products: Product[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'products');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      // Offline, Firestore answers from the (empty) local cache first: that is «no answer yet», not an empty
      // catalog — the screens keep the placeholders instead of «Товары появятся здесь»
      if (snapshot.empty && snapshot.metadata.fromCache) return;
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: Product[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as Product);
      });
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Products', error);
      if (onError) onError(error);
    }
  );
}


/**
 * Product as stored in `products`, which every visitor reads: without merged-in reviews and without the cost price,
 * the purchase and the supplier (they live in the admin-only `product_costs`).
 */
function toStoredProduct(product: Product): Product {
  const { costPrice: _cost, purchase: _purchase, supplier: _supplier, supplierSku: _supplierSku, catalogRating: _rating, ...stored } =
    withoutCollectionReviews(product);
  return stored;
}

/** Colour and size of an order line and a variant match as in inventory.ts: trimmed, case-insensitive */
const sameVariantName = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Stock of one line of a saved customer order (server orders off), in one transaction with its journal entry
 * (`stock_movements/{order}_{line}`). The rules let a customer change exactly one variant of the product — the
 * line's colour and size — by exactly the entry's quantity, once per line (audit 02.10, findings 1 and 8). The
 * product is read inside the transaction, so two orders at once do not overwrite each other's write-off.
 * Takes what is left when the stock is short (the entry says how much). Preorder lines are not taken.
 * `targetDb` is the order owner's sign-in (a guest's anonymous app). Resolves to the quantity taken; throws when the
 * write is refused.
 */
export async function deductOrderLineStock(
  orderId: string,
  line: CartItem,
  lineIndex: number,
  at: Date,
  targetDb: Firestore = db
): Promise<number> {
  if (line.isPreorder) return 0;
  const productRef = doc(targetDb, 'products', line.product.id);
  return runTransaction(targetDb, async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists()) return 0;
    const data = snap.data();
    const skus: ProductSKU[] = Array.isArray(data.skus) ? data.skus : [];
    const skuIndex = skus.findIndex(
      (sku) => sameVariantName(sku.color, line.selectedColor) && sameVariantName(sku.size, line.selectedSize)
    );
    if (skuIndex < 0) return 0;
    const sku = skus[skuIndex];
    const stockBefore = Number(sku.stock) || 0;
    const taken = Math.min(stockBefore, line.quantity);
    const movement = {
      ...orderLineMovement(orderId, line, lineIndex, at, sku.skuCode ?? '', -taken),
      color: String(sku.color ?? '').slice(0, 60),
      size: String(sku.size ?? '').slice(0, 30),
      skuIndex,
    };
    tx.set(doc(targetDb, STOCK_MOVEMENTS_COLLECTION, movement.id), sanitizeForFirestore(movement));
    if (taken > 0) {
      // The other variants are written back exactly as read: the rules compare them with the stored ones
      const nextSkus = skus.map((s, i) => (i === skuIndex ? { ...s, stock: stockBefore - taken } : s));
      tx.update(productRef, {
        skus: nextSkus,
        // «Снят с витрины» stays; otherwise the product is sold out when no variant is left
        inStock: data.inStock === false ? false : nextSkus.some((s) => (Number(s.stock) || 0) > 0),
        lastStockMovement: movement.id,
      });
    }
    return taken;
  });
}

/** Orders since this moment write a journal entry per line together with the stock (audit 02.10, stage 1) */
export const ORDER_JOURNAL_SINCE = '2026-10-02T19:03:19.000Z';

/** Lines of an order the buyer's browser did not take in full, by order id */
export interface UntakenOrderLines {
  /** No write-off entry: the buyer's connection broke or the rules refused it (audit 02.10, finding 8) */
  missing: Record<string, number[]>;
  /** The entry took less than ordered: the stock ran out — two buyers and the last piece (check 04.10, finding 3) */
  short: Record<string, { lineIndex: number; taken: number; ordered: number }[]>;
}

/**
 * Lines of new orders whose stock was not taken: an order since stage 1 has an entry `{заказ}_{строка}` for every line
 * that is not a preorder; a missing entry is a line to take, an entry that took less than ordered is goods the shop no
 * longer has. Before, only the console knew. Admin only.
 */
export async function findUntakenOrderLines(
  orders: Pick<Order, 'id' | 'items' | 'createdAt' | 'isAdjusted'>[]
): Promise<UntakenOrderLines> {
  const wanted = new Map<string, { orderId: string; lineIndex: number; line: CartItem }>();
  const result: UntakenOrderLines = { missing: {}, short: {} };
  for (const order of orders) {
    if (!order.createdAt || order.createdAt < ORDER_JOURNAL_SINCE) continue;
    if (order.isAdjusted) {
      // after «Правка состава» the lines no longer match their entries by number: by variant (audit 07.10, finding 2)
      const { missing, short } = adjustedOrderShortfall(order.items ?? [], orderHeldStock(await readOrderJournal(order.id)));
      if (missing.length > 0) result.missing[order.id] = missing;
      if (short.length > 0) result.short[order.id] = short;
      continue;
    }
    (order.items ?? []).forEach((line, i) => {
      if (!line.isPreorder) wanted.set(orderMovementId(order.id, i), { orderId: order.id, lineIndex: i, line });
    });
  }
  const ids = [...wanted.keys()];
  const found = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, STOCK_MOVEMENTS_COLLECTION), where(documentId(), 'in', ids.slice(i, i + 30))));
    snap.forEach((d) => found.set(d.id, Number(d.data().changeQuantity) || 0));
  }
  for (const [id, { orderId, lineIndex, line }] of wanted) {
    if (!found.has(id)) {
      (result.missing[orderId] ??= []).push(lineIndex);
      continue;
    }
    const changeQuantity = found.get(id) ?? 0;
    const shortBy = lineShortfall(line, { changeQuantity });
    if (shortBy > 0) (result.short[orderId] ??= []).push({ lineIndex, taken: -changeQuantity, ordered: line.quantity });
  }
  return result;
}

/** Every journal entry of an order (write-offs, «Правка состава», returns). Admin only: the rules give lists to the admin */
async function readOrderJournal(orderId: string, targetDb: Firestore = db): Promise<StockMovementLog[]> {
  const snap = await getDocs(query(collection(targetDb, STOCK_MOVEMENTS_COLLECTION), where('orderId', '==', orderId)));
  return snap.docs.map((d) => d.data() as StockMovementLog);
}

/**
 * «Списать со склада» for an order after «Правка состава»: the variants nothing was taken for (`adjustedOrderShortfall`),
 * by the ordered quantity, with journal entries of the order. Throws when a variant was not changed.
 */
export async function takeAdjustedOrderStock(order: Pick<Order, 'id' | 'items'>): Promise<void> {
  const held = orderHeldStock(await readOrderJournal(order.id));
  const { missing } = adjustedOrderShortfall(order.items ?? [], held);
  const lines = missing.map((i) => order.items[i]);
  const changes: AdminStockChange[] = lines.map((line) => ({
    productId: line.product.id,
    productTitle: line.product.title,
    color: line.selectedColor,
    size: line.selectedSize,
    delta: -line.quantity,
  }));
  const { failed } = await applyAdminStockChanges(changes, { orderId: order.id, reason: `Заказ #${order.id}`, operator: 'Администратор' });
  if (failed.length > 0) throw new Error(`Stock not taken for ${failed.length} variant(s) of order ${order.id}`);
}

/**
 * A cancelled order after «Правка состава» back to stock: what it holds by variant (`orderHeldStock`) — the lines and
 * their entries `{заказ}_{строка}` no longer match by number, so the per-line return gave back the wrong goods (audit
 * 07.10, finding 2). The return entries carry the order, so a repeated call finds nothing held and returns nothing.
 * A removed product or variant gets nothing back. Admin only; resolves to true when the whole order is back.
 */
async function returnAdjustedOrderStock(order: Pick<Order, 'id'>, operator: string, targetDb: Firestore = db): Promise<boolean> {
  const held = [...orderHeldStock(await readOrderJournal(order.id, targetDb)).values()].filter((v) => v.held > 0);
  const changes: AdminStockChange[] = held.map((v) => ({
    productId: v.productId,
    productTitle: v.productTitle,
    color: v.color,
    size: v.size,
    delta: v.held,
  }));
  const { failed } = await applyAdminStockChanges(changes, {
    orderId: order.id,
    reason: orderReturnReason(order.id),
    operator,
    missingIsNothing: true,
  }, targetDb);
  if (failed.length > 0) return false;
  await updateDoc(doc(targetDb, 'orders', order.id), { stockReturned: true, updatedAt: serverTimestamp() });
  return true;
}

/** One stock change the admin makes by an order: «+» back to stock, «−» taken from it */
export interface AdminStockChange {
  productId: string;
  productTitle?: string;
  color: string;
  size: string;
  /** By how much: the difference from the stock the admin saw (a sale meanwhile stays sold) */
  delta: number;
  /** The exact stock instead (inventory count: what is on the shelf now) */
  setTo?: number;
  /** The journal's reason for this variant (instead of the common one) */
  reason?: string;
}

/**
 * Stock changes of the admin by an order («Правка состава», restoring or cancelling a restored order), each in its own
 * transaction with its journal entry: the stock is read from the database at that moment and changed by the difference.
 * Before, the browser wrote the whole product from its copy and an order placed meanwhile came back as stock (audit
 * 02.10, finding 5 and its kin). A deduction stops at 0; «Снят с витрины» stays off sale. Returns what was not applied.
 * `targetDb` — another sign-in's database (the rules test calls this code as the admin).
 */
export async function applyAdminStockChanges(
  changes: AdminStockChange[],
  meta: { orderId?: string; reason: string; operator: string; at?: Date; missingIsNothing?: boolean },
  targetDb: Firestore = db
): Promise<{ failed: AdminStockChange[] }> {
  const at = meta.at ?? new Date();
  const failed: AdminStockChange[] = [];
  for (const change of changes) {
    if (!change.delta && change.setTo === undefined) continue;
    const productRef = doc(targetDb, 'products', change.productId);
    try {
      await runTransaction(targetDb, async (tx) => {
        const snap = await tx.get(productRef);
        if (!snap.exists()) {
          if (meta.missingIsNothing) return;
          throw new Error('product removed');
        }
        const data = snap.data();
        const savedSkus: ProductSKU[] = Array.isArray(data.skus) ? data.skus : [];
        const matches = (sku: ProductSKU) => sameVariantName(sku.color, change.color) && sameVariantName(sku.size, change.size);
        // A colour × size of the product without a saved variation (a colour added by an old CSV import) gets one here,
        // with stock 0; anything else is not a variation of this product
        const missing = savedSkus.some(matches)
          ? undefined
          : generateDefaultSKUs({ ...(data as Product), id: change.productId }).find(matches);
        if (!savedSkus.some(matches) && !missing) {
          if (meta.missingIsNothing) return;
          throw new Error('variant missing');
        }
        const skus = missing ? [...savedSkus, missing] : savedSkus;
        const skuIndex = skus.findIndex(matches);
        const sku = skus[skuIndex];
        const before = Number(sku.stock) || 0;
        const after = Math.max(0, change.setTo !== undefined ? change.setTo : before + change.delta);
        if (after === before) return;
        const nextSkus = skus.map((s, i) => (i === skuIndex ? { ...s, stock: after } : s));
        const movement: StockMovementLog = {
          id: stockMovementId(),
          createdAt: at.toISOString(),
          date: formatOrderDate(at),
          type: after > before ? (meta.orderId ? 'return' : 'receipt') : meta.orderId ? 'order' : 'writeoff',
          ...(meta.orderId ? { orderId: meta.orderId } : {}),
          productId: change.productId,
          productTitle: String(change.productTitle ?? data.title ?? '').slice(0, 200),
          skuCode: String(sku.skuCode ?? '').slice(0, 80),
          color: String(sku.color ?? '').slice(0, 60),
          size: String(sku.size ?? '').slice(0, 30),
          changeQuantity: after - before,
          previousStock: before,
          newStock: after,
          reason: change.reason ?? meta.reason,
          operator: meta.operator,
        };
        tx.set(doc(targetDb, STOCK_MOVEMENTS_COLLECTION, movement.id), sanitizeForFirestore(movement));
        tx.update(productRef, {
          skus: nextSkus,
          inStock: inStockAfterStockChange({ inStock: data.inStock, skus: savedSkus, hiddenFromSale: data.hiddenFromSale }, nextSkus),
        });
      });
    } catch (err) {
      console.error(`Stock change ${change.productId} ${change.color} ${change.size} ${change.delta} failed:`, err);
      failed.push(change);
    }
  }
  return { failed };
}

/**
 * The buyer cancels their own order (profile → order → «Отменить заказ»). The rules allow it only for a signed-in
 * order of their own in «Принят», once, with a reason; then `returnCancelledOrderStock` returns the goods.
 * Throws when the write is refused. `targetDb` — the buyer's sign-in (the rules test calls this code as the buyer).
 */
export async function cancelOrderAsCustomer(
  orderId: string,
  reason: string,
  comment: string,
  at: Date,
  targetDb: Firestore = db
): Promise<void> {
  await updateDoc(doc(targetDb, 'orders', orderId), {
    isCancelled: true,
    cancelledBy: 'customer',
    cancelReason: reason,
    ...(comment ? { cancelComment: comment } : {}),
    cancelledAt: at.toISOString(),
    estimatedDelivery: 'Заказ отменен',
    stockReturned: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * «Я получил заказ» (заказ у транспортной компании или Почты, «Доработки 4»): «Получен» и запись покупателя в истории.
 * Правило `isCustomerReceiptConfirm` пускает только это. Throws when the write is refused.
 */
export async function confirmOrderReceipt(
  order: Pick<Order, 'id' | 'statusLog'>,
  at: Date,
  targetDb: Firestore = db
): Promise<void> {
  const entry: OrderStatusLogEntry = { status: 'delivered', at: at.toISOString(), by: 'customer' };
  await updateDoc(doc(targetDb, 'orders', order.id), {
    status: 'delivered',
    statusLog: [...(order.statusLog ?? []), entry],
    updatedAt: serverTimestamp(),
  });
}

/**
 * «Оплачено» с фото чека («Доработки 5»): сначала сообщение в чат заказа (фото и «Клиент прикрепил подтверждение
 * оплаты к заказу № …»), потом заказ — «Чек на проверке» со ссылкой на это сообщение и записью в истории оплаты.
 * Правило `isCustomerReceiptSubmit` пускает только эти поля и только при сообщении покупателя. Throws when refused.
 */
export async function submitPaymentReceipt(
  order: Pick<Order, 'id' | 'paymentLog'>,
  kind: PaymentKind,
  imageUrl: string,
  thread: Pick<ChatMessage, 'threadId' | 'threadName'>,
  at: Date,
  targetDb: Firestore = db
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: `msg-${at.getTime()}-receipt-${order.id}`,
    sender: 'user',
    text: receiptMessageText(order.id, kind),
    imageUrl,
    fileName: `Чек ${order.id}.jpg`,
    receiptOrderId: order.id,
    timestamp: at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    ...thread,
  };
  await saveChatMessageToFirestore(message, targetDb);
  await updateDoc(doc(targetDb, 'orders', order.id), {
    paymentStatus: 'receipt_review',
    paymentReceipt: { method: kind, at: at.toISOString(), messageId: message.id },
    paymentLog: [...(order.paymentLog ?? []), paymentLogEntry('receipt', 'customer', { at })],
    updatedAt: serverTimestamp(),
  });
  return message;
}

/** Admin only: requisites templates («Сбербанк — ИП Иванов»), `payment_templates` */
export function subscribeToPaymentTemplates(onUpdate: (templates: PaymentTemplate[]) => void) {
  return onSnapshot(
    collection(db, 'payment_templates'),
    (snapshot) => {
      const list: PaymentTemplate[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as PaymentTemplate;
        if (data && data.kind && data.fields) list.push({ ...data, id: snap.id });
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      onUpdate(list);
    },
    (error) => logSubscriptionError('Payment templates', error)
  );
}

export async function savePaymentTemplate(template: PaymentTemplate): Promise<void> {
  await setDoc(doc(db, 'payment_templates', template.id), sanitizeForFirestore({ ...template, updatedAt: new Date().toISOString() }));
}

export async function deletePaymentTemplate(templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'payment_templates', templateId));
}

/** What happened to one line of a cancelled order */
export type LineReturn = 'returned' | 'already' | 'nothing' | 'unknown';

/**
 * Returns one line of a cancelled order to stock — exactly what its write-off entry `{заказ}_{строка}` took (stock
 * could be short at the order) — together with the entry `{заказ}_{строка}_return`, in one transaction. The entry is
 * created once, so a repeated call (another tab, a retry, the admin) returns nothing twice. A product «Снят с
 * витрины» stays off sale; a sold-out one is on sale again. Without a write-off entry nothing was taken
 * (`lineReturnQuantity`): the buyer's browser leaves the line 'unknown' and tries again at the next visit, the admin
 * passes `missingIsNothing` and the line counts as back. Throws when the write is refused.
 */
export async function returnOrderLineStock(
  orderId: string,
  line: CartItem,
  lineIndex: number,
  at: Date,
  options: { operator?: string; missingIsNothing?: boolean } = {},
  targetDb: Firestore = db
): Promise<LineReturn> {
  if (line.isPreorder) return 'nothing';
  const productRef = doc(targetDb, 'products', line.product.id);
  const returnRef = doc(targetDb, STOCK_MOVEMENTS_COLLECTION, orderReturnMovementId(orderId, lineIndex));
  const takenRef = doc(targetDb, STOCK_MOVEMENTS_COLLECTION, orderMovementId(orderId, lineIndex));
  return runTransaction(targetDb, async (tx) => {
    const [returnSnap, takenSnap, productSnap] = await Promise.all([tx.get(returnRef), tx.get(takenRef), tx.get(productRef)]);
    if (returnSnap.exists()) return 'already';
    if (!takenSnap.exists()) return options.missingIsNothing ? 'nothing' : 'unknown';
    const quantity = lineReturnQuantity({ changeQuantity: Number(takenSnap.data().changeQuantity) || 0 }, line);
    if (!(quantity > 0) || !productSnap.exists()) return 'nothing';

    const data = productSnap.data();
    const skus: ProductSKU[] = Array.isArray(data.skus) ? data.skus : [];
    const skuIndex = skus.findIndex(
      (sku) => sameVariantName(sku.color, line.selectedColor) && sameVariantName(sku.size, line.selectedSize)
    );
    if (skuIndex < 0) return 'nothing';
    const sku = skus[skuIndex];
    const stockBefore = Number(sku.stock) || 0;
    const movement: StockMovementLog & { lineIndex: number; skuIndex: number } = {
      id: returnRef.id,
      createdAt: at.toISOString(),
      date: formatOrderDate(at),
      type: 'return',
      orderId,
      lineIndex,
      productId: line.product.id,
      productTitle: String(line.product.title ?? '').slice(0, 200),
      skuCode: String(sku.skuCode ?? '').slice(0, 80),
      color: String(sku.color ?? '').slice(0, 60),
      size: String(sku.size ?? '').slice(0, 30),
      changeQuantity: quantity,
      reason: orderReturnReason(orderId),
      operator: options.operator ?? ORDER_MOVEMENT_OPERATOR,
      skuIndex,
    };
    tx.set(returnRef, sanitizeForFirestore(movement));
    const nextSkus = skus.map((s, i) => (i === skuIndex ? { ...s, stock: stockBefore + quantity } : s));
    tx.update(productRef, {
      skus: nextSkus,
      // false with stock left = «Снят с витрины» (isHiddenFromSale): only a sold-out product goes on sale again, and not
      // one the admin took off sale (hiddenFromSale); the rules check the same expression for the buyer
      inStock: inStockAfterReturn({ inStock: data.inStock, skus, hiddenFromSale: data.hiddenFromSale }),
      lastStockMovement: movement.id,
    });
    return 'returned';
  });
}

/**
 * Every line of a cancelled order back to stock, one transaction per line (as the write-off). Marks the order
 * `stockReturned` when no line is left unknown. Resolves to true when the whole order is back.
 * `targetDb` — the sign-in that returns (the buyer or the admin; the rules test calls this code with its own).
 */
export async function returnCancelledOrderStock(
  order: Pick<Order, 'id' | 'items' | 'isAdjusted'>,
  options: { operator?: string; missingIsNothing?: boolean } = {},
  targetDb: Firestore = db
): Promise<boolean> {
  if (order.isAdjusted) {
    // after «Правка состава» only the admin returns, by variant (the buyer cannot read the order's whole journal);
    // the buyer's browser leaves it to «Вернуть на склад» in «Заказы»
    return options.missingIsNothing ? returnAdjustedOrderStock(order, options.operator ?? 'Администратор', targetDb) : false;
  }
  const at = new Date();
  let complete = true;
  for (let i = 0; i < (order.items ?? []).length; i++) {
    let result: LineReturn;
    try {
      result = await returnOrderLineStock(order.id, order.items[i], i, at, options, targetDb);
    } catch (err) {
      // Another tab (or the admin) returned this line at the same moment: its entry is there now
      const entry = await getDoc(doc(targetDb, STOCK_MOVEMENTS_COLLECTION, orderReturnMovementId(order.id, i))).catch(() => null);
      if (!entry?.exists()) throw err;
      result = 'already';
    }
    if (result === 'unknown') complete = false;
  }
  if (complete) await updateDoc(doc(targetDb, 'orders', order.id), { stockReturned: true, updatedAt: serverTimestamp() });
  return complete;
}


/**
 * Products without their previews inside (stage 6 of docs/catalog-scale-plan.md, productPreviews.ts): the previews go to
 * `product_previews` first (a product never points to previews that are not there yet), and only changed ones — a
 * product the admin changed without its photos keeps its `previewKey`.
 * A product in `previous` (what the admin panel showed) gets only the fields the admin changed (`update`): a bulk
 * action or a new category must not write back stock an order took in the same seconds (admin audit 09.10, finding 6).
 * A new product, or one whose previous version cannot be compared, is written whole.
 */
export async function syncAllProductsToFirestore(products: Product[], previous: Product[] = []) {
  try {
    const before = new Map(previous.map((p) => [p.id, p]));
    const split = products.map(splitProductPreviews);
    await saveProductPreviews(
      split.flatMap(({ stored, previews }, i) => (previews && stored.previewKey !== products[i].previewKey ? [previews] : []))
    );
    const writes = split.flatMap(({ stored }): ProductWrite[] => {
      const next = sanitizeForFirestore(toStoredProduct(stored));
      const prev = storedProductForCompare(before.get(next.id));
      if (!prev) return [{ id: next.id, whole: next }];
      const changes = changedFields(prev, next as unknown as Record<string, unknown>);
      return hasFieldChanges(changes) ? [{ id: next.id, changes }] : [];
    });
    await commitInChunks(writes, (batch, write) => {
      const ref = doc(db, 'products', write.id);
      if ('whole' in write) batch.set(ref, write.whole);
      else batch.update(ref, fieldUpdate(write.changes));
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

type ProductWrite = { id: string; whole: Product } | { id: string; changes: FieldChanges };

/** The stored form of the version the admin saw; null — not known or not comparable (previews not read) */
function storedProductForCompare(product: Product | undefined): Record<string, unknown> | null {
  if (!product) return null;
  try {
    return sanitizeForFirestore(toStoredProduct(splitProductPreviews(product).stored)) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `update()` data of changed fields: removed ones are deleted */
function fieldUpdate(changes: FieldChanges): Record<string, unknown> {
  return { ...changes.set, ...Object.fromEntries(changes.removed.map((key) => [key, deleteField()])) };
}

/** Admin only: costs by product id (`product_costs`, closed to customers by firestore.rules) */
export function subscribeToProductCosts(onUpdate: (costs: Record<string, ProductCostEntry>) => void) {
  return onSnapshot(
    collection(db, 'product_costs'),
    (snapshot) => {
      const costs: Record<string, ProductCostEntry> = {};
      snapshot.forEach((snap) => {
        const entry = readCostEntry(snap.data());
        if (entry) costs[snap.id] = entry;
      });
      onUpdate(costs);
    },
    (error) => logSubscriptionError('Product costs', error)
  );
}

function addProductCost(batch: WriteBatch, { id, ...fields }: { id: string } & ProductCostEntry) {
  const entry = costEntryOf(fields);
  if (hasCostData(entry)) {
    batch.set(doc(db, 'product_costs', id), sanitizeForFirestore({ ...entry, updatedAt: new Date().toISOString() }));
  } else batch.delete(doc(db, 'product_costs', id));
}

/** Writes the costs the admin changed; an empty entry removes the document */
export async function saveProductCosts(changes: ({ id: string } & ProductCostEntry)[]) {
  if (changes.length === 0) return;
  try {
    await commitInChunks(changes, addProductCost);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'product_costs');
  }
}

/**
 * «Курсы и наценка» → «Применить»: only the price and the old (struck-out) price of each product — stock, photos and
 * texts stay as the database has them (a whole-document write from the admin's copy could bring back sold stock).
 * No old price or discount percent (`undefined`) removes the field: an old price not above the price is no discount.
 */
export interface ProductPriceChange {
  id: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  priceHistory?: PriceHistoryEntry[];
  /** The wholesale price from the wholesale markup; absent — the wholesale price is not touched */
  wholesalePrice?: number;
}

function addProductPrice(
  batch: WriteBatch,
  { id, price, originalPrice, discountPercent, priceHistory, wholesalePrice }: ProductPriceChange
) {
  const orDelete = (n: number | undefined) => (typeof n === 'number' ? n : deleteField());
  batch.update(doc(db, 'products', id), {
    price,
    originalPrice: orDelete(originalPrice),
    discountPercent: orDelete(discountPercent),
    ...(typeof wholesalePrice === 'number' ? { wholesalePrice } : {}),
    // earlier prices: unpaid orders are checked against the price of their time
    ...(priceHistory ? { priceHistory } : {}),
  });
}

export async function updateProductPrices(changes: ProductPriceChange[]) {
  if (changes.length === 0) return;
  try {
    await commitInChunks(changes, addProductPrice);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

/** The price journal (admin audit 09.10, finding 11; admin only, closed to customers by firestore.rules) */
export const PRICE_CHANGES_COLLECTION = 'price_changes';

function addPriceChange(batch: WriteBatch, entry: PriceChangeLog) {
  batch.set(doc(db, PRICE_CHANGES_COLLECTION, entry.id), sanitizeForFirestore(entry));
}

/** Adds entries to the price journal; throws when the write is refused */
export async function savePriceChanges(entries: PriceChangeLog[]) {
  if (entries.length === 0) return;
  try {
    await commitInChunks(entries, addPriceChange);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PRICE_CHANGES_COLLECTION);
  }
}

/** Admin only: the newest entries of the price journal, read once when «Журнал цен» is opened */
export async function loadPriceChanges(max: number): Promise<PriceChangeLog[]> {
  try {
    const snapshot = await getDocs(query(collection(db, PRICE_CHANGES_COLLECTION), orderBy('createdAt', 'desc'), limit(max)));
    return snapshot.docs.map((d) => ({ ...(d.data() as PriceChangeLog), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, PRICE_CHANGES_COLLECTION);
  }
}

/**
 * «Применить» of the rates: new prices, the costs of those products and the rates — in one batch, so a failure leaves
 * nothing half applied (admin audit 09.10, finding 13). A catalog too big for one batch goes in parts: costs first,
 * then prices, the rates last — «Последний раз применено» never shows over old prices, and pressing again finishes it.
 * The price journal is written after it (`savePriceChanges`): a refused journal must not hold the prices back.
 */
export async function applyExchangeRateChanges(
  prices: ProductPriceChange[],
  costs: ({ id: string } & ProductCostEntry)[],
  rates: ExchangeRates
) {
  try {
    if (prices.length + costs.length + 1 <= BATCH_LIMIT) {
      const batch = writeBatch(db);
      costs.forEach((c) => addProductCost(batch, c));
      prices.forEach((p) => addProductPrice(batch, p));
      addExchangeRates(batch, rates);
      await batch.commit();
      return;
    }
    await commitInChunks(costs, addProductCost);
    await commitInChunks(prices, addProductPrice);
    await commitInChunks([rates], addExchangeRates);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

/** Admin only: «Курсы и наценка» (`settings/exchange_rates`, closed to customers: the markup shows the margin) */
export function subscribeToExchangeRates(onUpdate: (rates: ExchangeRates) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    doc(db, 'settings', EXCHANGE_RATES_DOC_ID),
    (snap) => onUpdate(readExchangeRates(snap.data())),
    (error) => {
      logSubscriptionError('Exchange rates', error);
      onError?.(error);
    }
  );
}

function addExchangeRates(batch: WriteBatch, rates: ExchangeRates) {
  batch.set(doc(db, 'settings', EXCHANGE_RATES_DOC_ID), sanitizeForFirestore({ ...rates, updatedAt: new Date().toISOString() }));
}

/** How many newest entries of the stock journal the admin screen loads */
export const STOCK_MOVEMENTS_LIMIT = 500;
/** A period of the journal is read whole up to this many entries (a safety cap against an unexpected flood) */
export const STOCK_MOVEMENTS_PERIOD_LIMIT = 5000;

/** Admin only: the newest entries of the stock journal (`stock_movements`, closed to customers by firestore.rules) */
export function subscribeToStockMovements(
  onUpdate: (movements: StockMovementLog[]) => void,
  onError?: (error: Error) => void,
  /** ISO date: every entry since then (finding 42: the latest 500 hid older ones); none — the latest 500 */
  since?: string
) {
  const col = collection(db, STOCK_MOVEMENTS_COLLECTION);
  return onSnapshot(
    since
      ? query(col, where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(STOCK_MOVEMENTS_PERIOD_LIMIT))
      : query(col, orderBy('createdAt', 'desc'), limit(STOCK_MOVEMENTS_LIMIT)),
    (snapshot) => onUpdate(snapshot.docs.map((d) => ({ ...(d.data() as StockMovementLog), id: d.id }))),
    (error) => {
      logSubscriptionError('Stock journal', error);
      onError?.(error);
    }
  );
}

/** Adds entries to the stock journal; throws when the write is refused */
export async function saveStockMovements(movements: StockMovementLog[]) {
  if (movements.length === 0) return;
  try {
    await setDocs(STOCK_MOVEMENTS_COLLECTION, movements);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, STOCK_MOVEMENTS_COLLECTION);
  }
}

/** Full photos already read in this visit: the product page and the zoom do not read them again */
const productPhotoCache = new Map<string, string>();
const productPhotoRequests = new Map<string, Promise<void>>();

/** Full photos of a product by id (stage 6): a missing document is left out — the page shows the preview */
export async function loadProductPhotos(ids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  await Promise.all(
    wanted
      .filter((id) => !productPhotoCache.has(id))
      .map((id) => {
        // the next slide asks while the previous request is on its way: one read per photo
        let pending = productPhotoRequests.get(id);
        if (!pending) {
          pending = trackRead(getDoc(doc(db, 'product_photos', id)))
            .then((snap) => {
              const data = snap.data()?.data;
              if (typeof data === 'string') productPhotoCache.set(id, data);
            })
            .catch((error) => console.warn(`Photo ${id} was not read:`, error))
            .finally(() => productPhotoRequests.delete(id));
          productPhotoRequests.set(id, pending);
        }
        return pending;
      })
  );
  return Object.fromEntries(wanted.filter((id) => productPhotoCache.has(id)).map((id) => [id, productPhotoCache.get(id)!]));
}

/** Previews of a product (null — none or not read); read once per previews version in a visit */
const productPreviewRequests = new Map<string, Promise<ProductPreviewsDoc | null>>();
export function loadProductPreviews(product: Pick<Product, 'id' | 'previewKey'>): Promise<ProductPreviewsDoc | null> {
  const key = `${product.id}:${product.previewKey ?? ''}`;
  let pending = productPreviewRequests.get(key);
  if (!pending) {
    pending = trackRead(getDoc(doc(db, 'product_previews', product.id)))
      .then((snap) => (snap.exists() ? (snap.data() as ProductPreviewsDoc) : null))
      .catch((error) => {
        // the photo keeps its placeholder; the next time it is shown it asks again
        productPreviewRequests.delete(key);
        console.warn(`Previews of product ${product.id} were not read:`, error);
        return null;
      });
    productPreviewRequests.set(key, pending);
  }
  return pending;
}

/** The product with its previews in place (the product form, a copy of a product); unchanged when they are not read */
export async function productWithPreviews<T extends Product>(product: T): Promise<T> {
  return previewsMoved(product) ? withProductPreviews(product, await loadProductPreviews(product)) : product;
}

/** Writes previews (admin), 5 per batch: a document is up to 1 MiB and a request takes 10 MiB */
async function saveProductPreviews(docs: ProductPreviewsDoc[]): Promise<void> {
  for (let i = 0; i < docs.length; i += 5) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 5)) batch.set(doc(db, 'product_previews', d.productId), d);
    await batch.commit();
  }
}

/** Writes full photos (admin), 10 per batch: a photo is up to 400 КБ and a request takes 10 MiB */
export async function saveProductPhotos(photos: PhotoDoc[]): Promise<void> {
  for (let i = 0; i < photos.length; i += 10) {
    const batch = writeBatch(db);
    for (const photo of photos.slice(i, i + 10)) {
      batch.set(doc(db, 'product_photos', photo.id), { productId: photo.productId, data: photo.data });
      productPhotoCache.set(photo.id, photo.data);
    }
    await batch.commit();
  }
}

/** Removes photo documents the products no longer use (after the product was saved) */
export async function deleteProductPhotos(ids: string[]): Promise<void> {
  const list = ids.filter(Boolean);
  for (let i = 0; i < list.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of list.slice(i, i + BATCH_LIMIT)) batch.delete(doc(db, 'product_photos', id));
    await batch.commit();
  }
}

/**
 * The light catalog index (docs/catalog-scale-plan.md, stage 2): every part of `catalog_index`. A write puts all parts
 * in one batch, so a snapshot never mixes two versions (readCatalogIndex checks it anyway)
 */
export function subscribeToCatalogIndex(onUpdate: (parts: CatalogIndexPart[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    collection(db, CATALOG_INDEX_COLLECTION),
    (snap) => {
      if (snap.metadata.fromCache && snap.empty) return;
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return { ...(data as CatalogIndexPart), entries: data.entries instanceof Bytes ? data.entries.toUint8Array() : new Uint8Array() };
        })
      );
    },
    (error) => {
      logSubscriptionError('Catalog index', error);
      if (onError) onError(error);
    }
  );
}

/** Writes the index (admin): the new parts and the removal of parts it no longer has, in one batch */
export async function saveCatalogIndex(parts: CatalogIndexPart[], previousPartCount: number): Promise<void> {
  const batch = writeBatch(db);
  for (const part of parts) {
    batch.set(doc(db, CATALOG_INDEX_COLLECTION, catalogIndexPartId(part.part)), { ...part, entries: Bytes.fromUint8Array(part.entries) });
  }
  for (let i = parts.length; i < previousPartCount; i++) batch.delete(doc(db, CATALOG_INDEX_COLLECTION, catalogIndexPartId(i)));
  await batch.commit();
}

export interface ProductThumb {
  productId: string;
  /** thumbKey of the photo it was made from */
  key: string;
  data: string;
}

/** Miniatures of products for the catalog cards (admin), 50 per batch: one is ≈ 10–20 КБ */
export async function saveProductThumbs(thumbs: ProductThumb[], removedProductIds: string[] = []): Promise<void> {
  for (let i = 0; i < thumbs.length; i += 50) {
    const batch = writeBatch(db);
    for (const thumb of thumbs.slice(i, i + 50)) batch.set(doc(db, PRODUCT_THUMBS_COLLECTION, thumb.productId), thumb);
    await batch.commit();
  }
  for (let i = 0; i < removedProductIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of removedProductIds.slice(i, i + BATCH_LIMIT)) batch.delete(doc(db, PRODUCT_THUMBS_COLLECTION, id));
    await batch.commit();
  }
}

/** Miniatures of a few products (a catalog page): one read each, up to 30 ids per query */
export async function loadProductThumbs(productIds: string[]): Promise<ProductThumb[]> {
  const out: ProductThumb[] = [];
  for (let i = 0; i < productIds.length; i += 30) {
    const snap = await trackRead(
      getDocs(query(collection(db, PRODUCT_THUMBS_COLLECTION), where(documentId(), 'in', productIds.slice(i, i + 30))))
    );
    snap.forEach((d) => out.push(d.data() as ProductThumb));
  }
  return out;
}

/**
 * One product document (stage 3 of docs/catalog-scale-plan.md): the customer reads the catalog from the index and the
 * full product only where it is shown or ordered — the product page, the quick view, the cart and the checkout.
 * `null` — the product is gone
 */
export function subscribeToProductDoc(productId: string, onUpdate: (product: Product | null) => void) {
  // the first answer is a read the screen waits for (pendingReads.ts)
  let answered: () => void = () => {};
  trackRead(new Promise<void>((resolve) => (answered = resolve)));
  const unsub = onSnapshot(
    doc(db, 'products', productId),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return;
      answered();
      onUpdate(snap.exists() ? ({ ...(snap.data() as Product), id: snap.id }) : null);
    },
    (error) => {
      answered();
      logSubscriptionError('Product', error);
    }
  );
  return () => {
    answered();
    unsub();
  };
}

/**
 * A product with photos still inside (admin session, once): full photos go to `product_photos` (stage 6 of the audit
 * 02.10), then previews to `product_previews` (stage 6 of docs/catalog-scale-plan.md). Photos and previews are written
 * first, then only `images`, `photoIds` and `previewKey` of the product change — the stock is not touched.
 */
export async function moveProductPhotosOut(product: Product): Promise<boolean> {
  let images = product.images ?? [];
  let photoIds = product.photoIds;
  if (hasHeavyPhotos(product)) {
    const known = new Map<string, string>();
    images.forEach((src, i) => {
      const id = product.photoIds?.[i];
      if (id && src) known.set(src, id);
    });
    const split = await splitProductPhotos(product.id, images, known);
    await saveProductPhotos(split.newPhotos);
    images = split.images;
    photoIds = split.photoIds;
  }
  const { stored, previews } = splitProductPreviews({ ...product, images, photoIds });
  if (!previews && images === product.images) return false;
  if (previews) await saveProductPreviews([previews]);
  await updateDoc(doc(db, 'products', product.id), {
    images: stored.images,
    ...(photoIds ? { photoIds } : {}),
    ...(stored.previewKey ? { previewKey: stored.previewKey } : {}),
  });
  return true;
}

/**
 * Moves cost prices that are still stored inside products (visible to every visitor) into `product_costs`.
 * Copy and removal go in one batch per chunk, so a cost is never lost halfway.
 */
export async function moveProductCostsToPrivate(products: Product[]) {
  const legacy = products.filter((p) => typeof p.costPrice === 'number');
  if (legacy.length === 0) return;
  try {
    // Two writes per product: half a batch of products at a time
    for (let i = 0; i < legacy.length; i += BATCH_LIMIT / 2) {
      await commitInChunks(legacy.slice(i, i + BATCH_LIMIT / 2), (batch, p) => {
        // merge: a purchase in a currency already kept there stays
        batch.set(doc(db, 'product_costs', p.id), { costPrice: p.costPrice, updatedAt: new Date().toISOString() }, { merge: true });
        batch.update(doc(db, 'products', p.id), { costPrice: deleteField() });
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'product_costs');
  }
}

/**
 * 2. ORDERS SYNC
 */
function parseFirestoreDateOrTimestamp(val: unknown, fallback = 'Сегодня'): string {
  if (!val) return fallback;
  if (typeof val === 'string' && val.trim().length > 0) return val;
  if (val instanceof Date) {
    return val.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      try {
        return (val as { toDate: () => Date }).toDate().toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {}
    }
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      try {
        return new Date((val as { seconds: number }).seconds * 1000).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {}
    }
  }
  return String(val);
}

function parseFirestoreBoolean(val: unknown, defaultValue = false): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (['true', '1', 'yes', 'completed', 'done', 'да'].includes(lower)) return true;
    if (['false', '0', 'no', 'pending', 'нет'].includes(lower)) return false;
  }
  if (typeof val === 'number') return val > 0;
  return defaultValue;
}

function normalizeOrderFromFirestore(raw: any, docId?: string): Order {
  if (!raw || typeof raw !== 'object') {
    const fallbackId = docId || `ORD-${Date.now()}`;
    const emptyOrder: Order = {
      id: fallbackId,
      date: 'Сегодня',
      items: [],
      status: 'accepted',
      totalPrice: 0,
      deliveryAddress: 'Адрес доставки не указан',
      deliveryMethod: 'Курьерская доставка',
      historySteps: [
        {
          title: 'Заказ принят',
          date: 'Сегодня',
          completed: true,
          description: 'Заказ успешно зарегистрирован',
        },
      ],
    };
    emptyOrder.deliveryStages = getSynchronizedDeliveryStages(emptyOrder);
    return emptyOrder;
  }

  const orderId = String(raw.id || docId || `ORD-${Date.now()}`);

  let rawStatus = String(raw.status || '').toLowerCase().trim();
  let status: Order['status'] = 'accepted';
  if (rawStatus.includes('deliv') || rawStatus.includes('доставлен') || rawStatus.includes('выдан')) {
    status = 'delivered';
  } else if (rawStatus.includes('ready') || rawStatus.includes('готов')) {
    status = 'ready';
  } else if (rawStatus.includes('transit') || rawStatus.includes('пути') || rawStatus.includes('курьер')) {
    status = 'in_transit';
  } else if (rawStatus.includes('assembl') || rawStatus.includes('сборк') || rawStatus.includes('комплект')) {
    status = 'assembling';
  } else {
    status = 'accepted';
  }

  const isCancelled = parseFirestoreBoolean(raw.isCancelled ?? raw.is_cancelled ?? raw.cancelled, false) ||
    rawStatus.includes('cancel') || rawStatus.includes('отмен');

  const orderDate = parseFirestoreDateOrTimestamp(
    raw.date ?? raw.created_at ?? raw.createdAt ?? raw.timestamp,
    'Сегодня'
  );
  const rawDeliveryMethod = String(raw.deliveryMethod ?? raw.delivery_method ?? 'Курьерская доставка');
  const rawTrackingCompany = raw.trackingCompany ? String(raw.trackingCompany) : undefined;
  const rawDeliveryKind = DELIVERY_KINDS.find(kind => kind === raw.deliveryKind);
  // по типу заказа, а не по названию способа: трек ТК с любым названием не пропадает (аудит 07.10, находка 1)
  const isTK = isCarrierOrder({
    deliveryKind: rawDeliveryKind,
    deliveryMethod: rawDeliveryMethod,
    trackingCompany: rawTrackingCompany as Order['trackingCompany'],
  });
  const trackingNumber = isTK && raw.trackingNumber ? String(raw.trackingNumber) : undefined;
  const estimatedDelivery = raw.estimatedDelivery ? String(raw.estimatedDelivery) : undefined;

  let rawStepsList: any[] = [];
  if (Array.isArray(raw.historySteps)) {
    rawStepsList = raw.historySteps;
  } else if (raw.historySteps && typeof raw.historySteps === 'object') {
    rawStepsList = Object.values(raw.historySteps);
  }

  let historySteps: OrderStatusHistoryStep[] = [];
  if (rawStepsList.length > 0) {
    try {
      historySteps = rawStepsList
        .filter((step) => step && typeof step === 'object')
        .map((step, idx) => {
          const rawTitle = step.title ?? step.name ?? step.stepName ?? step.step_name ?? step.label ?? step.text ?? step.stage ?? step.statusTitle ?? step.status;
          const rawDate = step.date ?? step.time ?? step.timestamp ?? step.created_at ?? step.createdAt ?? step.statusDate;
          const rawCompleted = step.completed ?? step.isCompleted ?? step.is_completed ?? step.done ?? step.isDone ?? (step.status === 'completed');
          const rawDescription = step.description ?? step.desc ?? step.details ?? step.note ?? step.comment ?? step.message ?? step.info;

          return {
            title: String(rawTitle || `Этап ${idx + 1}`),
            date: parseFirestoreDateOrTimestamp(rawDate, orderDate),
            completed: parseFirestoreBoolean(rawCompleted, false),
            description: rawDescription ? String(rawDescription) : undefined,
          };
        });
    } catch {
      historySteps = [];
    }
  }

  if (historySteps.length === 0) {
    historySteps = getDefaultHistorySteps({
      status,
      date: orderDate,
      isCancelled,
      cancelledAt: raw.cancelledAt ? String(raw.cancelledAt) : undefined,
      cancelReason: raw.cancelReason ? String(raw.cancelReason) : undefined,
      trackingNumber,
      estimatedDelivery,
    });
  }

  // The buyer's cancellation changes only the cancel fields (the rules): its step is added for the history blocks
  if (isCancelled && raw.cancelledBy && !historySteps.some((s) => /отмен/i.test(s.title))) {
    historySteps = [
      ...historySteps,
      {
        title: raw.cancelledBy === 'customer' ? 'Заказ отменён покупателем' : 'Заказ отменён магазином',
        date: formatCancelledAt({ cancelledAt: raw.cancelledAt ? String(raw.cancelledAt) : undefined }) || orderDate,
        completed: true,
        description: cancelReasonText({ cancelReason: raw.cancelReason, cancelComment: raw.cancelComment }) || undefined,
      },
    ];
  }

  const items = Array.isArray(raw.items) ? raw.items : [];

  const order: Order = {
    ...raw,
    id: orderId,
    date: orderDate,
    items,
    status,
    isCancelled,
    totalPrice: Number(raw.totalPrice ?? raw.total_price ?? raw.amount ?? raw.total) || 0,
    deliveryAddress: String(raw.deliveryAddress ?? raw.delivery_address ?? raw.address ?? 'Адрес доставки не указан'),
    // an old order without these fields: said so, not made up (a status change writes the order back — finding 42)
    deliveryMethod: String(raw.deliveryMethod ?? raw.delivery_method ?? 'Способ доставки не указан'),
    paymentMethod: String(raw.paymentMethod ?? raw.payment_method ?? 'Способ оплаты не указан'),
    paymentStatus: raw.paymentStatus ?? raw.payment_status ?? 'pending',
    // a Timestamp in the database (stage 2 of docs/orders-scale-plan.md); null while the write is pending
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : undefined,
    trackingNumber,
    estimatedDelivery,
    historySteps,
  };

  order.deliveryStages = getSynchronizedDeliveryStages(order);

  if (order.status === 'accepted' && !order.isCancelled && order.historySteps && order.historySteps.length > 0) {
    order.historySteps = order.historySteps.map((step, idx) => {
      if (idx === 0 || step.title.toLowerCase().includes('принят')) {
        return { ...step, completed: true };
      }
      return { ...step, completed: false };
    });
  }

  return order;
}

/**
 * An order as written: every write of an order stamps `updatedAt` with the server's time (docs/orders-scale-plan.md,
 * stage 2), so the admin can read only the orders changed since its index was written. The customer's own writes
 * (cancel, «Я получил заказ», receipt, guest hand-over) stamp it too.
 */
function storedOrder(order: Order) {
  return { ...sanitizeForFirestore(order), updatedAt: serverTimestamp() };
}

/**
 * Subscribes to orders. Admins receive every order; customers pass their uid
 * and only receive their own orders (required by firestore.rules).
 */
export function subscribeToOrders(
  onUpdate: (orders: Order[]) => void,
  onError?: (error: unknown) => void,
  customerUid?: string
) {
  const colRef = collection(db, 'orders');
  const source = customerUid ? query(colRef, where('customerUid', '==', customerUid)) : colRef;
  return onSnapshot(
    source,
    async (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: Order[] = [];
      snapshot.forEach((docSnap) => {
        try {
          const rawData = docSnap.data();
          const normalized = normalizeOrderFromFirestore(rawData, docSnap.id);
          loaded.push(normalized);
        } catch (itemErr) {
          console.error(`[Firestore Orders Listener] Error mapping order document ${docSnap.id}:`, itemErr);
        }
      });
      loaded.sort((a, b) => {
        const timeA = new Date(a.date).getTime() || 0;
        const timeB = new Date(b.date).getTime() || 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Orders', error);
      if (onError) onError(error);
    }
  );
}

export async function saveOrderToFirestore(order: Order): Promise<void> {
  try {
    await setDoc(doc(db, 'orders', order.id), storedOrder(order));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`);
  }
}

/**
 * An order from the browser (`completeOrderLocally`): together with its rate mark `order_rate/{uid}` in one batch — the
 * rules take an order only under a sign-in (Google or the guest's anonymous one) and not more often than every 30 s
 * from it (audit 02.10, stage 5 without Blaze). Throws when refused.
 */
export async function placeClientOrder(order: Order, uid: string, targetDb: Firestore = db): Promise<void> {
  const batch = writeBatch(targetDb);
  batch.set(doc(targetDb, 'orders', order.id), storedOrder(order));
  batch.set(doc(targetDb, 'order_rate', uid), { lastOrderAt: serverTimestamp(), orderId: order.id });
  await batch.commit();
}

/** Seconds left until this sign-in may place the next order (`order_rate/{uid}`); 0 — not limited or unknown */
export async function orderRateWaitSeconds(uid: string, targetDb: Firestore = db): Promise<number> {
  try {
    const snap = await getDoc(doc(targetDb, 'order_rate', uid));
    const at = snap.data()?.lastOrderAt;
    const last = at instanceof Timestamp ? at.toMillis() : 0;
    return Math.max(0, Math.ceil((last + 30_000 - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

/**
 * A guest signed in with Google: the orders and the support chat of the guest's anonymous sign-in go to the account
 * (audit 02.10, finding 26). Both sides agree in this browser (rules: guest_links + account_guests), then the guest's
 * session moves each order (`customerUid`) and each message it sees (`threadId`). Returns what was moved.
 * `accountDb` — the account's sign-in (the site's own; the rules test passes the account's database).
 */
export async function handOverGuestData(
  guest: { uid: string; db: Firestore },
  accountUid: string,
  accountDb: Firestore = db
): Promise<{ orderIds: string[]; messages: number }> {
  await setDoc(doc(accountDb, 'account_guests', `${accountUid}_${guest.uid}`), { accountUid, guestUid: guest.uid });
  await setDoc(doc(guest.db, 'guest_links', guest.uid), { accountUid });

  const orders = await getDocs(query(collection(guest.db, 'orders'), where('customerUid', '==', guest.uid)));
  const messages = await getDocs(
    query(collection(guest.db, 'chat_messages'), where('threadId', '==', guest.uid), where('isInternalNote', '==', false))
  );
  const refs = [
    ...orders.docs.map((d) => ({ ref: d.ref, data: { customerUid: accountUid, updatedAt: serverTimestamp() } })),
    ...messages.docs.map((d) => ({ ref: d.ref, data: { threadId: accountUid } })),
  ];
  // 10 per batch: each write checks both halves of the link, and a batch may read at most 20 documents in the rules
  for (let i = 0; i < refs.length; i += 10) {
    const batch = writeBatch(guest.db);
    for (const { ref, data } of refs.slice(i, i + 10)) batch.update(ref, data);
    await batch.commit();
  }
  return { orderIds: orders.docs.map((d) => d.id), messages: messages.size };
}

export async function deleteOrderFromFirestore(orderId: string) {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
  }
}

/** Admin → «Аналитика»: statistics count from this moment (orders are never deleted); null — all history */
export function subscribeToAnalyticsResetAt(onUpdate: (resetAt: number | null) => void) {
  return onSnapshot(
    doc(db, 'settings', 'analytics'),
    (snap) => {
      const value = snap.data()?.resetAt;
      onUpdate(typeof value === 'number' && value > 0 ? value : null);
    },
    (error) => logSubscriptionError('Analytics settings', error)
  );
}

/** `settings/legal`: the store's own editions of the offer and the privacy policy (none — the template is used) */
export function subscribeToLegalTexts(onUpdate: (texts: LegalTexts) => void) {
  return onSnapshot(
    doc(db, 'settings', 'legal'),
    (snap) => {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const texts: LegalTexts = {};
      for (const id of ['offer', 'privacy'] as LegalDocId[]) {
        const e = data[id] as { text?: unknown; updatedAt?: unknown } | undefined;
        if (e && typeof e.text === 'string' && e.text.trim()) {
          texts[id] = { text: e.text, updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : '' };
        }
      }
      onUpdate(texts);
    },
    (error) => logSubscriptionError('Legal texts', error)
  );
}

/** Admin → «Документы»: saves the store's edition; null — back to the template */
export async function saveLegalText(id: LegalDocId, text: string | null) {
  try {
    await setDoc(
      doc(db, 'settings', 'legal'),
      { [id]: text === null ? deleteField() : { text, updatedAt: new Date().toISOString() } },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/legal');
  }
}

export async function saveAnalyticsResetAt(resetAt: number | null) {
  try {
    await setDoc(doc(db, 'settings', 'analytics'), { resetAt: resetAt ?? null, updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/analytics');
  }
}

type OrderWrite =
  | { id: string; whole: Record<string, unknown> }
  | { id: string; changes: FieldChanges; seen?: Record<string, unknown>; check?: string[] };

/**
 * Admin changes of orders. An order in `previous` (what «Заказы» showed) gets only the fields the admin changed
 * (`update`), so a buyer's cancel, receipt or «Я получил» in the same seconds is not written over (admin audit 09.10,
 * finding 7). A change of a field the buyer also writes (status, payment, cancellation) goes in a transaction and only
 * while the database still has the order's state the admin saw. Resolves to the orders that changed meanwhile — as
 * the database has them now; when the read before writing finds one, nothing of the change is written.
 */
/** The order as the database has it, when one of `fields` differs from what the admin saw; null — unchanged */
async function currentOrderIfChanged(id: string, seen: Record<string, unknown>, fields: string[]): Promise<Order | null> {
  const snap = await getDoc(doc(db, 'orders', id));
  if (!snap.exists()) throw new Error(`Заказ ${id} удалён`);
  const current = normalizeOrderFromFirestore(snap.data(), snap.id);
  return changedSince(seen, sanitizeForFirestore(current) as unknown as Record<string, unknown>, fields).length > 0 ? current : null;
}

export async function syncAllOrdersToFirestore(orders: Order[], previous: Order[] = []): Promise<Order[]> {
  const before = new Map(previous.map((o) => [o.id, o]));
  const writes: OrderWrite[] = [];
  for (const order of orders) {
    const next = sanitizeForFirestore(order) as unknown as Record<string, unknown>;
    const seenOrder = before.get(order.id);
    if (!seenOrder) {
      writes.push({ id: order.id, whole: next });
      continue;
    }
    const seen = sanitizeForFirestore(seenOrder) as unknown as Record<string, unknown>;
    const changes = changedFields(seen, next, ['updatedAt']);
    if (!hasFieldChanges(changes)) continue;
    const check = orderFieldsToCheck(changes);
    writes.push(check.length > 0 ? { id: order.id, changes, seen, check } : { id: order.id, changes });
  }
  const conflicts: Order[] = [];
  try {
    const checked = writes.filter((w): w is Extract<OrderWrite, { changes: FieldChanges }> & { seen: Record<string, unknown>; check: string[] } =>
      'check' in w && !!w.check && !!w.seen
    );
    // All or nothing in practice: if a buyer changed any of the orders meanwhile, none is written, so the admin
    // screen's follow-up (stock, promo) never runs for a half-saved change
    for (const { id, seen, check } of checked) {
      const current = await currentOrderIfChanged(id, seen, check);
      if (current) conflicts.push(current);
    }
    if (conflicts.length > 0) return conflicts;
    const plain = writes.filter((w) => !checked.includes(w as (typeof checked)[number]));
    await commitInChunks(plain, (batch, write) => {
      const ref = doc(db, 'orders', write.id);
      if ('whole' in write) batch.set(ref, { ...write.whole, updatedAt: serverTimestamp() });
      else batch.update(ref, { ...fieldUpdate(write.changes), updatedAt: serverTimestamp() });
    });
    // the check again inside the transaction: the buyer may act between the read above and the write
    for (const { id, changes, seen, check } of checked) {
      const ref = doc(db, 'orders', id);
      const changedMeanwhile = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`Заказ ${id} удалён`);
        const current = normalizeOrderFromFirestore(snap.data(), snap.id);
        if (changedSince(seen, sanitizeForFirestore(current) as unknown as Record<string, unknown>, check).length > 0) return current;
        tx.update(ref, { ...fieldUpdate(changes), updatedAt: serverTimestamp() });
        return null;
      });
      if (changedMeanwhile) conflicts.push(changedMeanwhile);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'orders');
  }
  return conflicts;
}

/**
 * 3. PROMOS SYNC
 */
export function subscribeToPromos(
  onUpdate: (promos: PromoCode[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'promos');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: PromoCode[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as PromoCode);
      });
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Promos', error);
      if (onError) onError(error);
    }
  );
}




/**
 * Client checkout (server orders off): one more use of the promo by a saved order. The counter grows together with
 * the mark `promo_uses/{order}` — the rules allow one use per order with this code and not above the limit
 * (audit 02.10, finding 2). Revenue and the partner's commission are not written: they are counted from paid and
 * received orders (partnerCommission.ts). An atomic increment, so two buyers at once keep both uses.
 */
export async function recordPromoUsageInFirestore(promo: PromoCode, orderId: string, targetDb: Firestore = db) {
  try {
    // the order's owner writes it (rules): a guest — from the anonymous guest session that placed the order
    const batch = writeBatch(targetDb);
    batch.update(doc(targetDb, 'promos', promo.id), { usedCount: increment(1), lastOrderId: orderId });
    batch.set(doc(targetDb, 'promo_uses', orderId), { orderId, promoId: promo.id, createdAt: new Date().toISOString() });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promos/${promo.id}`);
  }
}

/**
 * The promo code use of a cancelled order goes back to the code: `promo_uses/{заказ}` is removed and `usedCount` drops
 * by one, in one transaction (audit 07.10, finding 6). No use recorded — nothing to return. Admin only (the rules let the
 * buyer only add a use). Resolves to true when a use went back.
 */
export async function releaseOrderPromoUse(orderId: string): Promise<boolean> {
  const useRef = doc(db, 'promo_uses', orderId);
  return runTransaction(db, async (tx) => {
    const use = await tx.get(useRef);
    if (!use.exists()) return false;
    const promoId = String(use.data().promoId ?? '');
    const promoRef = promoId ? doc(db, 'promos', promoId) : null;
    const promo = promoRef ? await tx.get(promoRef) : null;
    tx.delete(useRef);
    if (promoRef && promo?.exists()) {
      tx.update(promoRef, { usedCount: Math.max(0, (Number(promo.data().usedCount) || 0) - 1) });
    }
    return true;
  });
}

/**
 * A restored order takes its promo code use again (it was returned on the cancellation): `usedCount` + 1 and
 * `promo_uses/{заказ}`, like the order did. Admin only; the code's limit is the admin's call here.
 */
export async function retakeOrderPromoUse(orderId: string, promoId: string): Promise<boolean> {
  const useRef = doc(db, 'promo_uses', orderId);
  const promoRef = doc(db, 'promos', promoId);
  return runTransaction(db, async (tx) => {
    if ((await tx.get(useRef)).exists() || !(await tx.get(promoRef)).exists()) return false;
    tx.set(useRef, { orderId, promoId, createdAt: new Date().toISOString() });
    tx.update(promoRef, { usedCount: increment(1), lastOrderId: orderId });
    return true;
  });
}

export async function syncAllPromosToFirestore(promos: PromoCode[]) {
  try {
    await setDocs('promos', promos);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'promos');
  }
}

/**
 * 4. STOREFRONT SETTINGS SYNC
 */
export function subscribeToStorefrontSettings(
  onUpdate: (settings: StorefrontSettings) => void,
  onError?: (error: unknown) => void
) {
  const docRef = doc(db, 'settings', 'storefront');
  return onSnapshot(
    docRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        // Not configured yet: empty texts and contacts (DEFAULT_STOREFRONT_SETTINGS), nothing written
        onUpdate(DEFAULT_STOREFRONT_SETTINGS);
        return;
      }
      onUpdate({ ...DEFAULT_STOREFRONT_SETTINGS, ...(snapshot.data() as StorefrontSettings) });
    },
    (error) => {
      logSubscriptionError('Storefront settings', error);
      if (onError) onError(error);
    }
  );
}

export async function saveStorefrontSettingsToFirestore(settings: StorefrontSettings) {
  try {
    await setDoc(doc(db, 'settings', 'storefront'), sanitizeForFirestore(settings));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/storefront');
  }
}

/**
 * 4.1. STOREFRONT PROMO BANNERS SYNC
 */
export function subscribeToBanners(
  onUpdate: (banners: BannerSlide[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'banners');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: BannerSlide[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as BannerSlide);
      });
      loaded.sort((a, b) => ((a as any).order ?? 0) - ((b as any).order ?? 0));
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Banners', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Banners without their data: pictures inside (stage 5, bannerImages.ts): the pictures go to `banner_images/{id}` first
 * (a banner never points to pictures that are not there yet), and only the ones that changed — a banner the admin did
 * not touch keeps its `imageKey`
 */
export async function syncAllBannersToFirestore(banners: BannerSlide[]) {
  try {
    const split = banners.map(splitBannerImages);
    for (const [i, { stored, images }] of split.entries()) {
      if (images && stored.imageKey !== banners[i].imageKey) await setDoc(doc(db, 'banner_images', images.bannerId), images);
    }
    await setDocs('banners', split.map(({ stored }, i) => ({ ...stored, order: i })));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'banners');
  }
}


/**
 * Server feature flags (settings/server), e.g. whether orders go through Cloud Functions.
 */
export function subscribeToServerConfig(onUpdate: (config: ServerConfig) => void) {
  return onSnapshot(
    doc(db, 'settings', SERVER_CONFIG_DOC_ID),
    (snap) => onUpdate(snap.exists() ? (snap.data() as ServerConfig) : {}),
    (error) => {
      logSubscriptionError('Server config', error);
      onUpdate({});
    }
  );
}

/** settings/server: switches order placement to the placeOrder function (admin only) */
export async function saveServerConfigToFirestore(config: ServerConfig) {
  await setDoc(doc(db, 'settings', SERVER_CONFIG_DOC_ID), config, { merge: true });
}

/**
 * 4b. REVIEWS: `reviews/{productId}_{uid}` (the author edits only their own) and
 * `review_votes/{reviewId}_{uid}` (one «Полезно» per person). Not stored inside products.
 */
/** Every review, or one product's (`productId`: the customer reads only the reviews of the product page, stage 4) */
export function subscribeToReviews(onUpdate: (reviews: StoredReview[]) => void, productId?: string) {
  const ref = collection(db, 'reviews');
  return onSnapshot(
    productId ? query(ref, where('productId', '==', productId)) : ref,
    (snap) => onUpdate(snap.docs.map((d) => ({ ...(d.data() as StoredReview), id: d.id }))),
    (error) => logSubscriptionError('Reviews', error)
  );
}

export function subscribeToReviewVotes(onUpdate: (votes: ReviewVote[]) => void, productId?: string) {
  const ref = collection(db, 'review_votes');
  return onSnapshot(
    productId ? query(ref, where('productId', '==', productId)) : ref,
    (snap) => onUpdate(snap.docs.map((d) => d.data() as ReviewVote)),
    (error) => logSubscriptionError('Review votes', error)
  );
}

/** Pictures of a banner (null — none); read once per picture version in a visit */
const bannerImageRequests = new Map<string, Promise<BannerImagesDoc | null>>();
export function loadBannerImages(banner: Pick<BannerSlide, 'id' | 'imageKey'>): Promise<BannerImagesDoc | null> {
  const key = `${banner.id}:${banner.imageKey ?? ''}`;
  let pending = bannerImageRequests.get(key);
  if (!pending) {
    pending = trackRead(getDoc(doc(db, 'banner_images', banner.id)))
      .then((snap) => (snap.exists() ? (snap.data() as BannerImagesDoc) : null))
      .catch((error) => {
        // the slide keeps its placeholder; the next time it is shown it asks again
        bannerImageRequests.delete(key);
        console.warn(`Banner picture ${banner.id} was not read:`, error);
        return null;
      });
    bannerImageRequests.set(key, pending);
  }
  return pending;
}

export async function saveReviewToFirestore(review: StoredReview) {
  await setDoc(doc(db, 'reviews', review.id), sanitizeForFirestore(review));
}

export async function deleteReviewFromFirestore(reviewId: string) {
  await deleteDoc(doc(db, 'reviews', reviewId));
}

export async function setReviewVoteInFirestore(vote: ReviewVote, voted: boolean) {
  const ref = doc(db, 'review_votes', reviewVoteDocId(vote.reviewId, vote.uid));
  if (voted) await setDoc(ref, vote);
  else await deleteDoc(ref);
}

/**
 * 5. REAL-TIME SUPPORT CHAT MESSAGES
 */
/** Numeric timestamp prefix of ids like `msg-1727000000000` or `msg-1727000000000-ab12`. */
export function chatMessageOrder(msg: ChatMessage): number {
  // the server time first; a message not yet saved — the time in its id («msg-1791…»: the longest run of digits,
  // not the first one — «msg-receipt-WS-10000106-1791…» starts with the order number)
  if (typeof msg.sentAt === 'number') return msg.sentAt;
  const runs: string[] = msg.id.match(/\d+/g) ?? [];
  const longest = runs.reduce((best, run) => (run.length > best.length ? run : best), '');
  return longest ? Number(longest) : 0;
}

/** The old seeded greeting (`msg-welcome`, before the chat was split by customer) is never shown */
const LEGACY_WELCOME_ID = 'msg-welcome';

const toMillis = (value: unknown): number | undefined =>
  value instanceof Timestamp ? value.toMillis() : typeof value === 'number' ? value : undefined;

/** Server timestamps become milliseconds; a pending write gets the local estimate straight away */
function chatMessageFromSnapshot(snap: QueryDocumentSnapshot): ChatMessage {
  const data = snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>;
  const msg = { ...data, id: (data.id as string) || snap.id } as ChatMessage;
  const sentAt = toMillis(data.sentAt);
  const editedAt = toMillis(data.editedAt);
  if (sentAt === undefined) delete msg.sentAt;
  else msg.sentAt = sentAt;
  if (editedAt === undefined) delete msg.editedAt;
  else msg.editedAt = editedAt;
  return msg;
}

/** The customer edits or deletes their own message within this time (checked again by firestore.rules) */
const CUSTOMER_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canCustomerChangeMessage(msg: ChatMessage, now = Date.now()): boolean {
  return msg.sender === 'user' && typeof msg.sentAt === 'number' && now < msg.sentAt + CUSTOMER_EDIT_WINDOW_MS;
}

/**
 * Admins (no `thread`) receive every message; customers pass their chat identity and
 * receive only their own thread without internal staff notes (enforced by firestore.rules).
 */
export function subscribeToChatMessages(
  onUpdate: (msgs: ChatMessage[]) => void,
  onError?: (error: unknown) => void,
  thread?: { threadId: string; db: Firestore }
) {
  if (thread) {
    const threadQuery = query(
      collection(thread.db, 'chat_messages'),
      where('threadId', '==', thread.threadId),
      where('isInternalNote', '==', false)
    );
    return onSnapshot(
      threadQuery,
      (snapshot) => {
        const loaded = snapshot.docs.map(chatMessageFromSnapshot).filter((m) => m.id !== LEGACY_WELCOME_ID);
        loaded.sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b));
        // The greeting is drawn by the chat window itself; only real messages come from here
        onUpdate(loaded);
      },
      (error) => {
        logSubscriptionError('Chat thread', error);
        if (onError) onError(error);
      }
    );
  }

  // The newest 500 by the server time: without the order the query returned the 500 oldest, and after 500 messages new
  // requests no longer reached the admin (audit 02.10, finding 17). Messages without `sentAt` (an old site version)
  // are left out
  const colRef = collection(db, 'chat_messages');
  const q = query(colRef, orderBy('sentAt', 'desc'), limit(500));
  return onSnapshot(
    q,
    async (snapshot) => {
      // Demo messages are no longer seeded: every message belongs to a customer's thread
      const loaded: ChatMessage[] = [];
      snapshot.forEach((snap) => {
        if (snap.id !== LEGACY_WELCOME_ID) loaded.push(chatMessageFromSnapshot(snap));
      });
      loaded.sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b));
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Chat messages', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Admin: deletes one customer's thread (string), legacy messages without a thread (null),
 * or every message (undefined).
 */
export async function clearChatMessagesInFirestore(threadId?: string | null) {
  try {
    const colRef = collection(db, 'chat_messages');
    const snap = await getDocs(threadId ? query(colRef, where('threadId', '==', threadId)) : colRef);
    const docs = threadId === null ? snap.docs.filter((d) => !d.data().threadId) : snap.docs;
    const photos = docs.filter((d) => d.data().imageId).map((d) => doc(db, 'chat_images', d.id));
    await commitInChunks(photos, (batch, ref) => batch.delete(ref));
    await commitInChunks(docs, (batch, d) => batch.delete(d.ref));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'chat_messages');
  }
}

/** Chat photos already read in this visit */
const chatImageCache = new Map<string, string>();

/** The photo of a chat message kept apart (`imageId`); null — not readable or gone */
export async function loadChatImage(imageId: string, targetDb: Firestore = db): Promise<string | null> {
  const cached = chatImageCache.get(imageId);
  if (cached) return cached;
  try {
    const data = (await getDoc(doc(targetDb, 'chat_images', imageId))).data()?.data;
    if (typeof data !== 'string') return null;
    chatImageCache.set(imageId, data);
    return data;
  } catch (error) {
    console.warn(`Chat photo ${imageId} was not read:`, error);
    return null;
  }
}

export async function saveChatMessageToFirestore(msg: ChatMessage, targetDb: Firestore = db) {
  try {
    // isInternalNote must always be present: customers query their thread by isInternalNote == false
    let sanitizedMsg = { ...msg, isInternalNote: msg.isInternalNote === true };
    // a receipt photo is compressed for legibility by the payment window (up to the rules' 900 000 characters)
    if (!sanitizedMsg.receiptOrderId && sanitizedMsg.imageUrl && sanitizedMsg.imageUrl.startsWith('data:image/') && sanitizedMsg.imageUrl.length > 300 * 1024) {
      sanitizedMsg.imageUrl = await compressBase64Image(sanitizedMsg.imageUrl, 800, 800, 0.72);
    }
    // sentAt/editedAt are server times: firestore.rules require sentAt == request.time on create
    const { sentAt: _sentAt, editedAt: _editedAt, ...fields } = sanitizedMsg;
    // the photo goes to its own document in the same batch (stage 6, finding 20): the admin's chat is no longer
    // downloaded with every photo in it, a photo is read when it is shown
    const photo = typeof fields.imageUrl === 'string' && fields.imageUrl.startsWith('data:image/') ? fields.imageUrl : null;
    const batch = writeBatch(targetDb);
    if (photo) {
      delete fields.imageUrl;
      batch.set(doc(targetDb, 'chat_images', msg.id), { data: photo });
      chatImageCache.set(msg.id, photo);
    }
    batch.set(doc(targetDb, 'chat_messages', msg.id), {
      ...sanitizeForFirestore(photo ? { ...fields, imageId: msg.id } : fields),
      sentAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chat_messages/${msg.id}`);
  }
}

/** New text of a message (the customer — own message within 15 minutes, staff — any time) */
async function editChatMessage(messageId: string, text: string, targetDb: Firestore = db) {
  try {
    await updateDoc(doc(targetDb, 'chat_messages', messageId), { text, editedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chat_messages/${messageId}`);
  }
}

/** «Удалить у себя»: the message stays for the other side */
async function setChatMessageHidden(
  messageId: string,
  side: 'customer' | 'staff',
  hidden: boolean,
  targetDb: Firestore = db
) {
  const field = side === 'customer' ? 'hiddenForCustomer' : 'hiddenForStaff';
  try {
    await updateDoc(doc(targetDb, 'chat_messages', messageId), { [field]: hidden });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chat_messages/${messageId}`);
  }
}

/** «Удалить у всех» */
async function deleteChatMessage(messageId: string, targetDb: Firestore = db) {
  try {
    // its photo document goes with it (none — the delete does nothing)
    const batch = writeBatch(targetDb);
    batch.delete(doc(targetDb, 'chat_images', messageId));
    batch.delete(doc(targetDb, 'chat_messages', messageId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chat_messages/${messageId}`);
  }
}

export type ChatMessageChange =
  | { type: 'edit'; id: string; text: string }
  | { type: 'hide'; id: string; side: 'customer' | 'staff'; hidden: boolean }
  | { type: 'delete'; id: string };

export function applyChatMessageChange(change: ChatMessageChange, targetDb: Firestore = db) {
  if (change.type === 'edit') return editChatMessage(change.id, change.text, targetDb);
  if (change.type === 'hide') return setChatMessageHidden(change.id, change.side, change.hidden, targetDb);
  return deleteChatMessage(change.id, targetDb);
}

/** The same change applied to the local list (before the server confirms it) */
export function applyChatMessageChangeLocally(messages: ChatMessage[], change: ChatMessageChange): ChatMessage[] {
  if (change.type === 'delete') return messages.filter((m) => m.id !== change.id);
  return messages.map((m) => {
    if (m.id !== change.id) return m;
    if (change.type === 'edit') return { ...m, text: change.text, editedAt: Date.now() };
    return { ...m, [change.side === 'customer' ? 'hiddenForCustomer' : 'hiddenForStaff']: change.hidden };
  });
}

/** Customer: the status of their own dialog set by the staff (null — not set yet) */
export function subscribeToSupportStatus(
  threadId: string,
  targetDb: Firestore,
  onUpdate: (status: SupportStatus | null) => void
) {
  return onSnapshot(
    doc(targetDb, 'support_status', threadId),
    (snap) => {
      const data = snap.data() as Partial<SupportStatus> | undefined;
      onUpdate(data?.status ? { status: data.status, updatedAt: Number(data.updatedAt) || 0 } : null);
    },
    (error) => logSubscriptionError('Support status', error)
  );
}

/** Admin: status and priority of every support dialog, keyed by threadId */
export function subscribeToSupportThreads(onUpdate: (meta: Record<string, SupportThreadMeta>) => void) {
  return onSnapshot(
    collection(db, 'support_threads'),
    (snapshot) => {
      const byThread: Record<string, SupportThreadMeta> = {};
      snapshot.forEach((snap) => {
        byThread[snap.id] = { ...(snap.data() as SupportThreadMeta), threadId: snap.id };
      });
      onUpdate(byThread);
    },
    (error) => logSubscriptionError('Support threads', error)
  );
}

export async function saveSupportThreadMeta(
  threadId: string,
  meta: Partial<Pick<SupportThreadMeta, 'status' | 'priority'>>
) {
  try {
    const updatedAt = Date.now();
    const batch = writeBatch(db);
    batch.set(doc(db, 'support_threads', threadId), { ...meta, threadId, updatedAt }, { merge: true });
    // The status (not the priority) is shown to the customer
    if (meta.status) batch.set(doc(db, 'support_status', threadId), { status: meta.status, updatedAt });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `support_threads/${threadId}`);
  }
}

/**
 * 6. USER PROFILE & CUSTOMERS SYNC
 */
/**
 * Admin only: all customer profiles merged with manager notes/tags, which live in the
 * admin-only `customer_notes` collection (customers can read their own users/{uid} doc).
 */
export function subscribeToUsers(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (error: unknown) => void
) {
  let users: { docId: string; data: UserProfile }[] | null = null;
  let notes = new Map<string, Pick<UserProfile, 'managerNotes' | 'tags'>>();

  const emit = () => {
    if (!users) return;
    onUpdate(
      users.map(({ docId, data }) => {
        const note = notes.get(docId);
        return note ? { ...data, ...note } : data;
      })
    );
  };

  const unsubNotes = onSnapshot(
    collection(db, 'customer_notes'),
    (snapshot) => {
      notes = new Map(snapshot.docs.map((d) => [d.id, d.data() as Pick<UserProfile, 'managerNotes' | 'tags'>]));
      emit();
    },
    (error) => logSubscriptionError('Customer notes', error)
  );

  const colRef = collection(db, 'users');
  const unsubUsers = onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        users = [];
        emit();
        return;
      }
      users = snapshot.docs.map((snap) => ({ docId: snap.id, data: snap.data() as UserProfile }));
      emit();
    },
    (error) => {
      logSubscriptionError('Users', error);
      if (onError) onError(error);
    }
  );

  return () => {
    unsubNotes();
    unsubUsers();
  };
}

/**
 * Subscribes to a single customer's own profile document (users/{uid}).
 */
export function subscribeToOwnUserProfile(
  uid: string,
  onUpdate: (users: UserProfile[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onUpdate(snap.exists() ? [snap.data() as UserProfile] : []);
    },
    (error) => {
      logSubscriptionError('User profile', error);
      if (onError) onError(error);
    }
  );
}


/** Fields only admins may change (enforced by firestore.rules); never sent from the profile screen. */
const ADMIN_ONLY_PROFILE_FIELDS = ['bonusPoints', 'managerNotes', 'tags'] as const;

export async function saveUserProfileToFirestore(uid: string, profile: UserProfile) {
  try {
    // the avatar is only the Google account's photo or none: «Клиенты» show it to the owner (audit 07.10, finding 8)
    const editable: Record<string, unknown> = { ...profile, avatar: googleAvatarUrl(profile.avatar) };
    for (const field of ADMIN_ONLY_PROFILE_FIELDS) {
      delete editable[field];
    }
    await setDoc(
      doc(db, 'users', uid),
      sanitizeForFirestore({
        ...editable,
        uid,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateCustomerNotesInFirestore(uidOrDocId: string, notes: string, tags?: string[]) {
  try {
    const docRef = doc(db, 'customer_notes', uidOrDocId);
    const updatePayload: Record<string, unknown> = {
      managerNotes: notes,
      updatedAt: new Date().toISOString(),
    };
    if (tags !== undefined) {
      updatePayload.tags = tags;
    }
    await setDoc(docRef, sanitizeForFirestore(updatePayload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customer_notes/${uidOrDocId}`);
  }
}

export async function deleteUserFromFirestore(userId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId));
    await deleteDoc(doc(db, 'customer_notes', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

/**
 * 7. DELIVERY METHODS SYNC
 */
export function subscribeToDeliveryMethods(
  onUpdate: (methods: DeliveryMethod[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'delivery_methods');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      // Empty means the owner has not added any (or removed the demo ones): show nothing.
      // Demo data from deliveryData.ts is never shown to customers or written back.
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: DeliveryMethod[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as DeliveryMethod);
      });
      loaded.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Delivery methods', error);
      if (onError) onError(error);
    }
  );
}



export async function syncAllDeliveryMethodsToFirestore(methods: DeliveryMethod[]) {
  try {
    await setDocs('delivery_methods', methods.map((method, i) => ({ ...method, sortOrder: i + 1 })));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'delivery_methods');
  }
}

/**
 * 8. PICKUP POINTS SYNC
 */
export function subscribeToPickupPoints(
  onUpdate: (points: PickupPoint[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'pickup_points');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      // Empty means the owner has not added any (or removed the demo ones): show nothing.
      // Demo data from deliveryData.ts is never shown to customers or written back.
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const loaded: PickupPoint[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as PickupPoint);
      });
      onUpdate(loaded);
    },
    (error) => {
      logSubscriptionError('Pickup points', error);
      if (onError) onError(error);
    }
  );
}



export async function syncAllPickupPointsToFirestore(points: PickupPoint[]) {
  try {
    await setDocs('pickup_points', points);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'pickup_points');
  }
}

/**
 * 10a. ERRORS ON CUSTOMERS' SCREENS (docs/ops-plan.md, stage 2): any visitor creates a report, only the admin reads
 * and removes them (firestore.rules, isClientErrorReport)
 */
/** Creates the report; fails when the slot is taken (the rules allow no overwrite) — the caller tries another slot */
export async function saveClientError(id: string, report: ClientErrorReport): Promise<void> {
  await setDoc(doc(db, CLIENT_ERRORS_COLLECTION, id), { ...report, createdAt: serverTimestamp() });
}

export function subscribeToClientErrors(
  onUpdate: (errors: StoredClientError[]) => void,
  onError: (error: unknown) => void,
  max = 300
) {
  return onSnapshot(
    query(collection(db, CLIENT_ERRORS_COLLECTION), orderBy('createdAt', 'desc'), limit(max)),
    (snapshot) => {
      const list: StoredClientError[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as ClientErrorReport & { createdAt?: Timestamp | null };
        if (!data || typeof data.message !== 'string') return;
        list.push({ ...data, id: snap.id, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0 });
      });
      onUpdate(list);
    },
    onError
  );
}

export async function deleteClientErrors(ids: string[]): Promise<void> {
  await commitInChunks(ids, (batch, id) => batch.delete(doc(db, CLIENT_ERRORS_COLLECTION, id)));
}

/** Reports older than `beforeMs` (at most 400 per call: the card calls it each time it opens) */
export async function deleteClientErrorsBefore(beforeMs: number): Promise<number> {
  const old = await getDocs(
    query(collection(db, CLIENT_ERRORS_COLLECTION), where('createdAt', '<', Timestamp.fromMillis(beforeMs)), limit(400))
  );
  await deleteClientErrors(old.docs.map((d) => d.id));
  return old.size;
}

/**
 * 11. DATABASE BACKUP (admin only)
 */
/** Every collection of the store; `test` holds only the connection probe */
export const BACKUP_COLLECTIONS = [
  'products', 'product_previews', 'product_photos', 'product_costs', 'promos', 'settings', 'banners', 'banner_images', 'delivery_methods', 'pickup_points',
  'orders', 'users', 'customer_notes', 'admins', 'reviews', 'review_votes',
  'chat_messages', 'chat_images', 'support_threads', 'support_status', STOCK_MOVEMENTS_COLLECTION, 'promo_uses', 'payment_templates',
  PRICE_CHANGES_COLLECTION,
] as const;

export interface DatabaseBackup {
  format: 'wasat-shop-backup';
  version: 1;
  createdAt: string;
  databaseId: string;
  collections: Record<string, { id: string; data: unknown }[]>;
  /** Collections the admin session could not read, with the error */
  failed: Record<string, string>;
}

/** Timestamps become `{ __timestamp: ISO }`, so a restore can write them back as dates */
function toBackupValue(value: unknown): unknown {
  if (value instanceof Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(toBackupValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toBackupValue(v)]));
  }
  return value;
}

/** Admin's quick phrases (`settings/quick_phrases`, admin only — finding 49); null — not saved yet (phrasesSync.ts) */
export function subscribeToQuickPhrasesDoc<T>(onData: (data: Partial<T> | null) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    doc(db, 'settings', 'quick_phrases'),
    (snapshot) => onData(snapshot.exists() ? (snapshot.data() as Partial<T>) : null),
    (error) => {
      logSubscriptionError('Firestore Quick Phrases', error);
      onError?.(error);
    }
  );
}

export async function saveQuickPhrasesDoc(data: object): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'quick_phrases'), sanitizeForFirestore(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/quick_phrases');
  }
}

/** Ids of the documents now in these collections (the «Только недостающие» restore): reads, writes nothing */
export async function readExistingIds(names: string[]): Promise<Record<string, Set<string>>> {
  const result: Record<string, Set<string>> = {};
  for (const name of names) {
    const snapshot = await getDocs(collection(db, name));
    result[name] = new Set(snapshot.docs.map((d) => d.id));
  }
  return result;
}

/**
 * Writes a restore plan (backupRestore.ts) in batches; `onProgress` gets the number written. Nothing is deleted.
 * A refused batch stops the restore: what was written stays, the error names the collection.
 */
export async function restoreDatabase(
  chunks: RestoreWrite[][],
  onProgress: (written: number) => void
): Promise<number> {
  let written = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const write of chunk) {
      // a restored order is a write of an order like any other: its time of change is now, not the copy's
      // (docs/orders-scale-plan.md, stage 2), so the admin's index takes it in
      const data = write.collection === 'orders' ? { ...write.data, updatedAt: serverTimestamp() } : write.data;
      batch.set(doc(db, write.collection, write.id), data);
    }
    try {
      await batch.commit();
    } catch (error) {
      const names = [...new Set(chunk.map((w) => w.collection))].join(', ');
      throw new Error(`Не записано: ${names} (${error instanceof Error ? error.message : String(error)})`);
    }
    written += chunk.length;
    onProgress(written);
  }
  return written;
}

/** Reads every collection of the store (admin session). Reads only: nothing is written to the database. */
export async function exportDatabase(databaseId: string): Promise<DatabaseBackup> {
  const backup: DatabaseBackup = {
    format: 'wasat-shop-backup', version: 1, createdAt: new Date().toISOString(), databaseId, collections: {}, failed: {},
  };
  for (const name of BACKUP_COLLECTIONS) {
    try {
      const snapshot = await getDocs(collection(db, name));
      backup.collections[name] = snapshot.docs.map((d) => ({ id: d.id, data: toBackupValue(d.data()) }));
    } catch (error) {
      backup.failed[name] = error instanceof Error ? error.message : String(error);
    }
  }
  return backup;
}
