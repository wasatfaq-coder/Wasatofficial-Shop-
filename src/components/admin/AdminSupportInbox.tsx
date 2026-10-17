import React, { useEffect, useMemo, useState } from 'react';
import { MessagesSquare, Search } from 'lucide-react';
import type { ChatMessage, Order, Product, PromoCode, StoreCategory, StorefrontSettings, SupportThreadMeta } from '../../types';
import {
  saveSupportThreadMeta,
  subscribeToSupportThreads,
  type ChatMessageChange,
} from '../../utils/firebaseSync';
import { AdminSupportChatTab, type AdminChatPayload } from './AdminSupportChatTab';
import { ReceiptReviewBadge, type ReviewReceipt } from './AdminReceiptReview';
import { isReceiptOnReview } from '../../utils/paymentDetails';
import {
  LEGACY_THREAD_KEY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  summarizeSupportThreads,
  type SupportThreadSummary,
} from '../../utils/supportThreads';

interface AdminSupportInboxProps {
  messages: ChatMessage[];
  orders: Order[];
  products: Product[];
  promos: PromoCode[];
  categories: StoreCategory[];
  storefrontSettings?: StorefrontSettings;
  /** Opened from an order in «Заказы»: select that customer's dialog */
  initialOrderId?: string | null;
  /** Opened from a customer card in «Клиенты»: select that customer's dialog */
  initialThreadUid?: string | null;
  onSend: (thread: { threadId: string; threadName: string }, payload: AdminChatPayload) => void;
  onUpdateOrders?: (orders: Order[]) => Promise<boolean> | void;
  /** «Подтвердить оплату» / «Отклонить чек» on a receipt photo («Доработки 5») */
  onReviewReceipt?: ReviewReceipt;
  onClearThread: (threadId: string | null) => void;
  onChangeMessage: (change: ChatMessageChange) => Promise<boolean>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type ThreadFilter = 'all' | 'awaiting' | 'open' | 'resolved';

const FILTERS: { id: ThreadFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'awaiting', label: 'Ждут ответа' },
  { id: 'open', label: 'В работе' },
  { id: 'resolved', label: 'Решенные' },
];

/**
 * Admin → «Чат поддержки»: one list of customer dialogs (grouped by threadId) with search and filters,
 * and the selected dialog below. Status and priority are shared by all admins (Firestore).
 */
export const AdminSupportInbox: React.FC<AdminSupportInboxProps> = ({
  messages,
  orders,
  products,
  promos,
  categories,
  storefrontSettings,
  initialOrderId,
  initialThreadUid,
  onSend,
  onUpdateOrders,
  onReviewReceipt,
  onClearThread,
  onChangeMessage,
  onShowToast,
}) => {
  const [threadMeta, setThreadMeta] = useState<Record<string, SupportThreadMeta>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('all');

  useEffect(() => subscribeToSupportThreads(setThreadMeta), []);

  const threads = useMemo(() => summarizeSupportThreads(messages, orders), [messages, orders]);

  const statusOf = (t: SupportThreadSummary): SupportThreadMeta['status'] =>
    (t.threadId && threadMeta[t.threadId]?.status) || 'open';

  const counts = {
    all: threads.length,
    awaiting: threads.filter((t) => t.awaitingReply).length,
    open: threads.filter((t) => statusOf(t) === 'open').length,
    resolved: threads.filter((t) => statusOf(t) !== 'open').length,
  };

  // a receipt waiting for the check — the pulsing badge on the dialog («Доработки 5»)
  const receiptThreads = new Set(orders.filter(isReceiptOnReview).map((o) => o.customerUid).filter(Boolean));

  const visibleThreads = threads.filter((t) => {
    if (filter === 'awaiting' && !t.awaitingReply) return false;
    if (filter === 'open' && statusOf(t) !== 'open') return false;
    if (filter === 'resolved' && statusOf(t) === 'open') return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const qDigits = q.replace(/\D/g, '');
    const threadOrders = t.threadId ? orders.filter((o) => o.customerUid === t.threadId) : [];
    const threadMsgs = messages.filter((m) => (m.threadId || LEGACY_THREAD_KEY) === t.key);
    return (
      t.name.toLowerCase().includes(q) ||
      t.lastText.toLowerCase().includes(q) ||
      threadOrders.some(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customerPhone?.toLowerCase().includes(q) ||
          (qDigits.length >= 3 && o.customerPhone?.replace(/\D/g, '').includes(qDigits))
      ) ||
      threadMsgs.some((m) => !m.hiddenForStaff && m.text?.toLowerCase().includes(q))
    );
  });

  // Keep a dialog selected; opened from an order or customer card → that customer's dialog
  useEffect(() => {
    if (initialThreadUid && threads.some((t) => t.threadId === initialThreadUid)) {
      setActiveKey(initialThreadUid);
      return;
    }
    if (initialOrderId) {
      const uid = orders.find((o) => o.id === initialOrderId)?.customerUid;
      if (uid && threads.some((t) => t.threadId === uid)) {
        setActiveKey(uid);
        return;
      }
    }
    if (threads.length > 0 && !threads.some((t) => t.key === activeKey)) setActiveKey(threads[0].key);
  }, [threads, initialOrderId, initialThreadUid]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeThread = threads.find((t) => t.key === activeKey) ?? null;
  const activeMessages = activeThread
    ? messages.filter((m) => (m.threadId || LEGACY_THREAD_KEY) === activeThread.key)
    : [];

  return (
    <div className="space-y-4">
      {/* Dialog list */}
      <section className="neu-flat rounded-3xl p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
            <MessagesSquare className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-text-primary leading-tight">Диалоги покупателей · {threads.length}</h3>
            <p className="text-xs text-text-secondary leading-snug">
              Сообщения из чата поддержки. Ответ сразу появится у покупателя
            </p>
          </div>
        </div>

        {threads.length === 0 ? (
          <p className="neu-inset rounded-2xl p-4 text-xs text-text-secondary text-center">
            Покупатели еще не писали в чат поддержки
          </p>
        ) : (
          <>
            <label className="relative block">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Имя, телефон, № заказа или текст"
                aria-label="Поиск диалога"
                className="w-full h-10 pl-8 pr-3 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
              />
            </label>

            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Фильтр диалогов">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`h-8 px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    filter === f.id ? 'neu-pill-active' : 'neu-button text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {f.label} · {counts[f.id]}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto p-1 -m-1">
              {visibleThreads.length === 0 && (
                <p className="text-xs text-text-secondary text-center py-3">Нет диалогов по этому фильтру</p>
              )}
              {visibleThreads.map((t) => {
                const selected = t.key === activeKey;
                const meta = t.threadId ? threadMeta[t.threadId] : undefined;
                const status = statusOf(t);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveKey(t.key)}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-2xl px-3 py-2.5 transition-all cursor-pointer space-y-1 ${
                      selected ? 'neu-pill-active' : 'neu-button text-text-primary'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-extrabold truncate flex-1 min-w-0">{t.name}</span>
                      {t.threadId && receiptThreads.has(t.threadId) && <ReceiptReviewBadge className="shrink-0" />}
                      {meta && meta.priority !== 'normal' && (
                        <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md neu-tone-danger shrink-0">
                          {PRIORITY_LABELS[meta.priority]}
                        </span>
                      )}
                      {t.awaitingReply ? (
                        <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md neu-tone-warning shrink-0">
                          Ждет ответа
                        </span>
                      ) : (
                        status !== 'open' && (
                          <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md neu-tone-success shrink-0">
                            {STATUS_LABELS[status]}
                          </span>
                        )
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                      <span className="truncate flex-1 min-w-0">{t.lastText}</span>
                      <span className="shrink-0">{t.lastTime}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {activeThread && (
        <AdminSupportChatTab
          key={activeThread.key}
          thread={activeThread}
          messages={activeMessages}
          meta={activeThread.threadId ? threadMeta[activeThread.threadId] : undefined}
          onUpdateMeta={(patch) => {
            if (!activeThread.threadId) return;
            saveSupportThreadMeta(activeThread.threadId, patch).catch((err) => {
              console.error('Dialog status was not saved:', err);
              onShowToast('Не удалось сохранить статус диалога', 'error');
            });
          }}
          orders={activeThread.threadId ? orders.filter((o) => o.customerUid === activeThread.threadId) : []}
          allOrders={orders}
          products={products}
          promos={promos}
          categories={categories}
          storefrontSettings={storefrontSettings}
          initialOrderId={initialOrderId}
          onSend={(payload) => {
            if (!activeThread.threadId) return;
            onSend({ threadId: activeThread.threadId, threadName: activeThread.name }, payload);
          }}
          onUpdateOrders={onUpdateOrders}
          onReviewReceipt={onReviewReceipt}
          onClear={() => onClearThread(activeThread.threadId)}
          onChangeMessage={onChangeMessage}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
