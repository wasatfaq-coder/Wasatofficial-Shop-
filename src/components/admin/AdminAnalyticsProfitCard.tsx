import React from 'react';
import { Coins } from 'lucide-react';
import { AdminHint } from './AdminHint';
import { pluralRu } from '../../utils/pluralize';
import type { ProfitSummary } from '../../utils/salesProfit';
import type { SalesChannel } from '../../shared/orderLine';

const rub = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('ru-RU')} ₽`;

const CHANNELS: { id: SalesChannel; title: string }[] = [
  { id: 'retail', title: 'Розница' },
  { id: 'wholesale', title: 'Опт' },
];

const Row: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-[11px] text-[#4E5C70]">{label}</dt>
    <dd className={`tabular-nums text-right ${strong ? 'text-sm font-extrabold' : 'text-xs font-bold'} ${tone ?? 'text-[#2D3A4E]'}`}>{value}</dd>
  </div>
);

/**
 * «Чистый доход: розница и опт» of the period: money for goods, what they cost to buy and the difference, each channel
 * apart and whatever the channel chosen above. «≈» — part of the cost is today's purchase price (an estimate).
 */
export const AdminAnalyticsProfitCard: React.FC<{ byChannel: Record<SalesChannel, ProfitSummary> }> = ({ byChannel }) => {
  const estimatedOrders = byChannel.retail.estimatedOrders + byChannel.wholesale.estimatedOrders;
  const missingLines = byChannel.retail.missingCostLines + byChannel.wholesale.missingCostLines;

  return (
    <section className="neu-flat rounded-3xl p-4 space-y-3" aria-labelledby="analytics-profit-title">
      <div className="flex items-center gap-1">
        <h4 id="analytics-profit-title" className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-accent" />
          Чистый доход: розница и опт
        </h4>
        <AdminHint label="Чистый доход">
          Деньги за товары оплаченных заказов (со скидками, без доставки) минус их закупочная стоимость
        </AdminHint>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {CHANNELS.map((c) => {
          const p = byChannel[c.id];
          const approx = p.estimatedOrders > 0 ? '≈ ' : '';
          return (
            <div key={c.id} role="group" aria-label={c.title} className="neu-inset rounded-2xl p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-extrabold text-[#2D3A4E]">{c.title}</span>
                <span className="text-[11px] text-[#4E5C70]">
                  {p.orders} {pluralRu(p.orders, ['оплаченный заказ', 'оплаченных заказа', 'оплаченных заказов'])}
                </span>
              </div>
              {p.orders === 0 ? (
                <p className="text-xs text-[#4E5C70]">
                  {c.id === 'wholesale'
                    ? 'Оптовых продаж за период нет. Заказ считается оптовым, если в нём есть строка по оптовой цене'
                    : 'Продаж за период нет'}
                </p>
              ) : (
                <dl className="space-y-1.5">
                  <Row label="Выручка от товаров" value={rub(p.revenue)} />
                  <Row label="Себестоимость закупки" value={`${approx}${rub(p.cogs)}`} />
                  <div className="border-t border-[#BAC5D5]/50 pt-1.5 space-y-1">
                    <Row
                      label="Чистый доход"
                      value={`${approx}${rub(p.netProfit)}`}
                      strong
                      tone={p.netProfit < 0 ? 'text-danger' : 'text-success'}
                    />
                    <Row label="Маржа" value={p.marginPercent === null ? '—' : `${approx}${p.marginPercent}%`} />
                  </div>
                </dl>
              )}
            </div>
          );
        })}
      </div>
      {(estimatedOrders > 0 || missingLines > 0) && (
        <div className="text-[11px] text-[#4E5C70] space-y-1">
          {estimatedOrders > 0 && (
            <p>
              ≈ — оценка: у {estimatedOrders} {pluralRu(estimatedOrders, ['заказа', 'заказов', 'заказов'])} себестоимость
              взята по сегодняшней закупке товара, потому что цена закупки на момент продажи не сохранена (заказы до 9 октября 2026 года).
            </p>
          )}
          {missingLines > 0 && (
            <p className="text-warning font-bold">
              У {missingLines} {pluralRu(missingLines, ['строки', 'строк', 'строк'])} заказов нет себестоимости товара: они
              посчитаны по 0 ₽, и чистый доход завышен. Задайте себестоимость в карточке товара, блок «Цены».
            </p>
          )}
        </div>
      )}
    </section>
  );
};
