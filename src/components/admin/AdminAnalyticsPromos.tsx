import React, { useMemo } from 'react';
import { Tag } from 'lucide-react';
import type { Order, PromoCode } from '../../types';
import type { PromoSales } from '../../utils/analyticsEngine';
import { computePartnerCommissions } from '../../utils/partnerCommission';
import { AdminHint } from './AdminHint';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/** Nothing sold in the period: a plain note (not «не настроено» — there is nothing to set up) */
export const AdminAnalyticsEmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p role="status" className="neu-inset rounded-2xl p-3 text-xs text-[#4E5C70] text-center">
    {text}
  </p>
);

/** «Промокоды за период» of «Аналитика»: orders, revenue and share by code, the partner's commission */
export const AdminAnalyticsPromos: React.FC<{
  /** The period's codes (computePeriodBreakdown) */
  promos: PromoSales[];
  /** The store's codes: state «Активен / Выключен / Удален» and the partner */
  storePromos: PromoCode[];
  periodOrders: Order[];
}> = ({ promos, storePromos, periodOrders }) => {
  // Partner commission of the period: paid and received orders only, for statistics (the site does not pay it)
  const periodCommissions = useMemo(
    () => new Map(computePartnerCommissions(storePromos, periodOrders).map((c) => [c.code.trim().toUpperCase(), c])),
    [storePromos, periodOrders]
  );

  return (
    <section className="neu-flat rounded-3xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-4 h-4 text-accent" />
          Промокоды за период
        </h4>
        {promos.length > 0 && (
          <span className="text-[11px] text-[#4E5C70]">
            Выручка: <strong className="text-accent">{rub(promos.reduce((s, p) => s + p.revenue, 0))}</strong> · скидки:{' '}
            <strong className="text-[#2D3A4E]">{rub(promos.reduce((s, p) => s + p.discount, 0))}</strong>
          </span>
        )}
      </div>
      {promos.length === 0 ? (
        <AdminAnalyticsEmptyState text="За выбранный период заказов с промокодом нет" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {promos.map((p) => {
            const promo = storePromos.find((x) => x.code.toUpperCase() === p.code);
            return (
              <div key={p.code} className="neu-inset rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-extrabold tracking-wider break-all">{p.code}</span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      !promo ? 'text-[#4E5C70] bg-[#4E5C70]/10' : promo.active ? 'text-success bg-success-soft' : 'text-[#4E5C70] bg-[#4E5C70]/10'
                    }`}
                  >
                    {!promo ? 'Удален' : promo.active ? 'Активен' : 'Выключен'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center pt-1 border-t border-[#BAC5D5]/40">
                  <div>
                    <span className="text-[11px] text-[#4E5C70] block">Заказов</span>
                    <span className="text-xs font-extrabold">{p.orders}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#4E5C70] block">Выручка</span>
                    <span className="text-xs font-extrabold text-accent">{rub(p.revenue)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#4E5C70] flex items-center justify-center gap-0.5">
                      Доля заказов
                      <AdminHint label="Доля заказов" className="-my-0.5">Какая часть заказов за период пришла с этим промокодом</AdminHint>
                    </span>
                    <span className="text-xs font-extrabold">{p.share}%</span>
                  </div>
                </div>
                {periodCommissions.has(p.code) && (() => {
                  const c = periodCommissions.get(p.code)!;
                  return (
                    <p className="text-[11px] text-[#4E5C70] pt-1 border-t border-[#BAC5D5]/40">
                      Партнер{c.partnerName ? ` ${c.partnerName}` : ''}:{' '}
                      {c.percent === null ? (
                        'процент не задан'
                      ) : (
                        <>
                          комиссия {c.percent}% —{' '}
                          <strong className="text-accent">{rub(c.commission)}</strong> с {c.confirmedOrders} оплаченных и
                          полученных
                        </>
                      )}
                      {c.pendingOrders > 0 && `; ждут оплаты или получения: ${c.pendingOrders}`}
                      <AdminHint label="Комиссия партнёра" className="align-middle">Процент партнёру с оплаченных и полученных заказов по его промокоду</AdminHint>
                    </p>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
