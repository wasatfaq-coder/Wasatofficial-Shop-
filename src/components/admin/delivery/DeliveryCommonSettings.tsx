import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { StorefrontSettings } from '../../../types';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import { AdminHint } from '../AdminHint';
import { useUnsavedChanges } from '../../../utils/unsavedChanges';
import { AdminExample } from '../AdminExample';

interface DeliveryCommonSettingsProps {
  settings: StorefrontSettings;
  onUpdateSettings: (settings: StorefrontSettings) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** The largest threshold the field takes: a typo of extra zeros would silently turn free delivery off */
const MAX_THRESHOLD = 10_000_000;

/** '' → no threshold; otherwise whole roubles, or null when it isn't a sensible number */
export function parseThreshold(text: string): number | undefined | null {
  const trimmed = text.trim().replace(/\s/g, '');
  if (trimmed === '') return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > MAX_THRESHOLD ? null : value || undefined;
}

/**
 * «Пример» под порогом: заказ ровно на порог и на рубль меньше — что увидит покупатель. Пусто или меньше 2 ₽ — null.
 */
function thresholdExample(threshold: number | undefined | null): { title: string; lines: string[] } | null {
  if (typeof threshold !== 'number' || threshold < 2) return null;
  const money = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
  return {
    title: `заказ на ${money(threshold)}`,
    lines: [`доставка бесплатно; на ${money(threshold - 1)} — по цене способа`],
  };
}

/**
 * «Для всех способов»: the threshold of free delivery and «Экспресс-доставка» — one place for both (этап 6 плана
 * админки, находка 19; before, the threshold was set in «Витрина» too, and express there and here). They live in
 * `settings/storefront`; only these fields are written (`saveStorefrontSettingsToFirestore` with the previous version).
 */
export const DeliveryCommonSettings: React.FC<DeliveryCommonSettingsProps> = ({ settings, onUpdateSettings, onShowToast }) => {
  const saved = settings.freeDeliveryThreshold ? String(settings.freeDeliveryThreshold) : '';
  const [threshold, setThreshold] = useState(saved);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [expressSaving, setExpressSaving] = useState(false);

  // A new value from the database replaces the field only while the owner hasn't typed another one
  const [seen, setSeen] = useState(saved);
  useEffect(() => {
    if (saved === seen) return;
    setSeen(saved);
    setThreshold((current) => (current === seen ? saved : current));
  }, [saved, seen]);

  const dirty = threshold.trim() !== saved;
  useUnsavedChanges(dirty, 'Порог бесплатной доставки');

  const saveThreshold = async () => {
    const value = parseThreshold(threshold);
    if (value === null) {
      setError(`Введите сумму в рублях — целое число до ${MAX_THRESHOLD.toLocaleString('ru-RU')}, или оставьте поле пустым`);
      inputRef.current?.focus();
      return;
    }
    setError('');
    setSaving(true);
    const ok = await onUpdateSettings({ ...settings, freeDeliveryThreshold: value });
    setSaving(false);
    if (ok === false) return;
    setThreshold(value ? String(value) : '');
    onShowToast(value ? `Доставка бесплатна от ${value.toLocaleString('ru-RU')} ₽` : 'Порог бесплатной доставки убран', 'success');
  };

  const example = thresholdExample(parseThreshold(threshold));

  const expressOn = settings.isExpressEnabled !== false;
  const toggleExpress = async (next: boolean) => {
    setExpressSaving(true);
    const ok = await onUpdateSettings({ ...settings, isExpressEnabled: next });
    setExpressSaving(false);
    if (ok !== false) onShowToast(next ? 'Экспресс-доставка показывается покупателям' : 'Экспресс-доставка скрыта', 'success');
  };

  return (
    <section aria-labelledby="delivery-common-title" className="neu-flat rounded-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <h3 id="delivery-common-title" className="text-sm font-extrabold text-[#2D3A4E]">
          Для всех способов
        </h3>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <label htmlFor="delivery-free-threshold" className="text-xs font-bold text-[#2D3A4E]">
            Бесплатная доставка от, ₽
          </label>
          <AdminHint label="Бесплатная доставка от">
            С этой суммы товаров доставка бесплатна. Свой порог у способа важнее этого. Пусто — бесплатной нет
          </AdminHint>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            id="delivery-free-threshold"
            type="text"
            inputMode="numeric"
            value={threshold}
            placeholder="нет"
            onChange={(e) => {
              setThreshold(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty) {
                e.preventDefault();
                void saveThreshold();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'delivery-free-threshold-error' : undefined}
            className="w-36 px-3 py-2 neu-inset rounded-xl text-sm font-extrabold text-[#2D3A4E]"
          />
          {dirty && (
            <button
              type="button"
              onClick={saveThreshold}
              disabled={saving}
              className={`h-9 px-4 rounded-xl text-xs font-extrabold ${saving ? 'neu-button-disabled' : 'neu-button text-accent cursor-pointer'}`}
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          )}
        </div>
        {error && (
          <p id="delivery-free-threshold-error" className="text-xs font-bold text-danger">
            {error}
          </p>
        )}
        {example && <AdminExample title={example.title} lines={example.lines} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span id="delivery-express-label" className="text-xs font-bold text-[#2D3A4E]">
              Экспресс-доставка
            </span>
            <AdminHint label="Экспресс-доставка">
              Выключите — способы с типом «Экспресс» пропадут у покупателей, сами способы останутся
            </AdminHint>
          </div>
          <p className="text-xs text-[#4E5C70]">{expressOn ? 'Показывается покупателям' : 'Скрыта от покупателей'}</p>
        </div>
        <NeumorphicSwitch checked={expressOn} onChange={toggleExpress} label="Экспресс-доставка" disabled={expressSaving} />
      </div>
    </section>
  );
};
