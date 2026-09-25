import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Order, OrderStatusHistoryStep, PromoCode, StorefrontSettings, ChatMessage, UserProfile, BannerSlide, DeliveryMethod, PickupPoint } from '../types';
import { PRODUCTS, INITIAL_ORDERS } from '../data/products';
import { INITIAL_PROMO_CODES, INITIAL_CHAT_MESSAGES, INITIAL_BANNER_SLIDES } from '../data/marketingAndSupport';
import { INITIAL_DELIVERY_METHODS, INITIAL_PICKUP_POINTS } from '../data/deliveryData';
import { INITIAL_FIRESTORE_USERS } from '../data/initialCustomers';
import { DEFAULT_STOREFRONT_SETTINGS } from './inventory';
import { compressBase64Image } from './imageUpload';
import { getDefaultHistorySteps, getSynchronizedDeliveryStages, isTransportCompanyDelivery } from './deliveryStages';

/**
 * Global locks and session tracking to prevent duplicate or overflowing write stream queues.
 */
const inFlightSeedOperations = new Set<string>();
const seededCollections = new Set<string>();

function hasAlreadySeeded(collectionName: string): boolean {
  if (seededCollections.has(collectionName)) return true;
  try {
    const val = sessionStorage.getItem(`manstyle_seeded_${collectionName}`);
    if (val === 'true') {
      seededCollections.add(collectionName);
      return true;
    }
  } catch {
    // Ignore storage issues
  }
  return false;
}

function markCollectionSeeded(collectionName: string) {
  seededCollections.add(collectionName);
  try {
    sessionStorage.setItem(`manstyle_seeded_${collectionName}`, 'true');
  } catch {
    // Ignore storage issues
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
      if (snapshot.empty) {
        if (!hasAlreadySeeded('products') && !inFlightSeedOperations.has('products')) {
          try {
            await seedInitialProducts();
          } catch (seedErr) {
            console.warn('Could not seed initial products to Firestore:', seedErr);
          }
        }
        onUpdate(PRODUCTS);
        return;
      }
      markCollectionSeeded('products');
      const loaded: Product[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as Product);
      });
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Products subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function seedInitialProducts() {
  if (inFlightSeedOperations.has('products')) return;
  inFlightSeedOperations.add('products');
  try {
    const batch = writeBatch(db);
    for (const prod of PRODUCTS) {
      batch.set(doc(db, 'products', prod.id), sanitizeForFirestore(prod));
    }
    await batch.commit();
    markCollectionSeeded('products');
  } catch (e) {
    console.warn('Could not seed initial products with batch:', e);
  } finally {
    inFlightSeedOperations.delete('products');
  }
}

export async function saveProductToFirestore(product: Product) {
  try {
    await setDoc(doc(db, 'products', product.id), sanitizeForFirestore(product));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `products/${product.id}`);
  }
}

export async function saveModifiedProductsToFirestore(productsToSave: Product[]) {
  if (productsToSave.length === 0) return;
  if (productsToSave.length === 1) {
    await saveProductToFirestore(productsToSave[0]);
    return;
  }
  try {
    const batch = writeBatch(db);
    for (const prod of productsToSave) {
      batch.set(doc(db, 'products', prod.id), sanitizeForFirestore(prod));
    }
    await batch.commit();
  } catch (error) {
    console.warn('Error batch-saving modified products:', error);
  }
}

export async function deleteProductFromFirestore(productId: string) {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

export async function syncAllProductsToFirestore(products: Product[]) {
  try {
    const batch = writeBatch(db);
    for (const prod of products) {
      batch.set(doc(db, 'products', prod.id), sanitizeForFirestore(prod));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
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
  const isTK = isTransportCompanyDelivery(rawDeliveryMethod, rawTrackingCompany);
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
    deliveryMethod: String(raw.deliveryMethod ?? raw.delivery_method ?? 'Курьерская доставка'),
    paymentMethod: String(raw.paymentMethod ?? raw.payment_method ?? 'Карта (онлайн)'),
    paymentStatus: raw.paymentStatus ?? raw.payment_status ?? 'paid',
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
        // If collection in database is empty, return empty real array
        markCollectionSeeded('orders');
        onUpdate([]);
        return;
      }
      markCollectionSeeded('orders');
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
      console.warn('Orders subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function seedInitialOrders() {
  if (inFlightSeedOperations.has('orders')) return;
  inFlightSeedOperations.add('orders');
  try {
    const batch = writeBatch(db);
    for (const ord of INITIAL_ORDERS) {
      batch.set(doc(db, 'orders', ord.id), sanitizeForFirestore(ord));
    }
    await batch.commit();
    markCollectionSeeded('orders');
  } catch (e) {
    console.warn('Could not batch seed initial orders:', e);
  } finally {
    inFlightSeedOperations.delete('orders');
  }
}

export async function handleCompleteOrderFirestoreSync(order: Order): Promise<void> {
  try {
    const sanitized = sanitizeForFirestore(order);
    await setDoc(doc(db, 'orders', order.id), sanitized);
  } catch (error) {
    console.error(`[Firestore handleCompleteOrder] Error persisting order "${order.id}":`, error);
    handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`);
    throw error;
  }
}

export async function saveOrderToFirestore(order: Order) {
  return handleCompleteOrderFirestoreSync(order);
}

export async function deleteOrderFromFirestore(orderId: string) {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
  }
}

/**
 * Permanently purges and deletes all orders and analytics statistics from Firestore database.
 */
export async function deleteAllOrdersAndStatsFromFirestore(): Promise<{ deletedCount: number }> {
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    if (ordersSnap.empty) {
      markCollectionSeeded('orders');
      return { deletedCount: 0 };
    }

    const docs = ordersSnap.docs;
    let deletedCount = 0;

    // Process in batches of 400 (Firestore writeBatch limit is 500)
    for (let i = 0; i < docs.length; i += 400) {
      const chunk = docs.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        batch.delete(d.ref);
        deletedCount++;
      });
      await batch.commit();
    }

    markCollectionSeeded('orders');
    try {
      localStorage.setItem('manstyle_orders_cleared', 'true');
      sessionStorage.removeItem('manstyle_cached_orders');
    } catch {
      // Ignore storage errors
    }

    return { deletedCount };
  } catch (error) {
    console.error('[deleteAllOrdersAndStatsFromFirestore] Error:', error);
    handleFirestoreError(error, OperationType.DELETE, 'orders');
    throw error;
  }
}

export async function syncAllOrdersToFirestore(orders: Order[]) {
  try {
    const batch = writeBatch(db);
    for (const ord of orders) {
      batch.set(doc(db, 'orders', ord.id), sanitizeForFirestore(ord));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'orders');
  }
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
        if (!hasAlreadySeeded('promos') && !inFlightSeedOperations.has('promos')) {
          try {
            await seedInitialPromos();
          } catch (e) {
            console.warn('Could not seed initial promos:', e);
          }
        }
        onUpdate(INITIAL_PROMO_CODES);
        return;
      }
      markCollectionSeeded('promos');
      const loaded: PromoCode[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push(docSnap.data() as PromoCode);
      });
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Promos subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function seedInitialPromos() {
  if (inFlightSeedOperations.has('promos')) return;
  inFlightSeedOperations.add('promos');
  try {
    const batch = writeBatch(db);
    for (const p of INITIAL_PROMO_CODES) {
      batch.set(doc(db, 'promos', p.id), sanitizeForFirestore(p));
    }
    await batch.commit();
    markCollectionSeeded('promos');
  } catch (e) {
    console.warn('Could not batch seed promos:', e);
  } finally {
    inFlightSeedOperations.delete('promos');
  }
}

export async function savePromoToFirestore(promo: PromoCode) {
  try {
    await setDoc(doc(db, 'promos', promo.id), sanitizeForFirestore(promo));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `promos/${promo.id}`);
  }
}

export async function deletePromoFromFirestore(promoId: string) {
  try {
    await deleteDoc(doc(db, 'promos', promoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `promos/${promoId}`);
  }
}

export async function syncAllPromosToFirestore(promos: PromoCode[]) {
  try {
    const batch = writeBatch(db);
    for (const promo of promos) {
      batch.set(doc(db, 'promos', promo.id), sanitizeForFirestore(promo));
    }
    await batch.commit();
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
        if (!hasAlreadySeeded('storefront_settings') && !inFlightSeedOperations.has('storefront_settings')) {
          inFlightSeedOperations.add('storefront_settings');
          try {
            await setDoc(docRef, sanitizeForFirestore(DEFAULT_STOREFRONT_SETTINGS));
            markCollectionSeeded('storefront_settings');
          } catch (e) {
            console.warn('Could not seed storefront settings:', e);
          } finally {
            inFlightSeedOperations.delete('storefront_settings');
          }
        }
        onUpdate(DEFAULT_STOREFRONT_SETTINGS);
        return;
      }
      markCollectionSeeded('storefront_settings');
      onUpdate(snapshot.data() as StorefrontSettings);
    },
    (error) => {
      console.warn('Storefront settings subscription warning:', error);
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
        if (!hasAlreadySeeded('banners') && !inFlightSeedOperations.has('banners')) {
          inFlightSeedOperations.add('banners');
          try {
            const batch = writeBatch(db);
            for (let i = 0; i < INITIAL_BANNER_SLIDES.length; i++) {
              const b = { ...INITIAL_BANNER_SLIDES[i], order: i };
              batch.set(doc(db, 'banners', b.id), sanitizeForFirestore(b));
            }
            await batch.commit();
            markCollectionSeeded('banners');
          } catch (e) {
            console.warn('Could not seed initial banners:', e);
          } finally {
            inFlightSeedOperations.delete('banners');
          }
        }
        onUpdate(INITIAL_BANNER_SLIDES);
        return;
      }
      markCollectionSeeded('banners');
      const loaded: BannerSlide[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as BannerSlide);
      });
      loaded.sort((a, b) => ((a as any).order ?? 0) - ((b as any).order ?? 0));
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Banners subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function syncAllBannersToFirestore(banners: BannerSlide[]) {
  try {
    const batch = writeBatch(db);
    for (let i = 0; i < banners.length; i++) {
      const bannerWithOrder = { ...banners[i], order: i };
      batch.set(doc(db, 'banners', banners[i].id), sanitizeForFirestore(bannerWithOrder));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'banners');
  }
}

export async function deleteBannerFromFirestore(bannerId: string) {
  try {
    await deleteDoc(doc(db, 'banners', bannerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `banners/${bannerId}`);
  }
}

/**
 * 5. REAL-TIME SUPPORT CHAT MESSAGES
 */
export function subscribeToChatMessages(
  onUpdate: (messages: ChatMessage[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'chat_messages');
  const q = query(colRef, limit(100));
  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        if (!hasAlreadySeeded('chat_messages') && !inFlightSeedOperations.has('chat_messages')) {
          inFlightSeedOperations.add('chat_messages');
          try {
            const batch = writeBatch(db);
            for (const msg of INITIAL_CHAT_MESSAGES) {
              batch.set(doc(db, 'chat_messages', msg.id), sanitizeForFirestore(msg));
            }
            await batch.commit();
            markCollectionSeeded('chat_messages');
          } catch (e) {
            console.warn('Could not seed chat messages:', e);
          } finally {
            inFlightSeedOperations.delete('chat_messages');
          }
        }
        onUpdate(INITIAL_CHAT_MESSAGES);
        return;
      }
      markCollectionSeeded('chat_messages');
      const loaded: ChatMessage[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as ChatMessage);
      });
      loaded.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Chat messages subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function clearChatMessagesInFirestore() {
  try {
    const colRef = collection(db, 'chat_messages');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const batch = writeBatch(db);
      for (const d of snap.docs) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('Could not clear chat messages in Firestore:', err);
  }
}

export async function saveChatMessageToFirestore(msg: ChatMessage) {
  try {
    let sanitizedMsg = { ...msg };
    if (sanitizedMsg.imageUrl && sanitizedMsg.imageUrl.startsWith('data:image/') && sanitizedMsg.imageUrl.length > 300 * 1024) {
      sanitizedMsg.imageUrl = await compressBase64Image(sanitizedMsg.imageUrl, 800, 800, 0.72);
    }
    await setDoc(doc(db, 'chat_messages', msg.id), sanitizeForFirestore(sanitizedMsg));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chat_messages/${msg.id}`);
  }
}

/**
 * 6. USER PROFILE & CUSTOMERS SYNC
 */
export function subscribeToUsers(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (error: unknown) => void
) {
  const colRef = collection(db, 'users');
  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        if (!hasAlreadySeeded('users') && !inFlightSeedOperations.has('users')) {
          try {
            await seedInitialUsers();
          } catch (e) {
            console.warn('Could not seed initial users:', e);
          }
        }
        onUpdate(INITIAL_FIRESTORE_USERS);
        return;
      }
      markCollectionSeeded('users');
      const loaded: UserProfile[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as UserProfile);
      });
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Users subscription warning:', error);
      if (onError) onError(error);
    }
  );
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
      console.warn('User profile subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function seedInitialUsers() {
  if (inFlightSeedOperations.has('users')) return;
  inFlightSeedOperations.add('users');
  try {
    const batch = writeBatch(db);
    for (const u of INITIAL_FIRESTORE_USERS) {
      const docId = u.uid || `user-${u.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      batch.set(doc(db, 'users', docId), sanitizeForFirestore(u));
    }
    await batch.commit();
    markCollectionSeeded('users');
  } catch (e) {
    console.warn('Could not batch seed users:', e);
  } finally {
    inFlightSeedOperations.delete('users');
  }
}

export async function saveUserProfileToFirestore(uid: string, profile: UserProfile) {
  try {
    await setDoc(
      doc(db, 'users', uid),
      sanitizeForFirestore({
        ...profile,
        uid,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function updateCustomerNotesInFirestore(uidOrDocId: string, notes: string, tags?: string[]) {
  try {
    const docRef = doc(db, 'users', uidOrDocId);
    const updatePayload: Record<string, unknown> = {
      managerNotes: notes,
      updatedAt: new Date().toISOString(),
    };
    if (tags !== undefined) {
      updatePayload.tags = tags;
    }
    await setDoc(docRef, sanitizeForFirestore(updatePayload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uidOrDocId}`);
  }
}

export async function deleteUserFromFirestore(userId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

/**
 * Purges all fake/mock customer profiles and mock orders from Firestore,
 * preserving only real registered users.
 */
export async function purgeFakeDataFromFirestore(adminEmail: string = 'gunh83975@gmail.com'): Promise<{ deletedUsers: number; deletedOrders: number }> {
  let deletedUsers = 0;
  let deletedOrders = 0;

  try {
    // 1. Clean fake users using writeBatch
    const usersSnap = await getDocs(collection(db, 'users'));
    const userBatch = writeBatch(db);
    let hasUserDeletes = false;

    for (const d of usersSnap.docs) {
      const data = d.data() as UserProfile;
      const email = (data.email || '').toLowerCase().trim();
      const isRealAdmin = email === adminEmail.toLowerCase().trim() || d.id === 'user-admin-001';
      const isKnownFakeUser = [
        'ivan.petrov@gmail.com',
        'alex.morozov@inbox.ru',
        'dmitry.sokolov@yandex.ru',
        'sergey.volkov@gmail.com',
      ].includes(email) || ['user-ivan-002', 'user-alex-003', 'user-dmitry-004', 'user-sergey-005'].includes(d.id);

      if (isKnownFakeUser || (!isRealAdmin && (d.id.startsWith('user-ivan') || d.id.startsWith('user-alex') || d.id.startsWith('user-dmitry') || d.id.startsWith('user-sergey')))) {
        userBatch.delete(d.ref);
        hasUserDeletes = true;
        deletedUsers++;
      }
    }

    if (hasUserDeletes) {
      await userBatch.commit();
    }

    // 2. Clean fake mock orders using writeBatch
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const knownMockOrderIds = new Set(['MS-8420', 'MS-7912', 'MS-9824', 'MS-5574', 'MS-1042', 'MS-3319']);
    const orderBatch = writeBatch(db);
    let hasOrderDeletes = false;

    for (const d of ordersSnap.docs) {
      const data = d.data() as Order;
      const custEmail = (data.customerEmail || '').toLowerCase().trim();
      const isFakeEmail = ['ivan.petrov@gmail.com', 'alex.morozov@inbox.ru', 'dmitry.sokolov@yandex.ru', 'sergey.volkov@gmail.com'].includes(custEmail);
      if (knownMockOrderIds.has(d.id) || isFakeEmail) {
        orderBatch.delete(d.ref);
        hasOrderDeletes = true;
        deletedOrders++;
      }
    }

    if (hasOrderDeletes) {
      await orderBatch.commit();
    }
  } catch (error) {
    console.warn('Error during purgeFakeDataFromFirestore:', error);
    throw error;
  }

  return { deletedUsers, deletedOrders };
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
      if (snapshot.empty) {
        if (!hasAlreadySeeded('delivery_methods') && !inFlightSeedOperations.has('delivery_methods')) {
          inFlightSeedOperations.add('delivery_methods');
          try {
            const batch = writeBatch(db);
            for (let i = 0; i < INITIAL_DELIVERY_METHODS.length; i++) {
              const m = { ...INITIAL_DELIVERY_METHODS[i], sortOrder: i + 1 };
              batch.set(doc(db, 'delivery_methods', m.id), sanitizeForFirestore(m));
            }
            await batch.commit();
            markCollectionSeeded('delivery_methods');
          } catch (e) {
            console.warn('Could not seed initial delivery methods:', e);
          } finally {
            inFlightSeedOperations.delete('delivery_methods');
          }
        }
        onUpdate(INITIAL_DELIVERY_METHODS);
        return;
      }
      markCollectionSeeded('delivery_methods');
      const loaded: DeliveryMethod[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as DeliveryMethod);
      });
      loaded.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Delivery methods subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function saveDeliveryMethodToFirestore(method: DeliveryMethod) {
  try {
    await setDoc(doc(db, 'delivery_methods', method.id), sanitizeForFirestore(method));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `delivery_methods/${method.id}`);
  }
}

export async function deleteDeliveryMethodFromFirestore(methodId: string) {
  try {
    await deleteDoc(doc(db, 'delivery_methods', methodId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `delivery_methods/${methodId}`);
  }
}

export async function syncAllDeliveryMethodsToFirestore(methods: DeliveryMethod[]) {
  try {
    const batch = writeBatch(db);
    for (let i = 0; i < methods.length; i++) {
      const item = { ...methods[i], sortOrder: i + 1 };
      batch.set(doc(db, 'delivery_methods', item.id), sanitizeForFirestore(item));
    }
    await batch.commit();
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
      if (snapshot.empty) {
        if (!hasAlreadySeeded('pickup_points') && !inFlightSeedOperations.has('pickup_points')) {
          inFlightSeedOperations.add('pickup_points');
          try {
            const batch = writeBatch(db);
            for (const pt of INITIAL_PICKUP_POINTS) {
              batch.set(doc(db, 'pickup_points', pt.id), sanitizeForFirestore(pt));
            }
            await batch.commit();
            markCollectionSeeded('pickup_points');
          } catch (e) {
            console.warn('Could not seed initial pickup points:', e);
          } finally {
            inFlightSeedOperations.delete('pickup_points');
          }
        }
        onUpdate(INITIAL_PICKUP_POINTS);
        return;
      }
      markCollectionSeeded('pickup_points');
      const loaded: PickupPoint[] = [];
      snapshot.forEach((snap) => {
        loaded.push(snap.data() as PickupPoint);
      });
      onUpdate(loaded);
    },
    (error) => {
      console.warn('Pickup points subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function savePickupPointToFirestore(point: PickupPoint) {
  try {
    await setDoc(doc(db, 'pickup_points', point.id), sanitizeForFirestore(point));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pickup_points/${point.id}`);
  }
}

export async function deletePickupPointFromFirestore(pointId: string) {
  try {
    await deleteDoc(doc(db, 'pickup_points', pointId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `pickup_points/${pointId}`);
  }
}

export async function syncAllPickupPointsToFirestore(points: PickupPoint[]) {
  try {
    const batch = writeBatch(db);
    for (const pt of points) {
      batch.set(doc(db, 'pickup_points', pt.id), sanitizeForFirestore(pt));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'pickup_points');
  }
}
