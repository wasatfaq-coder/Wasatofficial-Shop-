import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Coins, Landmark, Loader2 } from 'lucide-react';
import type { Product } from '../../types';
import {
  EMPTY_EXCHANGE_RATES,
  PRICE_ROUNDING_RUB,
  PURCHASE_CURRENCIES,
  exchangeRateErrors,
  parseDecimal as num,
  productsInCurrency,
  repriceProducts,
  workingRate,
  type CurrencyRate,
  type ExchangeRates,
  type PurchaseCurrency,
} from '../../utils/currencyPricing';
import { cbrDateLabel, fetchCbrRates } from '../../utils/cbrRates';
import { subscribeToExchangeRates } from '../../utils/firebaseSync';
import { isBrowserOffline } from '../../utils/network';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { pluralRu } from '../../utils/pluralize';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminRatesTabProps {
  /** Products with their cost and purchase (admin products) */
  products: Product[];
  /** Saves the rates and the recalculated products together; false — not saved (the toast is shown) */
  onApply?: (rates: ExchangeRates, repriced: Product[]) => Promise<boolean>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** What the owner types: strings, so a field can be empty or take a comma */
interface RateDraft {
  official: string;
  markup: string;
  markupKind: CurrencyRate['markupKind'];
}
interface Draft {
  usd: RateDraft;
  cny: RateDraft;
  markupPercent: string;
}

const key = (c: PurchaseCurrency) => (c === 'USD' ? 'usd' : 'cny');
const text = (n: number) => (n ? String(n).replace('.', ',') : '');
const toDraft = (r: ExchangeRates): Draft => ({
  usd: { official: text(r.usd.official), markup: text(r.usd.markup), markupKind: r.usd.markupKind },
  cny: { official: text(r.cny.official), markup: text(r.cny.markup), markupKind: r.cny.markupKind },
  markupPercent: text(r.markupPercent),
});
const fromDraft = (d: Draft): ExchangeRates => {
  const rate = (r: RateDraft): CurrencyRate => ({
    official: num(r.official),
    markup: r.markup.trim() === '' ? 0 : num(r.markup),
    markupKind: r.markupKind,
  });
  return { usd: rate(d.usd), cny: rate(d.cny), markupPercent: d.markupPercent.trim() === '' ? 0 : num(d.markupPercent) };
};

const rub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Admin → «Курсы и наценка»: one rate and one markup for every product bought in dollars or yuan. Working rate =
 * the central bank's rate + the owner's addition (roubles or percent); «Применить» recalculates the price and the cost of
 * all such products at once, after a preview «было → станет» and a confirmation (src/utils/currencyPricing.ts).
 */
export const AdminRatesTab: React.FC<AdminRatesTabProps> = ({ products, onApply, onShowToast }) => {
  const [saved, setSaved] = useState<ExchangeRates | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cbrLoading, setCbrLoading] = useState(false);
  const [cbrNote, setCbrNote] = useState<{ ok: boolean; text: string } | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeToExchangeRates(
        (rates) => {
          setSaved(rates);
          setLoadFailed(false);
        },
        () => setLoadFailed(true)
      ),
    []
  );

  const current = draft ?? toDraft(saved ?? EMPTY_EXCHANGE_RATES);
  const rates = fromDraft(current);
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  useUnsavedChanges(dirty, 'Курсы и наценка');

  const ready = exchangeRateErrors(rates).length === 0;
  const changes = ready ? repriceProducts(products, rates) : [];
  const inCurrency = PURCHASE_CURRENCIES.reduce((sum, c) => sum + productsInCurrency(products, c.id), 0);

  const edit = (patch: (d: Draft) => Draft) => {
    setDraft(patch(current));
    if (errors.length) setErrors([]);
    // the note names the rates it put in: after the owner's own edit it would no longer match the fields
    setCbrNote(null);
  };
  const editRate = (c: PurchaseCurrency, field: keyof RateDraft, value: string) =>
    edit((d) => ({ ...d, [key(c)]: { ...d[key(c)], [field]: value } }));

  /** Fills only the official rates; the owner's additions stay, prices change after «Применить» */
  const fillFromCbr = async () => {
    if (isBrowserOffline()) {
      setCbrNote({ ok: false, text: 'Нет соединения. Проверьте интернет или введите курс вручную.' });
      return;
    }
    setCbrLoading(true);
    setCbrNote(null);
    try {
      const cbr = await fetchCbrRates();
      // functional update: the owner may have typed while the rates were loading
      setDraft((prev) => {
        const d = prev ?? toDraft(saved ?? EMPTY_EXCHANGE_RATES);
        return { ...d, usd: { ...d.usd, official: text(cbr.usd) }, cny: { ...d.cny, official: text(cbr.cny) } };
      });
      setErrors([]);
      setCbrNote({
        ok: true,
        text: `Подставлен курс ЦБ на ${cbrDateLabel(cbr.date)}: $1 = ${rub(cbr.usd)}, ¥1 = ${rub(cbr.cny)}. Цены изменятся после «Применить».`,
      });
    } catch (error) {
      console.warn('CBR rates were not loaded', error);
      setCbrNote({ ok: false, text: 'Не удалось получить курс ЦБ. Попробуйте позже или введите курс вручную.' });
    } finally {
      setCbrLoading(false);
    }
  };

  const requestApply = () => {
    const found = exchangeRateErrors(rates);
    setErrors(found);
    if (found.length) {
      requestAnimationFrame(() => errorsRef.current?.focus());
      return;
    }
    setConfirmOpen(true);
  };

  const apply = async () => {
    setConfirmOpen(false);
    if (!onApply) return;
    setSaving(true);
    const repriced = changes.map((c) => ({
      ...c.product,
      price: c.after.price,
      costPrice: c.after.costPrice,
      originalPrice: c.after.originalPrice ?? undefined,
      discountPercent: c.discountPercent || undefined,
    }));
    const ok = await onApply({ ...rates, appliedAt: new Date().toISOString() }, repriced);
    setSaving(false);
    if (!ok) return;
    setDraft(null);
    setCbrNote(null);
    onShowToast(
      repriced.length
        ? `Курсы применены: ${pluralRu(repriced.length, ['цена обновлена у', 'цены обновлены у', 'цены обновлены у'])} ${repriced.length} ${pluralRu(repriced.length, ['товара', 'товаров', 'товаров'])}`
        : 'Курсы сохранены: цены товаров уже такие',
      'success'
    );
  };

  if (saved === null) {
    return (
      <div className="neu-flat rounded-3xl p-4">
        {loadFailed ? (
          <p role="alert" className="text-xs text-danger font-bold">
            Не удалось загрузить курсы. Обновите страницу.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-[#4E5C70]" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Загрузка…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="neu-flat rounded-3xl p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
            <Coins className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-[#2D3A4E]">Курсы и наценка</h3>
            <p className="text-xs text-[#4E5C70] leading-snug mt-0.5">
              Цены товаров, закупленных в долларах или юанях, считаются от рабочего курса: курс ЦБ плюс ваша надбавка.
              «Применить» пересчитывает цену и себестоимость всех таких товаров сразу, цена округляется вверх до{' '}
              {PRICE_ROUNDING_RUB} ₽. Закупку в $ или ¥ задают в форме товара, в блоке цен.
            </p>
          </div>
        </div>
        <p className="text-xs text-[#4E5C70]">
          {saved.appliedAt ? `Последний раз применено ${formatDate(saved.appliedAt)}` : 'Курсы ещё не применялись'}
          {dirty && <span className="ml-2 font-bold text-warning">есть неприменённые изменения</span>}
        </p>
        <button
          type="button"
          onClick={fillFromCbr}
          disabled={cbrLoading}
          className={`inline-flex items-center gap-2 px-4 h-10 rounded-2xl text-xs font-bold ${
            cbrLoading ? 'neu-button-disabled' : 'neu-button text-[#2D3A4E] hover:text-accent cursor-pointer'
          }`}
        >
          {cbrLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Landmark className="w-4 h-4" aria-hidden="true" />
          )}
          Подставить курс ЦБ
        </button>
        <p role="status" className="text-xs text-[#4E5C70]">
          {cbrNote?.ok && cbrNote.text}
        </p>
        {cbrNote && !cbrNote.ok && (
          <p role="alert" className="text-xs font-bold text-danger">
            {cbrNote.text}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PURCHASE_CURRENCIES.map(({ id, sign, title }) => {
          const r = current[key(id)];
          const working = workingRate(rates[key(id)]);
          const count = productsInCurrency(products, id);
          const base = `rate-${key(id)}`;
          return (
            <fieldset key={id} className="neu-flat rounded-3xl p-4 space-y-3 min-w-0">
              <legend className="sr-only">{title}</legend>
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-extrabold text-[#2D3A4E]">
                  {title}, {sign}
                </h4>
                <span className="text-[11px] text-[#4E5C70]">
                  {count} {pluralRu(count, ['товар', 'товара', 'товаров'])} в {id === 'USD' ? 'долларах' : 'юанях'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor={`${base}-official`} className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Курс ЦБ, ₽ за {sign}1
                  </label>
                  <input
                    id={`${base}-official`}
                    type="text"
                    inputMode="decimal"
                    value={r.official}
                    onChange={(e) => editRate(id, 'official', e.target.value)}
                    placeholder={id === 'USD' ? 'напр. 85' : 'напр. 11,7'}
                    className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-[#2D3A4E]"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${base}-markup`} className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Надбавка, {r.markupKind === 'percent' ? '%' : '₽'}
                  </label>
                  <input
                    id={`${base}-markup`}
                    type="text"
                    inputMode="decimal"
                    value={r.markup}
                    onChange={(e) => editRate(id, 'markup', e.target.value)}
                    placeholder="0"
                    className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-[#2D3A4E]"
                  />
                </div>
              </div>
              <div role="radiogroup" aria-label={`Надбавка к курсу: ${title.toLowerCase()}`} className="flex gap-2">
                {(['rub', 'percent'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={r.markupKind === kind}
                    onClick={() => editRate(id, 'markupKind', kind)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      r.markupKind === kind ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                    }`}
                  >
                    {kind === 'rub' ? 'В рублях' : 'В процентах'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#4E5C70]">Надбавка — запас на реальный курс закупки, он обычно выше курса ЦБ.</p>
              <p className="text-sm font-extrabold text-accent" aria-live="polite">
                {working !== null ? `Рабочий курс: ${rub(working)} за ${sign}1` : 'Рабочий курс: укажите курс ЦБ'}
              </p>
            </fieldset>
          );
        })}
      </div>

      <div className="neu-flat rounded-3xl p-4 space-y-2">
        <label htmlFor="rate-markup-percent" className="text-sm font-extrabold text-[#2D3A4E] block">
          Наценка для всех товаров, %
        </label>
        <input
          id="rate-markup-percent"
          type="text"
          inputMode="decimal"
          value={current.markupPercent}
          onChange={(e) => edit((d) => ({ ...d, markupPercent: e.target.value }))}
          placeholder="напр. 180"
          className="w-full max-w-xs h-10 px-3 neu-inset rounded-xl text-sm font-bold text-[#2D3A4E]"
        />
        <p className="text-xs text-[#4E5C70]">
          Цена = закупка × рабочий курс + наценка. Товар со своей наценкой в форме товара считается по своей.
        </p>
      </div>

      <div className="neu-flat rounded-3xl p-4 space-y-3">
        <h4 className="text-sm font-extrabold text-[#2D3A4E]">Что изменится</h4>
        {inCurrency === 0 ? (
          <p className="text-xs text-[#4E5C70]">
            Пока нет товаров с закупкой в долларах или юанях: откройте товар и укажите закупку в $ или ¥ в блоке цен. Остальные
            товары курсы не меняют.
          </p>
        ) : !ready ? (
          <p className="text-xs text-[#4E5C70]">Укажите курсы ЦБ — здесь появятся новые цены.</p>
        ) : changes.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs font-bold text-success">
            <Check className="w-4 h-4" aria-hidden="true" /> Цены всех {inCurrency} {pluralRu(inCurrency, ['товара', 'товаров', 'товаров'])} уже такие
          </p>
        ) : (
          <>
            <p className="text-xs text-[#4E5C70]">
              Изменится цена у {changes.length} {pluralRu(changes.length, ['товара', 'товаров', 'товаров'])} из {inCurrency}. Товары без
              закупки в валюте не меняются.
            </p>
            <ul className="divide-y divide-[#C9D2DD]" aria-label="Новые цены">
              {changes.map((c) => {
                const sign = PURCHASE_CURRENCIES.find((x) => x.id === c.currency)?.sign;
                const up = c.after.price > c.before.price;
                return (
                  <li key={c.product.id} className="py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#2D3A4E] truncate">{c.product.title}</p>
                      <p className="text-[11px] text-[#4E5C70]">
                        закупка {sign}
                        {c.product.purchase?.amount.toLocaleString('ru-RU')} → себестоимость {rub(c.after.costPrice)}
                      </p>
                      {c.after.originalPrice !== null ? (
                        <p className="text-[11px] text-[#4E5C70]">
                          скидка {c.discountPercent} % сохраняется: старая цена {rub(c.after.originalPrice)}
                        </p>
                      ) : (
                        typeof c.before.originalPrice === 'number' && (
                          <p className="text-[11px] font-bold text-warning">Старая цена не выше новой — она убирается</p>
                        )
                      )}
                    </div>
                    <p className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
                      <span className="text-[#4E5C70]">{rub(c.before.price)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#4E5C70]" aria-label="станет" />
                      <span className={up ? 'text-danger' : 'text-success'}>{rub(c.after.price)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {errors.length > 0 && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl p-3 bg-danger-soft border border-danger/30 text-xs text-[#2D3A4E]"
          >
            <p className="flex items-center gap-1.5 font-bold text-danger">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Исправьте, чтобы применить:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={requestApply}
          disabled={saving}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-11 rounded-2xl text-sm font-extrabold ${
            saving ? 'neu-button-disabled' : 'neu-button-accent cursor-pointer'
          }`}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          Применить
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Применить курсы?"
        message={
          changes.length
            ? `Цены ${changes.length} ${pluralRu(changes.length, ['товара', 'товаров', 'товаров'])} изменятся у покупателей сразу. Заказы, уже оформленные, не меняются.`
            : 'Курсы и наценка сохранятся. Цены товаров сейчас не меняются.'
        }
        confirmLabel="Применить"
        confirmIcon={<Check className="w-4 h-4" aria-hidden="true" />}
        tone="neutral"
        onConfirm={apply}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
};
