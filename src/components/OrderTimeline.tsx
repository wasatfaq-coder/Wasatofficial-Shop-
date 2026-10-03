import React from 'react';
import { History } from 'lucide-react';
import type { Order } from '../types';
import { orderTimeline } from '../utils/orderFlow';

/**
 * «История заказа»: оформление, каждая смена статуса со временем до секунды и автором, отмена, корректировки
 * (задание владельца 02.10 — вместо «Истории статусов», «Этапов доставки» и «Хронологии изменений»).
 */
export const OrderTimeline: React.FC<{ order: Order; audience: 'admin' | 'customer'; className?: string }> = ({
  order,
  audience,
  className = '',
}) => {
  const events = orderTimeline(order, audience);
  return (
    <section className={`space-y-2 ${className}`} aria-label="История заказа">
      <h4 className="text-xs font-extrabold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        История заказа
      </h4>
      <ol className="space-y-0">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          const dot =
            event.tone === 'danger' ? 'bg-danger' : event.tone === 'success' ? 'bg-success' : isLast ? 'bg-accent' : 'bg-[#4E5C70]';
          return (
            <li key={event.key} className="relative flex items-start gap-3">
              <div className="flex flex-col items-center self-stretch shrink-0 pt-1.5" aria-hidden="true">
                <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                {!isLast && <span className="w-0.5 flex-1 my-1 bg-[#BAC5D5] rounded-full min-h-4" />}
              </div>
              <div className="flex-1 min-w-0 pb-3">
                <p className={`text-xs font-bold ${event.tone === 'danger' ? 'text-danger' : 'text-[#2D3A4E]'}`}>{event.title}</p>
                <p className="text-[11px] text-[#4E5C70]">
                  {[event.time, event.who].filter(Boolean).join(' · ') || 'Время не записано'}
                </p>
                {event.note && <p className="text-xs text-[#4E5C70] leading-snug mt-0.5 break-words">{event.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
