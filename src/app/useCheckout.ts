import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ActiveTab, AppliedPromoInfo, CartItem, DeliveryMethod, Order, Product, PromoCode, StorefrontSettings, UserProfile } from '../types';
import { ChatIdentity, createGuestChatIdentity, db, placeOrderOnServer } from '../firebase';
import { placeClientOrder, orderRateWaitSeconds, deductOrderLineStock, recordPromoUsageInFirestore } from '../utils/firebaseSync';
import {
  withOrderDeducted,
  orderStockProblems,
  stockProblemText,
  isPreorderVariant,
  extractColorName,
  extractSizeName,
  getOrderableStock,
} from '../utils/inventory';
import { formatAddress } from '../utils/addressFormat';
import { buildClientOrder } from '../utils/clientOrder';
import { pluralRu } from '../utils/pluralize';
import { QUICK_ORDER_DELIVERY_ID, promoSignInProblem } from '../shared/orderPricing';
import { linePrice, toOrderLineProduct } from '../shared/orderLine';
import { brokenPackExcess, goesBrokenPack, isBrokenPackLine, isWholesaleLine, priceCartLines, wholesaleLineProblems } from '../shared/wholesalePricing';
import { expandPackLines, isCartPackLine, ORDER_LINES_MAX, packLineProblems, soldPack } from '../shared/packLines';
import { STORE_PAUSED_TEXT, storeAcceptsOrders } from '../shared/orderApi';
import { cleanAddressParts, fullName, hasNameParts, namePartsOf, type AddressParts, type PersonName } from '../shared/personName';
import { liveProductsRead, useLiveProducts } from '../utils/liveProducts';
import { isBrowserOffline, ORDER_SAVE_TIMEOUT_MS, settleWithin, type Settled } from '../utils/network';
import { saveGuestOrder } from './guestOrders';
import type { AddToast } from './useToasts';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

// What the checkout and «Заказ в 1 клик» send
export type CompleteOrderData = {
  items: CartItem[];
  contact?: { name: string; phone: string; email?: string } & PersonName;
  address?: string;
  addressParts?: AddressParts;
  deliveryMethod?: string;
  deliveryMethodId?: string; // absent for the one-click quick order
  totalPrice?: number;
  deliveryFee?: number;
  discountAmount?: number;
  paymentMethod?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
};

type CheckoutOptions = {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  userProfile: UserProfile;
  products: Product[];
  /** The catalog answered: before it the cart holds light copies without stock (audit 29.10, finding 2) */
  productsLoaded: boolean;
  setProducts: SetState<Product[]>;
  setSelectedProduct: SetState<Product | null>;
  cartItems: CartItem[];
  setCartItems: SetState<CartItem[]>;
  appliedPromo: AppliedPromoInfo | null;
  setAppliedPromo: SetState<AppliedPromoInfo | null>;
  promos: PromoCode[];
  preorderMode: boolean;
  deliveryMethods: DeliveryMethod[];
  storefrontSettings: StorefrontSettings;
  serverOrdersEnabled: boolean;
  chatIdentity: ChatIdentity | null;
  setChatIdentity: SetState<ChatIdentity | null>;
  setOrders: SetState<Order[]>;
  addToast: AddToast;
};

/**
 * Placing an order: by the browser (`completeOrderLocally`, rules guard it) or by the placeOrder function when
 * server orders are on; the confirmation screen gets `latestOrder`.
 */
export function useCheckout({
  activeTab,
  setActiveTab,
  currentUser,
  userProfile,
  products,
  productsLoaded,
  setProducts,
  setSelectedProduct,
  cartItems,
  setCartItems,
  appliedPromo,
  setAppliedPromo,
  promos,
  preorderMode,
  deliveryMethods,
  storefrontSettings,
  serverOrdersEnabled,
  chatIdentity,
  setChatIdentity,
  setOrders,
  addToast,
}: CheckoutOptions) {
  // Latest Order info for confirmation screen
  const [latestOrder, setLatestOrder] = useState<{
    id: string;
    totalPrice: number;
    deliveryMethod: string;
    deliveryAddress: string;
    paymentMethod?: string;
    /** A guest's order the browser did not keep: the screen asks to write the number down (finding 19) */
    notSavedInBrowser?: boolean;
  } | null>(null);

  const resolveOrderDetails = (orderData: CompleteOrderData) => {
    // Checkout sends Фамилия / Имя / Отчество; the order keeps them and the full name in customerName
    const nameParts: PersonName | undefined =
      orderData.contact && hasNameParts(orderData.contact) ? namePartsOf(orderData.contact) : undefined;
    const customerName =
      (nameParts && fullName(nameParts)) ||
      orderData.contact?.name ||
      orderData.customerName ||
      userProfile.name ||
      'Покупатель';
    const customerPhone =
      orderData.contact?.phone ||
      orderData.customerPhone ||
      userProfile.phone ||
      '';
    const customerEmail =
      orderData.contact?.email ||
      orderData.customerEmail ||
      userProfile.email ||
      '';
    const deliveryAddress =
      orderData.address ||
      (userProfile.savedAddresses?.[0] ? formatAddress(userProfile.savedAddresses[0]) : '') ||
      (userProfile.address ? formatAddress(userProfile.address) : '') ||
      'Уточнит менеджер';
    // Quick (1-click) orders have no delivery or payment choice: the manager agrees them with the buyer
    const deliveryMethod = orderData.deliveryMethod || 'Уточнит менеджер';
    const paymentMethod = orderData.paymentMethod || 'Уточнит менеджер';
    const addressParts = orderData.addressParts ? cleanAddressParts(orderData.addressParts) : undefined;
    return { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod, nameParts, addressParts };
  };

  const finishOrder = (
    order: Pick<Order, 'id' | 'totalPrice' | 'deliveryMethod' | 'deliveryAddress'> & { paymentMethod?: string },
    orderData: CompleteOrderData,
    notSavedInBrowser = false
  ) => {
    // A 1-click order from the product page is not the cart: only the ordered lines leave it
    const orderedLineIds = new Set(orderData.items.map((item) => item.id));
    setCartItems((prev) => prev.filter((item) => !orderedLineIds.has(item.id)));
    // the promo is applied only to a full checkout (1-click orders go without it)
    if (orderData.deliveryMethodId) setAppliedPromo(null);
    setLatestOrder({
      id: order.id,
      totalPrice: order.totalPrice,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      ...(notSavedInBrowser ? { notSavedInBrowser } : {}),
    });
    addToast(`Заказ № ${order.id} успешно оформлен!`, 'success');
    setActiveTab('order-success');
  };

  // Synchronous guard against concurrent double-click submissions and stable orderId across network retries
  const inFlightRef = React.useRef(false);
  const pendingAttemptRef = React.useRef<{ fingerprint: string; orderId: string } | null>(null);

  const getAttemptOrderId = (orderData: CompleteOrderData): string => {
    const fingerprint = orderData.items
      .map((it) => `${it.product.id}:${extractColorName(it.selectedColor)}:${extractSizeName(it.selectedSize)}:${it.quantity}:${it.priceKind ?? ''}:${it.packId ?? ''}`)
      .join('|');
    if (pendingAttemptRef.current && pendingAttemptRef.current.fingerprint === fingerprint) {
      return pendingAttemptRef.current.orderId;
    }
    const orderId = `WS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    pendingAttemptRef.current = { fingerprint, orderId };
    return orderId;
  };

  // Server-validated checkout: the placeOrder Cloud Function recalculates prices,
  // delivery and promo discount and deducts stock in a transaction.
  const completeOrderOnServer = async (orderData: CompleteOrderData, orderId: string): Promise<boolean> => {
    const details = resolveOrderDetails(orderData);
    try {
      const { order } = await placeOrderOnServer({
        orderId,
        items: orderData.items.map((item) =>
          // a size pack: the server takes its sizes and price from the product (stage 20)
          isCartPackLine(item)
            ? { productId: item.product.id, color: extractColorName(item.selectedColor), size: '', quantity: item.quantity, packId: item.packId }
            : {
                productId: item.product.id,
                color: extractColorName(item.selectedColor),
                size: extractSizeName(item.selectedSize),
                quantity: item.quantity,
                ...(isWholesaleLine(item) ? { wholesale: true } : {}),
                ...(isBrokenPackLine(item) ? { broken: true } : {}),
              }
        ),
        deliveryMethodId: orderData.deliveryMethodId || QUICK_ORDER_DELIVERY_ID,
        deliveryAddress: details.deliveryAddress,
        paymentMethod: details.paymentMethod,
        promoCode: orderData.deliveryMethodId ? appliedPromo?.code : undefined,
        contact: {
          name: details.customerName,
          phone: details.customerPhone,
          email: details.customerEmail || undefined,
          ...details.nameParts,
        },
        addressParts: details.addressParts,
      });
      pendingAttemptRef.current = null;
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      const keptInBrowser = currentUser ? true : saveGuestOrder(order);
      finishOrder(order, orderData, !keptInBrowser);
      return true;
    } catch (err) {
      console.error('placeOrder failed:', err);
      // HttpsError messages from placeOrder are user-facing; transport errors are just "internal"
      const message =
        err instanceof Error && err.message && err.message !== 'internal'
          ? err.message
          : 'Не удалось оформить заказ. Проверьте соединение и попробуйте еще раз.';
      addToast(message, 'error');
      return false;
    }
  };

  // The cart and the checkout check the stock and show the photos of the products themselves, not their index lines
  useLiveProducts(activeTab === 'cart' || activeTab === 'checkout' ? cartItems.map((ci) => ci.product.id) : []);

  /** What the cart has beyond the stock now: the checkout lists it and does not send the order */
  const checkoutStockProblems = React.useMemo(
    // no catalog yet — no stock to compare with: every line would read «больше нет в каталоге»
    () => (activeTab === 'checkout' && productsLoaded ? orderStockProblems(expandPackLines(cartItems), products, preorderMode) : []),
    [activeTab, cartItems, products, preorderMode, productsLoaded]
  );

  const handleCompleteOrder = async (orderData: CompleteOrderData): Promise<boolean> => {
    if (inFlightRef.current) return false;
    // «Технические работы» in «Витрина»: no orders (the checkout and the 1-click window say so before this)
    if (!storeAcceptsOrders(storefrontSettings)) {
      addToast(`${STORE_PAUSED_TEXT}. Напишите в чат поддержки.`, 'error');
      return false;
    }
    // Without a network the order would wait in this tab with a spinner: a closed tab lost it, a second attempt made
    // a duplicate (audit 07.10, finding 12). The buyer's network, not the site's failure — a warning
    if (isBrowserOffline()) {
      console.warn('Checkout without a network: the order was not sent');
      addToast('Нет соединения с интернетом: заказ не отправлен. Проверьте сеть и нажмите «Подтвердить» ещё раз.', 'error');
      return false;
    }
    // A code with a usage limit goes only with a Google sign-in (owner's decision 08.10, audit 07.10, finding 9). The
    // cart drops it on sign-out; this stops an order whose code slipped through: the totals were counted with it, so
    // the code is removed and the buyer confirms the new sum
    const promo = orderData.deliveryMethodId && appliedPromo?.code
      ? promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase())
      : undefined;
    const promoProblem = promo ? promoSignInProblem(promo, Boolean(currentUser && !currentUser.isAnonymous)) : null;
    if (promoProblem) {
      setAppliedPromo(null);
      addToast(`Промокод ${promo?.code} снят. ${promoProblem}. Проверьте сумму и подтвердите заказ снова.`, 'error');
      return false;
    }
    const effectiveWholesale = storefrontSettings?.brokenPackDiscount
      ? { ...storefrontSettings.wholesale, brokenPackDiscount: storefrontSettings.brokenPackDiscount }
      : storefrontSettings?.wholesale;
    // Wholesale lines (src/shared/wholesalePricing.ts): whole packs, the product's minimum, minOrderAmount, and the prices
    // the buyer saw are the ones counted now — «Опт» or the wholesale price may have changed while the checkout was open
    const priced = priceCartLines(orderData.items, effectiveWholesale);
    const wholesaleProblems = wholesaleLineProblems(priced, effectiveWholesale);
    if (wholesaleProblems.length > 0) {
      addToast(`${wholesaleProblems.join('; ')}. Измените корзину.`, 'error');
      return false;
    }
    // Stage 13: broken pack lines must still belong to a broken pack in the catalog
    const brokenProblems = priced
      .filter((item) => isBrokenPackLine(item))
      .filter((item) => {
        const live = products.find((p) => p.id === item.product.id) ?? item.product;
        const color = extractColorName(item.selectedColor);
        const size = extractSizeName(item.selectedSize);
        return !goesBrokenPack(live, color, size, (sz) => getOrderableStock(live, color, sz, false));
      })
      .map((item) => `«${item.product.title}» (${item.selectedColor}, ${item.selectedSize}): больше не продаётся как разбитая упаковка — обновите корзину`);
    brokenProblems.push(
      ...brokenPackExcess(
        priced
          .filter((item) => isBrokenPackLine(item))
          .map((item) => ({
            product: products.find((p) => p.id === item.product.id) ?? item.product,
            color: extractColorName(item.selectedColor),
            size: extractSizeName(item.selectedSize),
            quantity: item.quantity,
          }))
      )
        .filter((e) => e.pieces > 0)
        .map((e) => `«${e.product.title}» (${e.color}, ${e.size}): разбитой упаковкой — не больше ${e.pieces} шт.`)
    );
    if (brokenProblems.length > 0) {
      addToast([...new Set(brokenProblems)].join('; '), 'error');
      return false;
    }
    // a size pack: the product in the catalog must still have it (the stored cart may keep one the owner removed)
    const packProblems = [
      ...packLineProblems(priced),
      ...priced
        .filter((item) => isCartPackLine(item))
        .filter((item) => !soldPack(products.find((p) => p.id === item.product.id), item.packId, item.selectedColor))
        .map((item) => `«${item.product.title}»: ростовка «${item.packTitle || 'Ростовка'}» больше не продаётся — уберите её из корзины`),
    ];
    if (packProblems.length > 0) {
      addToast([...new Set(packProblems)].join('; '), 'error');
      return false;
    }
    // a size pack is a line per size in the order: the rules take up to ORDER_LINES_MAX lines from a browser
    if (expandPackLines(priced).length > ORDER_LINES_MAX) {
      addToast(`В заказе больше ${ORDER_LINES_MAX} позиций (ростовка — строка на каждый размер). Разделите корзину на два заказа.`, 'error');
      return false;
    }
    if (priced.some((item, i) => linePrice(item) !== linePrice(orderData.items[i]))) {
      addToast('Оптовые цены изменились, пока открыто оформление. Проверьте сумму и подтвердите заказ снова.', 'error');
      return false;
    }
    const orderId = getAttemptOrderId(orderData);
    inFlightRef.current = true;
    try {
      return serverOrdersEnabled ? await completeOrderOnServer(orderData, orderId) : await completeOrderLocally(orderData, orderId);
    } finally {
      inFlightRef.current = false;
    }
  };

  // Legacy client-side checkout, used until the Cloud Function is deployed and enabled
  const completeOrderLocally = async (orderData: CompleteOrderData, newOrderId: string): Promise<boolean> => {
    // The stock as the catalog has it now (finding 4): the checkout shows the same list next to «Подтвердить», this
    // stops a 1-click order and a catalog that changed after the page was opened
    // a size pack becomes a line per size here (stage 19): the stock, the order and the journal go line by line
    const orderLines = expandPackLines(orderData.items);
    if (!productsLoaded || !liveProductsRead(orderLines.map((line) => line.product.id))) {
      addToast('Проверяем наличие на складе: нажмите «Подтвердить» ещё раз через пару секунд', 'info');
      return false;
    }
    const stockProblems = orderStockProblems(orderLines, products, preorderMode);
    if (stockProblems.length > 0) {
      addToast(`Не хватает на складе: ${stockProblems.map(stockProblemText).join('; ')}. Измените корзину.`, 'error');
      return false;
    }
    // Every order has an owner (rules, stage 5 without Blaze): the signed-in buyer or the guest's anonymous session —
    // the same one the guest's support chat uses
    let orderOwner: { uid: string; db: ChatIdentity['db'] };
    if (currentUser) {
      orderOwner = { uid: currentUser.uid, db };
    } else {
      try {
        const identity = chatIdentity?.isGuest ? chatIdentity : await createGuestChatIdentity();
        if (identity !== chatIdentity) setChatIdentity(identity);
        orderOwner = { uid: identity.uid, db: identity.db };
      } catch (err) {
        console.error('Guest sign-in for the order failed:', err);
        addToast('Не удалось оформить заказ без входа. Войдите через Google в «Профиле» или проверьте соединение.', 'error');
        return false;
      }
    }

    const placedAt = new Date();

    const { customerName, customerPhone, customerEmail, deliveryAddress, deliveryMethod, paymentMethod, nameParts, addressParts } =
      resolveOrderDetails(orderData);
    const totalPrice = orderData.totalPrice ?? 0;
    // A 1-click order has no promo, as on the server
    const orderPromo = orderData.deliveryMethodId && appliedPromo?.code && orderData.discountAmount !== 0
      ? promos.find((p) => p.code.toUpperCase() === appliedPromo.code.toUpperCase())
      : undefined;

    // Sold-out variants ordered in preorder mode are marked and not taken from stock; the order keeps a light
    // copy of the product (toOrderLineProduct) without photo links: the rules refuse links in a browser's order
    // (an outside picture would open at the staff's screen), and order screens take photos from the catalog
    const orderItems: CartItem[] = orderLines.map(({ packSizes: _sizes, packUnavailable: _gone, addedPrice: _addedPrice, ...item }) => ({
      ...item,
      product: { ...toOrderLineProduct(item.product), images: [] },
      ...(!item.packGroup && !isBrokenPackLine(item) && isPreorderVariant(item.product, item.selectedColor, item.selectedSize, preorderMode)
        ? { isPreorder: true }
        : {}),
    }));

    const orderMethod = orderData.deliveryMethodId
      ? deliveryMethods.find((m) => m.id === orderData.deliveryMethodId)
      : undefined;
    const newOrder = buildClientOrder({
      id: newOrderId,
      placedAt,
      items: orderItems,
      totalPrice,
      deliveryAddress,
      deliveryMethod,
      method: orderMethod,
      customerName,
      nameParts,
      customerPhone,
      customerEmail,
      customerUid: orderOwner.uid,
      addressParts,
      paymentMethod,
      deliveryFee: orderData.deliveryFee,
      discountAmount: orderData.discountAmount,
      promoCode: orderPromo?.code,
    });

    // A refused order (rules, the 30 s limit): the buyer is told why and can try again
    const reportNotSaved = async (err: unknown) => {
      pendingAttemptRef.current = null;
      console.error('Order was not saved:', err);
      // the rules take one order in 30 s from a sign-in: say how long to wait instead of «check the connection»
      const wait = await orderRateWaitSeconds(orderOwner.uid, orderOwner.db);
      addToast(
        wait > 0
          ? `Заказы можно оформлять не чаще раза в 30 секунд. Попробуйте снова через ${wait} ${pluralRu(wait, ['секунду', 'секунды', 'секунд'])}.`
          : 'Не удалось оформить заказ. Проверьте соединение и попробуйте еще раз.',
        'error'
      );
    };

    // What follows a saved order: the stock, the promo's use, the order in the lists, the confirmation
    const afterOrderSaved = () => {
      pendingAttemptRef.current = null;
      // The new stock shows at once; the database is changed by the line transactions below
      setProducts((prev) => withOrderDeducted(prev, orderItems));
      // If active product was modified, sync selectedProduct
      setSelectedProduct((prev) => (prev ? withOrderDeducted([prev], orderItems)[0] : prev));

      // One more use of the promo by this order (a 1-click order has no promo, as on the server)
      if (orderPromo) {
        // The order is placed either way; a refused counter write is logged with the order number
        recordPromoUsageInFirestore(orderPromo, newOrderId, orderOwner.db).catch((err) =>
          console.error(`Promo usage for ${newOrderId} was not recorded:`, err)
        );
      }

      // the orders subscription may already hold it (the local write is seen at once): one card, not two
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
      const keptInBrowser = currentUser ? true : saveGuestOrder(newOrder);

      // Stock line by line, each in one transaction with its journal entry («Склад и SKU» → «Журнал движений»):
      // the rules let a customer take only what the saved order ordered, once per line. The order is already saved:
      // a refused write must not turn it into a failure for the customer. A guest writes off under their own anonymous
      // sign-in, like the order itself: the rules can then require the order's owner (check 04.10, finding 6)
      const takenAt = new Date();
      void (async () => {
        for (const [lineIndex, line] of orderItems.entries()) {
          try {
            await deductOrderLineStock(newOrderId, line, lineIndex, takenAt, orderOwner.db);
          } catch (err) {
            console.error(`Stock for ${newOrderId}, line ${lineIndex} was not written off:`, err);
          }
        }
      })();

      finishOrder({ id: newOrderId, totalPrice, deliveryMethod, deliveryAddress, paymentMethod }, orderData, !keptInBrowser);
    };

    // The order must reach the database before it is shown as placed and stock is taken: a rejected write (rules,
    // network error) used to be reported as a successful order. Without a network the write neither resolves nor fails —
    // after 20 s the buyer hears that and is asked to check «Мои заказы» before trying again (finding 12)
    const saving = placeClientOrder(newOrder, orderOwner.uid, orderOwner.db);
    let settled: Settled<void>;
    try {
      settled = await settleWithin(saving, ORDER_SAVE_TIMEOUT_MS);
    } catch (err) {
      await reportNotSaved(err);
      return false;
    }
    if (settled.timedOut) {
      console.warn(`Order ${newOrderId} is not confirmed by the database after ${ORDER_SAVE_TIMEOUT_MS / 1000} s`);
      addToast(
        `Магазин не ответил за ${ORDER_SAVE_TIMEOUT_MS / 1000} секунд — похоже, пропала связь. Заказ № ${newOrderId} мог сохраниться: ` +
          'проверьте «Мои заказы» в профиле, прежде чем оформлять ещё раз. Не закрывайте вкладку, пока связь не вернётся.',
        'error'
      );
      // the write goes on in this tab: when the database answers, the order is finished as usual or reported refused
      saving.then(afterOrderSaved, (err) => void reportNotSaved(err));
      return false;
    }

    afterOrderSaved();
    return true;
  };

  return { latestOrder, checkoutStockProblems, handleCompleteOrder };
}
