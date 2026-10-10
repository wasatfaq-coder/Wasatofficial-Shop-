import React, { useState } from 'react';
import { CalendarRange, Check, X } from 'lucide-react';
import { ModalPortal } from '../ModalPortal';
import { useDialogA11y } from '../../utils/useDialogA11y';
import {
  dateKeyOf,
  isCustomPeriod,
  parseDateKey,
  periodRangeText,
  type AnalyticsPeriod,
  type PeriodSelection,
} from '../../utils/analyticsPeriods';

export const PERIODS: { id: AnalyticsPeriod; title: string }[] = [
  { id: '7d', title: 'Последние 7 дней' },
  { id: '14d', title: 'Последние 14 дней' },
  { id: '30d', title: 'Последние 30 дней' },
  { id: '6m', title: 'Последние 6 месяцев' },
  { id: '1y', title: 'Последние 12 месяцев' },
];

/** «Последние 7 дней» or «Свой период» */
export function periodTitle(selection: PeriodSelection): string {
  return isCustomPeriod(selection) ? 'Свой период' : PERIODS.find((p) => p.id === selection)!.title;
}

/**
 * Period picker: ready periods and the owner's own dates (a modal list: on a phone five segments did not fit one row).
 * The dates are checked on «Показать»: both set, a real date, not in the future.
 */
export const AdminAnalyticsPeriodDialog: React.FC<{
  value: PeriodSelection;
  onChange: (p: PeriodSelection) => void;
  onClose: () => void;
}> = ({ value, onChange, onClose }) => {
  const dialog = useDialogA11y(true, onClose);
  const today = dateKeyOf(new Date());
  const [from, setFrom] = useState(isCustomPeriod(value) ? value.from : '');
  const [to, setTo] = useState(isCustomPeriod(value) ? value.to : today);
  const [error, setError] = useState<string | null>(null);

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const a = parseDateKey(from);
    const b = parseDateKey(to);
    if (!a || !b) {
      setError('Укажите обе даты');
      return;
    }
    if (a > b) {
      setError('Дата «с» позже даты «по»');
      return;
    }
    if (to > today) {
      setError('Дата «по» ещё не наступила');
      return;
    }
    onChange({ from, to });
    onClose();
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[160] bg-[#2D3A4E]/45 flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          ref={dialog.ref}
          {...dialog.props}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto neu-modal rounded-3xl p-4 sm:p-5 space-y-3 animate-in zoom-in-95 fade-in duration-200"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E] flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-accent" />
              Период аналитики
            </h4>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2" role="radiogroup" aria-label="Период">
            {PERIODS.map((p) => {
              const selected = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-autofocus={selected || undefined}
                  onClick={() => {
                    onChange(p.id);
                    onClose();
                  }}
                  className={`w-full min-h-12 px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer transition-all ${
                    selected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold">{p.title}</span>
                    <span className="block text-[11px] text-[#4E5C70]">{periodRangeText(p.id)}</span>
                  </span>
                  {selected && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={applyCustom}
            noValidate
            className={`rounded-2xl p-3 space-y-2.5 ${isCustomPeriod(value) ? 'neu-pill-active' : 'neu-flat-sm'}`}
          >
            <p className="text-xs font-extrabold text-[#2D3A4E]">
              Свой период{isCustomPeriod(value) && <span className="font-bold text-accent"> · выбран</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 min-w-0">
                <span className="block text-[11px] font-bold text-[#4E5C70]">С</span>
                <input
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'analytics-period-error' : undefined}
                  className="w-full min-w-0 h-11 px-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E]"
                />
              </label>
              <label className="space-y-1 min-w-0">
                <span className="block text-[11px] font-bold text-[#4E5C70]">По</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={today}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'analytics-period-error' : undefined}
                  className="w-full min-w-0 h-11 px-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E]"
                />
              </label>
            </div>
            {error && (
              <p id="analytics-period-error" role="alert" className="text-xs font-bold text-danger">
                {error}
              </p>
            )}
            <button type="submit" className="w-full h-11 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer">
              Показать за эти даты
            </button>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
