import type { SupportThreadMeta } from '../types';

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
