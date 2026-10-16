import React from 'react';
import { AlertCircle, Sparkles, Store } from 'lucide-react';
import { readMinWholesaleAmount } from '../../../shared/wholesalePricing';
import { AdminServerOrdersCard } from '../AdminServerOrdersCard';
import {
  MAX_MIN_WHOLESALE_AMOUNT,
  MAX_RETURN_PERIOD_DAYS,
  MAX_UNPAID_CANCEL_DAYS,
  parseWholeNumber,
  type StorefrontSectionProps,
} from './storefrontForm';
import { StorefrontCard, StorefrontDaysField, StorefrontSwitchRow } from './StorefrontFields';

interface StorefrontOrdersSectionProps extends StorefrontSectionProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** «Приём заказов»: принимает ли сайт заказы, предзаказ, автоотмена, срок возврата, минимальная сумма опта и проверка заказов на сервере */
export const StorefrontOrdersSection: React.FC<StorefrontOrdersSectionProps> = ({ settings, patch, onShowToast }) => (
  <div className="space-y-4">
    <StorefrontCard title="Приём заказов" icon={<Store className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
      <div className="space-y-2.5">
        <StorefrontSwitchRow
          id="storefront-isStoreOnline"
          label="Принимать заказы на сайте"
          status={settings.isStoreOnline ? 'Заказы принимаются' : 'Приём остановлен'}
          hint="Выключите, если не можете выполнять заказы: сайт перестанет их принимать."
          checked={Boolean(settings.isStoreOnline)}
          onChange={(isStoreOnline) => patch({ isStoreOnline })}
          icon={<Store className="w-4 h-4" aria-hidden="true" />}
        />
        {!settings.isStoreOnline && (
          <div className="neu-tone-warning rounded-2xl p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-text-primary leading-snug">
              <span className="font-extrabold block">
                Приём заказов остановлен: оформление и «Заказ в 1 клик» не подтверждают заказ
              </span>
              Покупатели видят плашку на главной и пишут в чат
              {settings.phone ? ` или звонят: ${settings.phone}` : ''}. Заказы, которые уже есть, это не меняет.
            </p>
          </div>
        )}
        <StorefrontSwitchRow
          id="storefront-isPreorderMode"
          label="Предзаказ"
          status={settings.isPreorderMode ? 'Можно заказать без остатка' : 'Только то, что есть в наличии'}
          hint="Можно заказать товар, которого нет на складе. Остаток уйдёт в минус."
          checked={Boolean(settings.isPreorderMode)}
          onChange={(isPreorderMode) => patch({ isPreorderMode })}
          icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StorefrontDaysField
          id="storefront-unpaidOrderCancelDays"
          label="Отменять неоплаченные заказы через"
          hint="Если не оплатили за N дней, заказ отменится, а товар вернётся на склад."
          value={settings.unpaidOrderCancelDays}
          max={MAX_UNPAID_CANCEL_DAYS}
          placeholder="не отменять"
          note="Заказ в «Принят» со статусом «Ожидает оплаты» отменяется с причиной «Заказ не оплачен», товар возвращается на склад. Срабатывает, когда вы открываете «Заказы». Чек на проверке и оплата при получении не отменяются. Пусто — не отменять."
          onChange={(raw) => patch({ unpaidOrderCancelDays: parseWholeNumber(raw, MAX_UNPAID_CANCEL_DAYS) })}
        />
        <StorefrontDaysField
          id="storefront-returnPeriodDays"
          label="Срок возврата"
          hint="Сколько дней покупатель может вернуть товар. Попадает в FAQ и документы."
          value={settings.returnPeriodDays}
          max={MAX_RETURN_PERIOD_DAYS}
          placeholder="не задан"
          note={`Покупатель видит срок в карточке товара и в документах. Не больше ${MAX_RETURN_PERIOD_DAYS} дней. Пусто — срок не называется.`}
          onChange={(raw) => patch({ returnPeriodDays: parseWholeNumber(raw, MAX_RETURN_PERIOD_DAYS) })}
        />
      </div>

      <StorefrontDaysField
        id="storefront-minWholesaleOrderAmount"
        label="Минимальная сумма оптового заказа"
        hint="Общая сумма оптовых строк и ростовок в корзине, меньше которой оптовый заказ не оформляется. На розничные заказы не влияет."
        value={readMinWholesaleAmount(settings.wholesale)}
        max={MAX_MIN_WHOLESALE_AMOUNT}
        unit="₽"
        placeholder="без минимума"
        note="Проверяется в корзине и при оформлении заказа только тогда, когда в корзине есть оптовые позиции или ростовки. Поле синхронизировано с разделом «Опт». Пусто — без порога."
        onChange={(raw) => {
          const minOrderAmount = parseWholeNumber(raw, MAX_MIN_WHOLESALE_AMOUNT);
          const { minOrderAmount: _old, ...rest } = settings.wholesale ?? {};
          const nextWholesale = {
            ...rest,
            ...(minOrderAmount !== undefined ? { minOrderAmount } : {}),
          };
          patch({ wholesale: Object.keys(nextWholesale).length > 0 ? nextWholesale : undefined });
        }}
      />

      <p className="text-xs text-text-secondary">
        Порог бесплатной доставки и экспресс — в разделе «Доставка и ПВЗ», шкала скидок за объём — в разделе «Опт».
      </p>
    </StorefrontCard>

    <AdminServerOrdersCard onShowToast={onShowToast} />
  </div>
);
