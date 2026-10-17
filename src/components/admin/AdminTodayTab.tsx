import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, Clock, PowerOff, ChevronRight, Coins, Headphones, MessageSquareText, Package, Receipt, type LucideIcon } from 'lucide-react';
import type { ChatMessage, Order, Product } from '../../types';
import type { LaunchStep } from '../../utils/launchChecklist';
import { staleRateDays, summarizeAdminToday, TODAY_REVENUE_DAYS, waitingFor } from '../../utils/adminToday';
import type { ExchangeRates } from '../../utils/currencyPricing';
import { subscribeToAnalyticsResetAt, subscribeToExchangeRates } from '../../utils/firebaseSync';
import { overdueUnpaidOrders } from '../../utils/orderCancel';
import { pluralRu } from '../../utils/pluralize';
import { AdminHint } from './AdminHint';
import { AdminLaunchChecklist } from './AdminLaunchChecklist';
import type { AdminTab } from './adminSections';

export interface AdminOrdersFilterPreset {
  status?: Order['status'] | 'all';
  payment?: 'all' | 'paid' | 'pending' | 'paid_on_delivery' | 'receipt_review';
  search?: string;
}

interface AdminTodayTabProps {
  orders: Order[];
  chatMessages: ChatMessage[];
  products: Product[];
  lowStockThreshold: number;
  unpaidCancelDays?: number;
  launchSteps: LaunchStep[];
  /** «Принимать заказы на сайте» выключено (settings/storefront.isStoreOnline === false): сайт не принимает заказы */
  isStoreOffline?: boolean;
  /** Reviews waiting for the owner's check (the row is shown only when there are some) */
  pendingReviews?: number;
  onOpenTab: (tab: AdminTab) => void;
  onOpenOrdersWithFilter?: (preset: AdminOrdersFilterPreset) => void;
}

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

/** One line of «что ждёт»: opens its section; the number is in the button's name */
const TodayRow: React.FC<{
  icon: LucideIcon;
  title: string;
  detail: string;
  count: number;
  onOpen: () => void;
  /** Warning line: no number, the title says it all */
  tone?: 'warning';
}> = ({ icon: Icon, title, detail, count, onOpen, tone }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`w-full rounded-2xl p-3 flex items-center gap-3 text-left cursor-pointer ${
      tone === 'warning' ? 'neu-tone-warning' : 'neu-button'
    }`}
  >
    <span
      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        tone === 'warning' ? 'neu-flat-sm text-warning' : 'neu-inset text-accent'
      }`}
      aria-hidden="true"
    >
      <Icon className="w-4 h-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-extrabold text-text-primary">{title}</span>
      <span className="block text-xs text-text-secondary">{detail}</span>
    </span>
    {tone !== 'warning' && (
      <span
        className={`min-w-[28px] h-7 px-2 rounded-full text-xs font-extrabold leading-7 text-center shrink-0 ${
          count > 0 ? 'neu-fill-accent text-white' : 'neu-inset text-text-secondary'
        }`}
      >
        <span className="sr-only">: </span>
        {count}
      </span>
    )}
    <ChevronRight className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
  </button>
);

/**
 * «Сегодня» (stage 2 of docs/admin-wholesale-plan.md, menu variant A): the panel opens on what waits for the owner —
 * new orders, receipts, the chat, low stock, an old exchange rate and the week's paid money. Every line opens its
 * section. Counted from what the panel already has; only the rates are read (the admin-only document).
 */
export const AdminTodayTab: React.FC<AdminTodayTabProps> = ({
  orders,
  chatMessages,
  products,
  lowStockThreshold,
  unpaidCancelDays,
  launchSteps,
  isStoreOffline = false,
  pendingReviews = 0,
  onOpenTab,
  onOpenOrdersWithFilter,
}) => {
  // «Сбросить статистику» of «Аналитики» applies here too: the week's money is the same number there and here
  const [resetAt, setResetAt] = useState<number | null>(null);
  useEffect(() => subscribeToAnalyticsResetAt(setResetAt), []);
  const today = useMemo(
    () => summarizeAdminToday(orders, chatMessages, products, lowStockThreshold, resetAt),
    [orders, chatMessages, products, lowStockThreshold, resetAt]
  );

  const overdueCount = useMemo(
    () => overdueUnpaidOrders(orders, unpaidCancelDays).length,
    [orders, unpaidCancelDays]
  );

  // the rates are read only for the banner; a refused read shows no banner (the error is logged by the subscription)
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  useEffect(() => subscribeToExchangeRates(setRates), []);
  const staleRate = rates ? staleRateDays(rates, products) : null;

  const lowTotal = today.lowVariants + today.outVariants;

  const openOrdersPreset = (preset: AdminOrdersFilterPreset) => {
    if (onOpenOrdersWithFilter) {
      onOpenOrdersWithFilter(preset);
    } else {
      onOpenTab('orders');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-extrabold text-text-primary font-display">Сегодня</h3>

      <AdminLaunchChecklist steps={launchSteps} onOpenTab={onOpenTab} />

      <section aria-label="Что ждёт" className="grid gap-2 lg:grid-cols-2">
        {isStoreOffline && (
          <TodayRow
            icon={PowerOff}
            tone="warning"
            title="Приём заказов выключен"
            detail="Покупатели не могут оформить заказ. Включить — в «Витрине»"
            count={0}
            onOpen={() => onOpenTab('storefront')}
          />
        )}
        <TodayRow
          icon={Package}
          title="Новые заказы"
          detail={today.newOrders > 0 ? 'Принять и собрать' : 'Новых заказов нет'}
          count={today.newOrders}
          onOpen={() => openOrdersPreset({ status: 'accepted', payment: 'all', search: '' })}
        />
        {today.receiptsOnReview > 0 && (
          <TodayRow
            icon={Receipt}
            title="Чеки на проверке"
            detail="Покупатель прислал чек: подтвердите оплату или отклоните"
            count={today.receiptsOnReview}
            onOpen={() => openOrdersPreset({ status: 'all', payment: 'receipt_review', search: '' })}
          />
        )}
        {overdueCount > 0 && (
          <TodayRow
            icon={Clock}
            title="Не оплачены в срок"
            detail="Срок ожидания оплаты истёк: свяжитесь с клиентом или отмените с возвратом на склад"
            count={overdueCount}
            onOpen={() => openOrdersPreset({ status: 'accepted', payment: 'pending', search: '' })}
          />
        )}
        <TodayRow
          icon={Headphones}
          title="Ждут ответа в чате"
          detail={
            today.oldestAwaitingAt !== null
              ? `Дольше всех ждёт ${waitingFor(today.oldestAwaitingAt)}`
              : today.awaitingChats > 0
                ? 'Покупатели написали последними'
                : 'На все вопросы ответили'
          }
          count={today.awaitingChats}
          onOpen={() => onOpenTab('support')}
        />
        {pendingReviews > 0 && (
          <TodayRow
            icon={MessageSquareText}
            title="Отзывы на проверке"
            detail="Опубликуйте отзыв или отклоните его"
            count={pendingReviews}
            onOpen={() => onOpenTab('reviews')}
          />
        )}
        <TodayRow
          icon={Boxes}
          title="Заканчивается на складе"
          detail={
            lowTotal > 0
              ? `Остаток ${lowStockThreshold} шт. и меньше${
                  today.outVariants > 0 ? ` · нет в наличии: ${today.outVariants}` : ''
                }`
              : `У всех вариантов больше ${lowStockThreshold} шт.`
          }
          count={lowTotal}
          onOpen={() => onOpenTab('inventory')}
        />
      </section>

      {staleRate && (
        <section
          aria-labelledby="today-rate-title"
          className="rounded-2xl p-4 space-y-3 neu-tone-warning"
        >
          <div className="flex items-start gap-2.5">
            <Coins className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <h4 id="today-rate-title" className="text-sm font-extrabold text-text-primary">
                {staleRate.days === null
                  ? 'Курсы ещё не применялись'
                  : `Курс не обновлялся ${staleRate.days} ${pluralRu(staleRate.days, ['день', 'дня', 'дней'])}`}
              </h4>
              <p className="text-xs text-text-primary">
                У {staleRate.products} {pluralRu(staleRate.products, ['товара', 'товаров', 'товаров'])} закупка в долларах
                или юанях: их цены считаются от курса. Проверьте курс ЦБ и нажмите «Применить».
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenTab('rates')}
            className="h-9 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white cursor-pointer"
          >
            Обновить курс
          </button>
        </section>
      )}

      <section aria-labelledby="today-revenue-title" className="neu-flat rounded-2xl p-4 space-y-1">
        <div className="flex items-center gap-1">
          <h4 id="today-revenue-title" className="text-xs font-bold text-text-secondary">
            Выручка за {TODAY_REVENUE_DAYS} дней, только оплаченные
          </h4>
          <AdminHint label="Выручка за 7 дней">
            Деньги за заказы с отметкой «Оплачен» за 7 дней, сегодня включительно, — то же число, что в «Аналитике».
          </AdminHint>
        </div>
        <p className="text-2xl font-extrabold text-text-primary font-display">{rub(today.revenue)}</p>
        <p className="text-xs text-text-secondary">
          {today.paidOrders} {pluralRu(today.paidOrders, ['оплаченный заказ', 'оплаченных заказа', 'оплаченных заказов'])}
        </p>
        <button
          type="button"
          onClick={() => onOpenTab('analytics')}
          className="mt-1 min-h-8 inline-flex items-center gap-1.5 text-xs font-extrabold text-accent hover:text-accent-strong cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
          Вся аналитика
        </button>
      </section>
    </div>
  );
};
