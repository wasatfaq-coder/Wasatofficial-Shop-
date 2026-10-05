import React from 'react';
import type { User } from 'firebase/auth';
import type { ActiveTab, CartItem, ChatMessage, Order, PaymentKind, Product, UserProfile } from '../types';
import { cancelOrderAsCustomer, confirmOrderReceipt, submitPaymentReceipt, returnCancelledOrderStock } from '../utils/firebaseSync';
import { getOrderableStock } from '../utils/inventory';
import type { AddToast } from './useToasts';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type CustomerOrderOptions = {
  authLoading: boolean;
  currentUser: User | null;
  userProfile: UserProfile;
  orders: Order[];
  products: Product[];
  preorderMode: boolean;
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

  // Repeat a past order: current product data and stock, unavailable items are skipped
  const handleRepeatOrder = (items: CartItem[]) => {
    const toAdd: CartItem[] = [];
    let skipped = 0;
    items.forEach((item, idx) => {
      const product = products.find((p) => p.id === item.product?.id);
      const stock = product ? getOrderableStock(product, item.selectedColor, item.selectedSize, preorderMode) : 0;
      if (!product || stock <= 0) {
        skipped += 1;
        return;
      }
      toAdd.push({
        id: `cart-${Date.now()}-${idx}`,
        product,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: Math.min(item.quantity, stock),
      });
    });

    if (toAdd.length === 0) {
      addToast('Товаров из этого заказа сейчас нет в наличии', 'error');
      return;
    }

    setCartItems((prev) => {
      const next = [...prev];
      for (const add of toAdd) {
        const i = next.findIndex(
          (c) =>
            c.product.id === add.product.id &&
            c.selectedColor === add.selectedColor &&
            c.selectedSize === add.selectedSize
        );
        if (i > -1) {
          const stock = getOrderableStock(add.product, add.selectedColor, add.selectedSize, preorderMode);
          next[i] = { ...next[i], quantity: Math.min(next[i].quantity + add.quantity, stock) };
        } else {
          next.push(add);
        }
      }
      return next;
    });
    addToast(
      skipped > 0
        ? `Товары добавлены в корзину. Нет в наличии: ${skipped}`
        : 'Товары заказа добавлены в корзину',
      skipped > 0 ? 'info' : 'success'
    );
    setActiveTab('cart');
  };

  return { handleCancelOwnOrder, handleConfirmReceipt, handleSubmitPaymentReceipt, handleRepeatOrder };
}
