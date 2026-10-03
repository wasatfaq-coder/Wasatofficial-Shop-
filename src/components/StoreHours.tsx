import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { StoreSchedule } from '../types';
import {
  isScheduleConfigured,
  scheduleStatus,
  STORE_TIME_ZONE,
  statusText,
  upcomingExceptions,
  weekSummary,
} from '../utils/storeSchedule';

/** The current moment, renewed every minute: «Открыто до 21:00» turns into «Закрыто» on its own */
export function useMinuteClock(enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

const isMoscowTime = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === STORE_TIME_ZONE;
  } catch {
    return true;
  }
};

interface StoreHoursProps {
  schedule?: StoreSchedule | null;
  /** The owner's comment («В праздники — по согласованию»); without a schedule it is all the buyer sees */
  comment?: string;
}

/**
 * The store's hours for buyers (docs/store-schedule-spec.md): the status now, the week, special days ahead and the
 * comment. Nothing is set — nothing is shown.
 */
export const StoreHours: React.FC<StoreHoursProps> = ({ schedule, comment = '' }) => {
  const configured = isScheduleConfigured(schedule);
  const now = useMinuteClock(configured);
  const note = comment.trim();
  if (!configured) {
    return note ? (
      <div className="flex items-start gap-2 text-xs">
        <Clock className="w-3.5 h-3.5 text-[#4E5C70] shrink-0 mt-0.5" aria-hidden="true" />
        <span className="text-[#4E5C70]">{note}</span>
      </div>
    ) : null;
  }
  const status = scheduleStatus(schedule, now)!;
  const special = upcomingExceptions(schedule, now);
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-start gap-2">
        <Clock className="w-3.5 h-3.5 text-[#4E5C70] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className={`font-bold ${status.open ? 'text-success' : 'text-[#2D3A4E]'}`}>
            {statusText(status)}
            {status.note && <span className="font-semibold text-[#4E5C70]"> · {status.note}</span>}
          </p>
          <ul className="text-[#4E5C70] space-y-0.5" aria-label="График работы">
            {weekSummary(schedule).map((row) => (
              <li key={row.days}>
                <span className="font-semibold text-[#2D3A4E]">{row.days}</span> {row.hours}
              </li>
            ))}
          </ul>
          {special.length > 0 && (
            <ul className="text-[#4E5C70] space-y-0.5" aria-label="Особые дни">
              {special.map((day) => (
                <li key={day.date}>
                  <span className="font-semibold text-[#2D3A4E]">{day.label}</span> {day.hours}
                  {day.note && ` · ${day.note}`}
                </li>
              ))}
            </ul>
          )}
          {note && <p className="text-[#4E5C70]">{note}</p>}
          {!isMoscowTime() && <p className="text-[#4E5C70]">Время — московское</p>}
        </div>
      </div>
    </div>
  );
};
