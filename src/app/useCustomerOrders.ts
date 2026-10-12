import React from 'react';
import type { User } from 'firebase/auth';
import type { ActiveTab, CartItem, ChatMessage, Order, PaymentKind, Product, UserProfile } from '../types';
import { cancelOrderAsCustomer, confirmOrderReceipt, submitPaymentReceipt, returnCancelledOrderStock } from '../utils/firebaseSync';
import { getOrderableStock } from '../utils/inventory';
import type { AddToast } from './useToasts';
import { goesWholesale, isWholesaleLine, packSizeOf, sellsRetail, sellsWholesale } from '../shared/wholesalePricing';
import { heldByOtherLines, packsLeft, sameVariant } from '../utils/cartLines';
import { groupOrderLines, isCartPackLine, pricePackLine } from '../shared/packLines';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type CustomerOrderOptions = {
  authLoading: boolean;
  currentUser: User | null;
  userProfile: UserProfile;
  orders: Order[];
  products: Product[];
  preorderMode: boolean;
  /** The cart now: «Повторить заказ» counts what fits next to its lines before saying what was added */
  cartItems: CartItem[];
  setCartItems: SetState<CartItem[]>;
  setChatMessages: SetState<ChatMessage[]>;
  addToast: AddToast;
  setActiveTab: (tab: ActiveTab) => void;
};

/** What the customer does with a placed order in the profile: cancel, «Я получил заказ», send a receipt, repeat */
export function useCustomerOrders({
  authLoading,
  currentUser,
  userProfile,
  orders,
  products,
  preorderMode,
  cartItems,
  setCartItems,
  setChatMessages,
  addToast,
  setActiveTab,
}: CustomerOrderOptions) {
  /**
   * The buyer cancels their order in the profile («Доработки 3»): the cancellation first (the rules check it), then
   * the goods back to stock line by line. A return cut off by the network is repeated next time (effect below);
   * meanwhile «Заказы» offers the admin «Вернуть на склад».
   */
  const stockReturnTriedRef = React.useRef(new Set<string>());
  const handleCancelOwnOrder = async (order: Order, reason: string, comment: string): Promise<boolean> => {
    // Before the write: its local snapshot would start the repeat below alongside this return
    stockReturnTriedRef.current.add(order.id);
    try {
      await cancelOrderAsCustomer(order.id, reason, comment, new Date());
    } catch (err) {
      stockReturnTriedRef.current.delete(order.id);
      console.error('Order cancellation was refused:', err);
      addToast('Не удалось отменить заказ. Проверьте соединение или напишите в чат магазина.', 'error');
      return false;
    }
    try {
      await returnCancelledOrderStock(order);
      addToast(`Заказ № ${order.id} отменён`, 'success');
    } catch (err) {
      console.error(`Stock of the cancelled order ${order.id} was not returned:`, err);
      addToast(`Заказ № ${order.id} отменён. Возврат товаров на склад магазин проверит сам.`, 'info');
    }
    return true;
  };

  /** «Я получил заказ»: a carrier's order becomes «Получен» with the time of the tap (rule isCustomerReceiptConfirm) */
  const handleConfirmReceipt = async (order: Order): Promise<boolean> => {
    try {
      await confirmOrderReceipt(order, new Date());
      addToast(`Заказ № ${order.id} получен. Спасибо!`, 'success');
      return true;
    } catch (err) {
      console.error('Receipt confirmation was refused:', err);
      addToast('Не удалось подтвердить получение. Проверьте соединение или напишите в чат магазина.', 'error');
      return false;
    }
  };

  /**
   * «Оплачено» с фото чека («Доработки 5»): фото с подписью уходит в чат магазина, заказ — «Чек на проверке»
   * (правило isCustomerReceiptSubmit). Только вошедший покупатель: гость получает реквизиты в чате.
   */
  const handleSubmitPaymentReceipt = async (order: Order, kind: PaymentKind, imageUrl: string): Promise<boolean> => {
    if (!currentUser || currentUser.isAnonymous) return false;
    try {
      const message = await submitPaymentReceipt(
        order,
        kind,
        imageUrl,
        { threadId: currentUser.uid, threadName: userProfile.name || currentUser.email || 'Покупатель' },
        new Date()
      );
      setChatMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      addToast(`Чек отправлен. Магазин проверит оплату заказа № ${order.id}`, 'success');
      return true;
    } catch (err) {
      console.error('Payment receipt was not sent:', err);
      addToast('Чек не отправлен. Проверьте соединение и попробуйте ещё раз — или отправьте фото в чат магазина.', 'error');
      return false;
    }
  };

  // A cancellation whose goods did not all get back to stock (network, closed tab): once a session
  React.useEffect(() => {
    if (!currentUser || authLoading) return;
    for (const order of orders) {
      if (
        order.customerUid !== currentUser.uid ||
        !order.isCancelled ||
        order.cancelledBy !== 'customer' ||
        order.stockReturned !== false ||
        stockReturnTriedRef.current.has(order.id)
      ) {
        continue;
      }
      stockReturnTriedRef.current.add(order.id);
      returnCancelledOrderStock(order).catch((err) =>
        console.error(`Stock of the cancelled order ${order.id} was not returned again:`, err)
      );
    }
  }, [orders, currentUser, authLoading]);

  // Repeat a past order: current product data and stock, unavailable items are skipped. A wholesale line comes back
  // wholesale, in whole packs, while the product is still sold wholesale; it never merges with a retail line
  const handleRepeatOrder = (items: CartItem[]) => {
    // counted against the cart as it is: the toast says what really went in (the other line of a variant — retail
    // next to wholesale — takes from the same stock)
    const next = [...cartItems];
    let added = 0;
    let skipped = 0;
    let cut = 0;
    // a size pack of the order (a line per size) comes back as one pack line (stage 20)
    const lines: CartItem[] = groupOrderLines(items).map((group) =>
      group.kind === 'line'
        ? group.item
        : {
            id: group.packGroup,
            product: group.item.product,
            selectedColor: group.item.selectedColor,
            selectedSize: '',
            quantity: group.packCount,
            priceKind: 'pack',
            packId: group.item.packId,
            packTitle: group.title,
            packPrice: group.packPrice,
            packSizes: group.sizes,
          }
    );
    lines.forEach((item, idx) => {
      const product = products.find((p) => p.id === item.product?.id);
      if (!product) {
        skipped += 1;
        return;
      }
      if (isCartPackLine(item)) {
        // the buyer's catalog is the index without packs: the line keeps the order's composition and price for showing,
        // the cart prices it from the product's document and the checkout refuses a pack no longer sold (review 12.10)
        const pack = pricePackLine<CartItem>({ ...item, id: `cart-${Date.now()}-${idx}`, product });
        if (pack.packUnavailable || !pack.packSizes?.length) {
          skipped += 1;
          return;
        }
        const i = next.findIndex((c) => isCartPackLine(c) && c.product.id === product.id && c.packId === pack.packId && c.selectedColor === pack.selectedColor);
        const current = i > -1 ? next[i].quantity : 0;
        const max = packsLeft(
          next,
          { product, selectedColor: pack.selectedColor, packSizes: pack.packSizes },
          (size) => getOrderableStock(product, pack.selectedColor, size, false),
          i > -1 ? next[i].id : pack.id
        );
        const total = Math.min(current + item.quantity, max);
        if (total - current <= 0) {
          skipped += 1;
          return;
        }
        if (total - current < item.quantity) cut += 1;
        added += 1;
        if (i > -1) next[i] = { ...next[i], quantity: total };
        else next.push({ ...pack, quantity: total });
        return;
      }
      const wholesale = sellsWholesale(product) && (isWholesaleLine(item) || !sellsRetail(product));
      const add: CartItem = {
        id: `cart-${Date.now()}-${idx}`,
        product,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: item.quantity,
        ...(wholesale ? { priceKind: 'wholesale' as const } : {}),
      };
      const step = wholesale ? packSizeOf(product) : 1;
      const i = next.findIndex((c) => sameVariant(c, add) && goesWholesale(c) === wholesale);
      const current = i > -1 ? next[i].quantity : 0;
      const free =
        getOrderableStock(product, item.selectedColor, item.selectedSize, preorderMode) -
        heldByOtherLines(next, add, i > -1 ? next[i].id : add.id);
      const total = Math.floor(Math.min(current + item.quantity, Math.max(0, free)) / step) * step;
      const gained = total - current;
      if (gained <= 0) {
        skipped += 1;
        return;
      }
      if (gained < item.quantity) cut += 1;
      added += 1;
      if (i > -1) next[i] = { ...next[i], quantity: total };
      else next.push({ ...add, quantity: total });
    });

    if (added === 0) {
      addToast('Товаров из этого заказа сейчас нет в наличии', 'error');
      return;
    }
    setCartItems(next);
    const notes = [
      skipped > 0 ? `нет в наличии: ${skipped}` : '',
      cut > 0 ? `добавлено меньше, чем в заказе: ${cut}` : '',
    ].filter(Boolean);
    addToast(
      notes.length ? `Товары добавлены в корзину. ${notes.join('; ')}` : 'Товары заказа добавлены в корзину',
      notes.length ? 'info' : 'success'
    );
    setActiveTab('cart');
  };

  return { handleCancelOwnOrder, handleConfirmReceipt, handleSubmitPaymentReceipt, handleRepeatOrder };
}
