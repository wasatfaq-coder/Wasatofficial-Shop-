import React, { useState } from 'react';
import { CalendarDays, Clock, Copy, Plus, Trash2 } from 'lucide-react';
import type { StoreSchedule, StoreScheduleException, StoreScheduleHours, StoreWeekday } from '../../types';
import { NeumorphicSwitch } from '../NeumorphicSwitch';
import { ConfirmDialog } from '../ConfirmDialog';
import { AdminHint } from './AdminHint';
import { useMinuteClock } from '../StoreHours';
import {
  emptySchedule,
  isScheduleConfigured,
  MAX_SCHEDULE_EXCEPTIONS,
  scheduleErrors,
  scheduleStatus,
  shortDate,
  statusText,
  WEEKDAYS,
} from '../../utils/storeSchedule';

interface AdminScheduleEditorProps {
  schedule?: StoreSchedule;
  /** The comment under the schedule (the old «Режим работы» text, `workingHours`) */
  comment: string;
  onChange: (schedule: StoreSchedule) => void;
  onCommentChange: (comment: string) => void;
  /** «Применить» was pressed with a mistake: the errors are shown */
  showErrors?: boolean;
}

const ALL_DAY: Pick<StoreScheduleHours, 'from' | 'to'> = { from: '00:00', to: '24:00' };
const isAllDay = (h: { from?: string; to?: string }) => h.from === ALL_DAY.from && h.to === ALL_DAY.to;
const timeClass =
  'h-9 min-w-0 w-full px-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * «График работы» in Admin → «Витрина» (docs/store-schedule-spec.md): the week, special days and the comment.
 * Applied with the rest of «Витрина» by «Применить».
 */
export const AdminScheduleEditor: React.FC<AdminScheduleEditorProps> = ({
  schedule,
  comment,
  onChange,
  onCommentChange,
  showErrors = false,
}) => {
  const current = schedule ?? emptySchedule();
  const exceptions = current.exceptions ?? [];
  const now = useMinuteClock();
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const errors = scheduleErrors(current);
  const status = scheduleStatus(current, now);

  const setDay = (key: StoreWeekday, patch: Partial<StoreScheduleHours>) =>
    onChange({ ...current, days: { ...current.days, [key]: { ...current.days[key], ...patch } } });
  const setException = (index: number, patch: Partial<StoreScheduleException>) =>
    onChange({ ...current, exceptions: exceptions.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  const copyMondayToWeekdays = () => {
    const monday = current.days.mon;
    onChange({
      ...current,
      days: { ...current.days, tue: { ...monday }, wed: { ...monday }, thu: { ...monday }, fri: { ...monday } },
    });
  };
  const addException = () =>
    onChange({ ...current, exceptions: [...exceptions, { date: '', closed: true, from: '10:00', to: '18:00' }] });

  return (
    <div className="space-y-3" id="storefront-schedule">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          График работы (время московское)
          <AdminHint label="График работы">
            Только показывается покупателям. Заказы он не останавливает — для этого «Онлайн-витрина».
          </AdminHint>
        </p>
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          Как в понедельник — на все будни
        </button>
      </div>

      <ul className="space-y-1.5">
        {WEEKDAYS.map(({ key, short, full }) => {
          const day = current.days[key];
          const allDay = day.open && isAllDay(day);
          return (
            <li key={key} className="neu-inset rounded-2xl px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-7 text-xs font-extrabold text-[#2D3A4E]" title={full}>
                  {short}
                </span>
                <NeumorphicSwitch
                  checked={day.open}
                  onChange={(open) => setDay(key, { open })}
                  label={`${full}: работает`}
                />
                <span className="flex-1 min-w-0 text-xs text-[#4E5C70]">
                  {!day.open ? 'Выходной' : allDay ? 'Круглосуточно' : ''}
                </span>
                {day.open && (
                  <button
                    type="button"
                    onClick={() => setDay(key, allDay ? { from: '10:00', to: '21:00' } : ALL_DAY)}
                    aria-pressed={allDay}
                    className={`h-8 px-2.5 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer ${
                      allDay ? 'neu-pill-active text-accent' : 'neu-button text-[#4E5C70]'
                    }`}
                    title={allDay ? 'Задать часы' : 'Работает круглосуточно'}
                  >
                    24 ч
                  </button>
                )}
              </div>
              {day.open && !allDay && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                  <input
                    type="time"
                    value={day.from}
                    onChange={(e) => setDay(key, { from: e.target.value })}
                    aria-label={`${full}: открытие`}
                    aria-invalid={showErrors && errors.some((m) => m.startsWith(full)) ? true : undefined}
                    className={timeClass}
                  />
                  <span className="text-xs text-[#4E5C70]" aria-hidden="true">
                    –
                  </span>
                  <input
                    type="time"
                    value={day.to === '24:00' ? '23:59' : day.to}
                    onChange={(e) => setDay(key, { to: e.target.value })}
                    aria-label={`${full}: закрытие`}
                    aria-invalid={showErrors && errors.some((m) => m.startsWith(full)) ? true : undefined}
                    className={timeClass}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            Особые дни ({exceptions.length})
          </p>
          <button
            type="button"
            onClick={addException}
            disabled={exceptions.length >= MAX_SCHEDULE_EXCEPTIONS}
            className="h-8 px-3 rounded-xl neu-button text-[11px] font-bold text-accent inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Особый день
          </button>
        </div>
        {exceptions.length === 0 && (
          <p className="text-xs text-[#4E5C70]">Праздники и дни с другими часами. Прошедшие покупатели не видят.</p>
        )}
        <ul className="space-y-1.5">
          {exceptions.map((e, index) => {
            const name = e.date ? shortDate(e.date) : `№ ${index + 1}`;
            return (
              <li key={index} className="neu-inset rounded-2xl p-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={e.date}
                    onChange={(ev) => setException(index, { date: ev.target.value })}
                    aria-label={`Особый день ${name}: дата`}
                    aria-invalid={showErrors && !e.date ? true : undefined}
                    className="h-9 px-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-semibold"
                  />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-[#2D3A4E]">
                    <NeumorphicSwitch
                      checked={e.closed}
                      onChange={(closed) => setException(index, { closed })}
                      label={`Особый день ${name}: выходной`}
                    />
                    Выходной
                  </label>
                  <button
                    type="button"
                    onClick={() => setRemoveIndex(index)}
                    className="ml-auto w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center cursor-pointer"
                    aria-label={`Удалить особый день ${name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
                {!e.closed && (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                    <input
                      type="time"
                      value={e.from ?? ''}
                      onChange={(ev) => setException(index, { from: ev.target.value })}
                      aria-label={`Особый день ${name}: открытие`}
                      className={timeClass}
                    />
                    <span className="text-xs text-[#4E5C70]" aria-hidden="true">
                      –
                    </span>
                    <input
                      type="time"
                      value={e.to ?? ''}
                      onChange={(ev) => setException(index, { to: ev.target.value })}
                      aria-label={`Особый день ${name}: закрытие`}
                      className={timeClass}
                    />
                  </div>
                )}
                <input
                  type="text"
                  value={e.note ?? ''}
                  maxLength={60}
                  onChange={(ev) => setException(index, { note: ev.target.value })}
                  placeholder="Подпись, например: Новый год"
                  aria-label={`Особый день ${name}: подпись`}
                  className="w-full h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label htmlFor="storefront-workingHours" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
          Комментарий к графику (необязательно)
        </label>
        <input
          id="storefront-workingHours"
          type="text"
          value={comment}
          maxLength={160}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Например: в праздники — по согласованию"
          className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
        />
      </div>

      {showErrors && errors.length > 0 ? (
        <div role="alert" className="rounded-2xl bg-danger-soft border border-danger/40 p-3 space-y-1">
          <p className="text-xs font-extrabold text-danger">График не сохранён:</p>
          <ul className="list-disc pl-4 text-xs text-[#2D3A4E] space-y-0.5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-[#4E5C70]">
          {isScheduleConfigured(current) && status ? (
            <>
              Покупатели сейчас видят: <span className="font-bold text-[#2D3A4E]">{statusText(status)}</span>
            </>
          ) : comment.trim() ? (
            'Рабочие дни не отмечены — покупатели видят только комментарий'
          ) : (
            'Рабочие дни не отмечены — покупатели не видят график'
          )}
        </p>
      )}

      <ConfirmDialog
        isOpen={removeIndex !== null}
        title="Удалить особый день?"
        message="Покупатели снова увидят обычные часы этого дня недели."
        preview={
          removeIndex !== null && exceptions[removeIndex] ? (
            <p className="text-xs font-extrabold text-[#2D3A4E]">
              {exceptions[removeIndex].date ? shortDate(exceptions[removeIndex].date) : 'Без даты'} ·{' '}
              {exceptions[removeIndex].closed
                ? 'выходной'
                : `${exceptions[removeIndex].from ?? ''}–${exceptions[removeIndex].to ?? ''}`}
              {exceptions[removeIndex].note ? ` · ${exceptions[removeIndex].note}` : ''}
            </p>
          ) : undefined
        }
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        onConfirm={() => {
          if (removeIndex !== null) onChange({ ...current, exceptions: exceptions.filter((_, i) => i !== removeIndex) });
          setRemoveIndex(null);
        }}
        onClose={() => setRemoveIndex(null)}
      />
    </div>
  );
};
