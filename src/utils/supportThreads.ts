import type { ChatMessage, Order, SupportThreadMeta } from '../types';
import { chatMessageOrder } from './firebaseSync';

/** Messages written before per-customer dialogs existed have no threadId */
export const LEGACY_THREAD_KEY = '__legacy__';

/** One customer dialog in Admin → «Чат поддержки» */
export interface SupportThreadSummary {
  key: string;
  /** null for the legacy shared chat */
  threadId: string | null;
  name: string;
  count: number;
  lastOrder: number;
  lastText: string;
  lastTime: string;
  /** The last customer-visible message is the customer's: nobody has answered yet */
  awaitingReply: boolean;
}

export const STATUS_LABELS: Record<SupportThreadMeta['status'], string> = {
  open: 'В работе',
  resolved: 'Решен',
  closed: 'Закрыт',
};

export const PRIORITY_LABELS: Record<SupportThreadMeta['priority'], string> = {
  normal: 'Обычный',
  urgent: 'Срочно',
  vip: 'VIP',
};

/** Customer dialogs from the chat messages (grouped by threadId), the latest first */
export function summarizeSupportThreads(messages: ChatMessage[], orders: Order[]): SupportThreadSummary[] {
  const byKey = new Map<string, SupportThreadSummary>();
  for (const msg of messages) {
    const key = msg.threadId || LEGACY_THREAD_KEY;
    const orderNo = chatMessageOrder(msg);
    const customerOrder = msg.threadId ? orders.find((o) => o.customerUid === msg.threadId) : undefined;
    const entry = byKey.get(key) ?? {
      key,
      threadId: msg.threadId || null,
      name: msg.threadId ? customerOrder?.customerName || 'Покупатель' : 'Общий чат (до разделения)',
      count: 0,
      lastOrder: -1,
      lastText: '',
      lastTime: '',
      awaitingReply: false,
    };
    if (msg.threadName) entry.name = msg.threadName;
    entry.count += 1;
    // messages the staff deleted for themselves do not count as the dialog's last message
    if (orderNo >= entry.lastOrder && !msg.hiddenForStaff) {
      entry.lastOrder = orderNo;
      entry.lastText = `${msg.isInternalNote ? 'Заметка: ' : ''}${msg.text || (msg.imageUrl ? 'Фото' : 'Вложение')}`;
      entry.lastTime = msg.timestamp;
      // notes are not answers: only the customer-visible exchange counts
      if (!msg.isInternalNote) entry.awaitingReply = msg.sender === 'user';
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.lastOrder - a.lastOrder);
}
