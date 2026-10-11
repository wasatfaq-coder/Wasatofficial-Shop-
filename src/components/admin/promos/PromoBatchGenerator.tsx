import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Copy, Wand2 } from 'lucide-react';
import type { PromoCode } from '../../../types';
import { AdminHint } from '../AdminHint';
import { copyToClipboard } from '../../../utils/clipboard';
import { BATCH_MAX_COUNT, batchInputErrors, normalizedCode, uniquePromoCode } from '../../../utils/promoList';
import { pluralRu } from '../../../utils/pluralize';

interface PromoBatchGeneratorProps {
  promos: PromoCode[];
  onUpdatePromos: (promos: PromoCode[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onClose: () => void;
}

const fieldLabel = 'text-[11px] font-bold text-[#4E5C70] block';
const fieldInput = 'w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold';

/**
 * «Пачка кодов» — single-use codes for a mailing, a screen of its own (stage 8 of docs/admin-wholesale-plan.md, part 2,
 * finding 14). The values are checked like the promo form's; the codes are listed for copying once the database has
 * them, and later — on the batch's row in the list («Скопировать неиспользованные»).
 */
export const PromoBatchGenerator: React.FC<PromoBatchGeneratorProps> = ({ promos, onUpdatePromos, onShowToast, onClose }) => {
  const [prefix, setPrefix] = useState('SMS-');
  const [count, setCount] = useState<number>(10);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(500);
  const [minOrder, setMinOrder] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  const inputErrors = useMemo(
    () => batchInputErrors({ prefix, count, discountType, discountValue, minOrder }),
    [prefix, count, discountType, discountValue, minOrder]
  );
  const errors = [...(showErrors ? inputErrors : []), ...(saveError ? [saveError] : [])];

  const handleGenerate = async () => {
    if (isSaving) return;
    setShowErrors(true);
    setSaveError(null);
    if (inputErrors.length > 0) {
      requestAnimationFrame(() => errorsRef.current?.focus());
      return;
    }
    const cleanPrefix = normalizedCode(prefix);
    const value = Number(discountValue);
    const taken = promos.map((p) => p.code);
    const run = Date.now();
    const codes: PromoCode[] = [];
    for (let i = 0; i < count; i++) {
      const code = uniquePromoCode(cleanPrefix, taken);
      taken.push(code);
      codes.push({
        id: `batch-${run}-${i}`,
        code,
        discountType,
        discountValue: value,
        discountPercent: discountType === 'percent' ? value : 0,
        title: discountType === 'percent' ? `Персональная скидка ${value}%` : `Персональный купон на ${value.toLocaleString('ru-RU')} ₽`,
        description: 'Одноразовый персональный промокод из рассылки',
        minOrderAmount: minOrder > 0 ? Number(minOrder) : undefined,
        expiresAt: expiresAt || undefined,
        usageLimit: 1,
        usedCount: 0,
        active: true,
        badgeText: 'Одноразовый',
        isBatch: true,
        batchName: cleanPrefix ? `Пачка ${cleanPrefix} (${count} шт.)` : `Пачка без префикса (${count} шт.)`,
      });
    }
    setIsSaving(true);
    // the codes are listed for the mailing only once the database has them: a code it refused would not work
    const saved = await onUpdatePromos([...codes, ...promos]);
    setIsSaving(false);
    if (saved === false) {
      setSaveError('База не приняла коды. Проверьте соединение и нажмите ещё раз');
      return;
    }
    setShowErrors(false);
    setIsCopied(false);
    setGenerated(codes.map((p) => p.code));
    onShowToast(`Создано ${count} ${pluralRu(count, ['одноразовый код', 'одноразовых кода', 'одноразовых кодов'])}`, 'success');
  };

  const handleCopy = () => {
    copyToClipboard(generated.join('\n'));
    setIsCopied(true);
    onShowToast('Коды скопированы: вставьте их в рассылку', 'success');
  };

  return (
    <div className="space-y-3.5 w-full min-w-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>К списку</span>
        </button>
        <h4 className="text-sm font-extrabold text-[#2D3A4E] truncate">Пачка одноразовых кодов</h4>
      </div>

      <div className="neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3">
        <p className="text-xs text-[#4E5C70]">
          Каждый код можно применить один раз — для рассылки в SMS, Telegram или по почте. Код с лимитом работает только
          у покупателя, вошедшего через Google.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label htmlFor="batch-prefix" className={fieldLabel}>
                Префикс кодов
              </label>
              <AdminHint label="Префикс">Начало каждого кода, например SMS-. Дальше идут 5 случайных символов.</AdminHint>
            </div>
            <input
              id="batch-prefix"
              type="text"
              autoComplete="off"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="SMS-"
              className={`${fieldInput} font-extrabold`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label htmlFor="batch-count" className={fieldLabel}>
                Количество кодов
              </label>
              <AdminHint label="Количество">От 1 до 100 кодов за раз. Они сразу сохраняются и включены.</AdminHint>
            </div>
            <input
              id="batch-count"
              type="number"
              inputMode="numeric"
              min="1"
              max={BATCH_MAX_COUNT}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={`${fieldInput} font-extrabold`}
            />
          </div>
          <div>
            <p id="batch-discount-type-label" className={`${fieldLabel} mb-1`}>
              Тип скидки
            </p>
            <div role="radiogroup" aria-labelledby="batch-discount-type-label" className="flex rounded-xl neu-flat-sm p-1">
              {(
                [
                  { id: 'fixed', label: 'Рубли (₽)', reset: 500 },
                  { id: 'percent', label: 'Процент (%)', reset: 10 },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={discountType === option.id}
                  onClick={() => {
                    if (discountType === option.id) return;
                    setDiscountType(option.id);
                    setDiscountValue(option.reset);
                  }}
                  className={`flex-1 min-h-8 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
                    discountType === option.id ? 'neu-pill-active' : 'text-[#4E5C70]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="batch-discount-value" className={`${fieldLabel} mb-1`}>
              Размер скидки ({discountType === 'fixed' ? '₽' : '%'})
            </label>
            <input
              id="batch-discount-value"
              type="number"
              inputMode="numeric"
              min="1"
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value))}
              className={`${fieldInput} font-extrabold`}
            />
          </div>
          <div>
            <label htmlFor="batch-min-order" className={`${fieldLabel} mb-1`}>
              Мин. сумма чека (₽)
            </label>
            <input
              id="batch-min-order"
              type="number"
              inputMode="numeric"
              min="0"
              value={minOrder}
              onChange={(e) => setMinOrder(Number(e.target.value))}
              className={fieldInput}
            />
          </div>
          <div>
            <label htmlFor="batch-expires-at" className={`${fieldLabel} mb-1`}>
              Действуют до (включительно)
            </label>
            <input
              id="batch-expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-describedby="batch-expires-at-hint"
              className={fieldInput}
            />
            <p id="batch-expires-at-hint" className="text-[11px] text-[#4E5C70] mt-1">
              До конца дня по Москве. Пусто — без срока.
            </p>
          </div>
        </div>

        {errors.length > 0 && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            role="alert"
            className="bg-danger-soft border border-danger/40 rounded-xl p-2.5 text-xs font-bold text-danger space-y-1"
          >
            {errors.map((err) => (
              <p key={err}>{err}</p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isSaving}
          className="neu-button-accent text-white font-extrabold text-xs h-10 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:cursor-wait"
        >
          <Wand2 className="w-4 h-4 text-white" aria-hidden="true" />
          <span>
            {isSaving
              ? 'Создаём коды…'
              : Number.isInteger(count) && count >= 1
                ? `Создать ${count} ${pluralRu(count, ['код', 'кода', 'кодов'])}`
                : 'Создать коды'}
          </span>
        </button>
      </div>

      {generated.length > 0 && (
        <section aria-label="Созданные коды" className="neu-inset rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-extrabold text-[#2D3A4E]">
              Создано {generated.length} {pluralRu(generated.length, ['код', 'кода', 'кодов'])}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3.5 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer"
            >
              {isCopied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              )}
              <span>{isCopied ? 'Скопировано' : `Скопировать коды (${generated.length})`}</span>
            </button>
          </div>
          <ul className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {generated.map((c) => (
              <li key={c} className="font-mono text-[11px] font-bold text-[#2D3A4E] neu-flat-sm px-2 py-1 rounded-lg">
                {c}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[#4E5C70]">
            Потом коды пачки — одной строкой в списке промокодов: там «Скопировать неиспользованные».
          </p>
        </section>
      )}
    </div>
  );
};
