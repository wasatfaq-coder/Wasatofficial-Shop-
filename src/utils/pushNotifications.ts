import { Order } from '../types';
import { ORDER_STATUS_LABELS, isTransportCompanyDelivery } from './deliveryStages';

/**
 * Plays a pleasant synthesizer notification chime using Web Audio API.
 * Does not require external audio files and works reliably across all browsers.
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Create a 2-tone melodic chime (C5 -> G5)
    const tones = [
      { freq: 523.25, time: now, dur: 0.15 },       // C5
      { freq: 659.25, time: now + 0.08, dur: 0.18 }, // E5
      { freq: 783.99, time: now + 0.16, dur: 0.35 }, // G5
    ];

    tones.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + dur + 0.05);
    });

    // Close context after playback
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch (e) {
    // Audio context may be blocked by autoplay policies
    console.debug('Push notification chime skipped:', e);
  }
}

/**
 * Checks if browser Web Notifications API is supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Requests browser permission for native push notifications
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
    return 'denied';
  }
}

/**
 * Sends a native browser system notification if permitted
 */
export function sendBrowserNotification(title: string, options?: NotificationOptions) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    // Auto-close after 6 seconds
    setTimeout(() => notif.close(), 6000);
  } catch (e) {
    console.debug('Failed to send browser notification:', e);
  }
}

export interface OrderNotificationPayload {
  title: string;
  subtitle: string;
  text: string;
  icon: 'truck' | 'package' | 'store' | 'check' | 'alert' | 'bell';
  orderId: string;
  oldStatus?: Order['status'];
  newStatus?: Order['status'];
  badgeText: string;
  badgeBg: string;
}

/**
 * Generates descriptive notification details based on order status transition
 */
export function getOrderStatusNotification(
  order: Order,
  oldStatus?: Order['status'],
  newStatus?: Order['status']
): OrderNotificationPayload {
  const effectiveNewStatus = newStatus || order.status || 'accepted';
  const orderId = order.id;

  if (order.isCancelled) {
    return {
      title: `Заказ №${orderId} отменен`,
      subtitle: 'Статус: Отменен',
      text: order.cancelReason || 'Заказ был отменен. Товары возвращены на склад.',
      icon: 'alert',
      orderId,
      oldStatus,
      newStatus: effectiveNewStatus,
      badgeText: 'Отменен',
      badgeBg: 'bg-rose-100 text-rose-700 border-rose-300',
    };
  }

  const newLabel = ORDER_STATUS_LABELS[effectiveNewStatus] || effectiveNewStatus;
  const oldLabel = oldStatus ? ORDER_STATUS_LABELS[oldStatus] || oldStatus : undefined;
  const statusTransition = oldLabel ? `${oldLabel} ➔ ${newLabel}` : `Статус: ${newLabel}`;

  switch (effectiveNewStatus) {
    case 'assembling':
      return {
        title: `Заказ №${orderId} передан на сборку`,
        subtitle: statusTransition,
        text: 'Специалисты склада комплектуют и упаковывают ваши вещи.',
        icon: 'package',
        orderId,
        oldStatus,
        newStatus: effectiveNewStatus,
        badgeText: 'Сборка',
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
      };

    case 'in_transit': {
      const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
      const dm = (order.deliveryMethod || '').toLowerCase();
      const isPickup = dm.includes('самовывоз') || dm.includes('пункт выдачи') || dm.includes('бутик') || dm.includes('шоурум');
      const isExpress = dm.includes('экспресс') || dm.includes('express') || dm.includes('срочн');

      let transitText = 'Курьер везет ваш заказ по указанному адресу.';
      if (isTK && order.trackingNumber) {
        transitText = `Транспортная компания везет заказ (трек: ${order.trackingNumber}).`;
      } else if (isPickup) {
        transitText = 'Заказ направляется в выбранный пункт выдачи.';
      } else if (isExpress) {
        transitText = 'Срочный экспресс-курьер уже доставляет ваш заказ.';
      }

      return {
        title: `Заказ №${orderId} передан в доставку`,
        subtitle: statusTransition,
        text: transitText,
        icon: 'truck',
        orderId,
        oldStatus,
        newStatus: effectiveNewStatus,
        badgeText: 'В пути',
        badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
      };
    }

    case 'ready':
      return {
        title: `Заказ №${orderId} готов к выдаче!`,
        subtitle: statusTransition,
        text: 'Ваш заказ доставлен в пункт выдачи и ожидает получения.',
        icon: 'store',
        orderId,
        oldStatus,
        newStatus: effectiveNewStatus,
        badgeText: 'Готов к выдаче',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };

    case 'delivered':
      return {
        title: `Заказ №${orderId} успешно доставлен!`,
        subtitle: statusTransition,
        text: 'Спасибо за покупку в MANSTYLE. Будем рады видеть вас снова!',
        icon: 'check',
        orderId,
        oldStatus,
        newStatus: effectiveNewStatus,
        badgeText: 'Доставлен',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      };

    case 'accepted':
    default:
      return {
        title: `Заказ №${orderId} принят в обработку`,
        subtitle: statusTransition,
        text: 'Заказ успешно оформлен и ожидает подтверждения магазином.',
        icon: 'bell',
        orderId,
        oldStatus,
        newStatus: effectiveNewStatus,
        badgeText: 'Принят',
        badgeBg: 'bg-indigo-100 text-[#5F6ED0] border-indigo-300',
      };
  }
}
