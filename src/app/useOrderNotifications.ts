import React from 'react';
import type { User } from 'firebase/auth';
import type { Order, UserProfile } from '../types';
import type { ToastMessage } from '../components/Toast';
import {
  playNotificationChime,
  sendBrowserNotification,
  getOrderStatusNotification,
  getOrderPaymentNotification,
  type OrderNotificationPayload,
} from '../utils/pushNotifications';

type OrderNotificationOptions = {
  orders: Order[];
  isAdmin: boolean;
  currentUser: User | null;
  userProfile: UserProfile;
  setToasts: React.Dispatch<React.SetStateAction<ToastMessage[]>>;
  /** «Смотреть статус»: the profile with this order's tracking open (App keeps the order until the profile shows it) */
  onOpenOrder: (orderId: string) => void;
};

/**
 * No push server: while the site is open, a change of the customer's order (status, cancellation, tracking number,
 * checked receipt) plays a chime, shows a system notification (if allowed) and a toast «Смотреть статус».
 */
export function useOrderNotifications({ orders, isAdmin, currentUser, userProfile, setToasts, onOpenOrder }: OrderNotificationOptions) {
  // Order status changes push notification watcher
  const previousOrdersMapRef = React.useRef<
    Map<string, { status: Order['status']; isCancelled?: boolean; trackingNumber?: string; paymentStatus?: Order['paymentStatus'] }>
  >(new Map());
  const isInitialOrdersLoadRef = React.useRef(true);

  // Trigger push notification on order status change
  const triggerOrderStatusPushNotification = (
    order: Order,
    oldStatus?: Order['status'],
    newStatus?: Order['status'],
    payload?: OrderNotificationPayload
  ) => {
    const notif = payload ?? getOrderStatusNotification(order, oldStatus, newStatus);

    // Sound and a system notification only when the customer left notifications on in the profile
    if (userProfile.notificationsEnabled !== false) {
      playNotificationChime();
      sendBrowserNotification(notif.title, {
        body: `${notif.subtitle}\n${notif.text}`,
      });
    }

    // 3. Trigger In-App Rich Push Toast
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [
      ...prev,
      {
        id,
        type: 'order_status',
        title: notif.title,
        subtitle: notif.subtitle,
        text: notif.text,
        badgeText: notif.badgeText,
        badgeBg: notif.badgeBg,
        icon: notif.icon,
        orderId: order.id,
        oldStatus,
        newStatus,
        duration: 7000,
        action: {
          label: 'Смотреть статус',
          // not an event after a timer: the profile is loaded on demand and shown after the screen's animation, so
          // its listener was not there yet (audit 07.10, finding 23)
          onClick: () => onOpenOrder(order.id),
        },
      },
    ]);
  };

  React.useEffect(() => {
    if (!orders || orders.length === 0) return;

    if (isInitialOrdersLoadRef.current) {
      orders.forEach((o) => {
        previousOrdersMapRef.current.set(o.id, {
          status: o.status,
          isCancelled: o.isCancelled,
          trackingNumber: o.trackingNumber,
          paymentStatus: o.paymentStatus,
        });
      });
      isInitialOrdersLoadRef.current = false;
      return;
    }

    // Compare with previous status snapshot
    orders.forEach((currentOrder) => {
      const prev = previousOrdersMapRef.current.get(currentOrder.id);
      if (prev) {
        const statusChanged = prev.status !== currentOrder.status;
        const cancelChanged = !prev.isCancelled && Boolean(currentOrder.isCancelled);
        const trackingChanged = !prev.trackingNumber && Boolean(currentOrder.trackingNumber);

        // An admin loads every customer's orders: «ваш заказ» is only about their own
        const isOwnOrder = !isAdmin || currentOrder.customerUid === currentUser?.uid;
        // The buyer cancelled it themselves: the profile already said so
        const ownCancel = cancelChanged && currentOrder.cancelledBy === 'customer';
        // «Я получил заказ» — the buyer's own step too
        const ownStep = statusChanged && currentOrder.statusLog?.[currentOrder.statusLog.length - 1]?.by === 'customer';
        if (isOwnOrder && ((statusChanged && !ownStep) || (cancelChanged && !ownCancel) || trackingChanged)) {
          triggerOrderStatusPushNotification(currentOrder, prev.status, currentOrder.status);
        }
        // the store checked the receipt («Доработки 5»): confirmed or rejected
        const paymentNotif =
          isOwnOrder && prev.paymentStatus === 'receipt_review'
            ? getOrderPaymentNotification(currentOrder, currentOrder.paymentStatus)
            : null;
        if (paymentNotif) triggerOrderStatusPushNotification(currentOrder, prev.status, currentOrder.status, paymentNotif);
      }

      // Update reference
      previousOrdersMapRef.current.set(currentOrder.id, {
        status: currentOrder.status,
        isCancelled: currentOrder.isCancelled,
        trackingNumber: currentOrder.trackingNumber,
        paymentStatus: currentOrder.paymentStatus,
      });
    });
  }, [orders]);
}
