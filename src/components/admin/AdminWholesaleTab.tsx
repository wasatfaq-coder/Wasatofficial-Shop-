import React, { useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { Product, SaveStorefrontSettings, StorefrontSettings } from '../../types';
import {
  MAX_VOLUME_PERCENT,
  MAX_VOLUME_TIERS,
  readVolumeDiscount,
  sellsWholesale,
  volumeDiscountErrors,
  volumeDiscountedPrice,
  type VolumeCountBy,
  type VolumeDiscountKind,
  type VolumeDiscountScale,
} from '../../shared/wholesalePricing';
import { parseDecimal } from '../../utils/currencyPricing';
import { wholeNumber } from '../../utils/wholesaleEditing';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { pluralRu } from '../../utils/pluralize';
import { AdminHint } from './AdminHint';

interface AdminWholesaleTabProps {
  settings: StorefrontSettings;
  onUpdateSettings?: SaveStorefrontSettings;
  /** Admin products (with their cost): who is sold wholesale and whose price the scale would take below the cost */
  products: Product[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

interface TierDraft {
  key: number;
  minPacks: string;
  value: string;
}
interface Draft {
  kind: VolumeDiscountKind;
  countBy: VolumeCountBy;
  tiers: TierDraft[];
}

const rub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const KINDS: { id: VolumeDiscountKind; title: string }[] = [
  { id: 'percent', title: 'В процентах' },
  { id: 'fixed', title: 'Рублей с каждой штуки' },
];
const COUNT_BY: { id: VolumeCountBy; title: string; about: string }[] = [
  { id: 'product', title: 'По каждому товару', about: 'упаковки одного товара: все его цвета и размеры' },
  { id: 'order', title: 'По всему заказу', about: 'все оптовые упаковки заказа вместе' },
];

let nextKey = 1;
const toDraft = (scale: VolumeDiscountScale | undefined): Draft => ({
  kind: scale?.kind ?? 'percent',
  countBy: scale?.countBy ?? 'product',
  tiers: (scale?.tiers ?? []).map((t) => ({ key: nextKey++, minPacks: String(t.minPacks), value: String(t.value).replace('.', ',') })),
});
const fromDraft = (d: Draft): VolumeDiscountScale => ({
  kind: d.kind,
  countBy: d.countBy,
  tiers: d.tiers.map((t) => ({ minPacks: wholeNumber(t.minPacks), value: parseDecimal(t.value) })),
});
const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, tiers: a.tiers.map(({ key: _k, ...t }) => t) }) ===
  JSON.stringify({ ...b, tiers: b.tiers.map(({ key: _k, ...t }) => t) });

/** «от 10 уп. — 5 %» / «от 10 уп. — 30 ₽ с шт.» */
const tierText = (minPacks: number, value: number, kind: VolumeDiscountKind) =>
  `от ${minPacks} уп. — ${kind === 'percent' ? `${value.toLocaleString('ru-RU')} %` : `${rub(value)} с шт.`}`;

/**
 * Admin → «Опт»: the volume discount of wholesale lines (src/shared/wholesalePricing.ts). Steps «from N packs» —
 * a percent of the wholesale price or roubles off each item; packs are counted per product or over the whole order.
 * Promo codes and the shop's discounts never apply to wholesale lines — only this scale. Saved into
 * `settings/storefront.wholesale` after a check; the cart and `placeOrder` count by it.
 */
export const AdminWholesaleTab: React.FC<AdminWholesaleTabProps> = ({ settings, onUpdateSettings, products, onShowToast }) => {
  const saved = readVolumeDiscount(settings.wholesale?.volumeDiscount);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const errorsRef = useRef<HTMLDivElement>(null);

  const current = draft ?? toDraft(saved);
  const dirty = draft !== null && !sameDraft(draft, toDraft(saved));
  useUnsavedChanges(dirty, 'Опт: скидка за объём');
  const scale = fromDraft(current);
  const valid = volumeDiscountErrors(scale).length === 0;

  const edit = (patch: (d: Draft) => Draft) => {
    setDraft(patch(current));
    if (errors.length) setErrors([]);
  };
  const editTier = (key: number, field: 'minPacks' | 'value', value: string) =>
    edit((d) => ({ ...d, tiers: d.tiers.map((t) => (t.key === key ? { ...t, [field]: value } : t)) }));
  const addTier = () =>
    edit((d) => {
      const last = d.tiers.length ? wholeNumber(d.tiers[d.tiers.length - 1].minPacks) : NaN;
      return { ...d, tiers: [...d.tiers, { key: nextKey++, minPacks: Number.isFinite(last) ? String(last * 2) : '10', value: '' }] };
    });
  const removeTier = (key: number) => edit((d) => ({ ...d, tiers: d.tiers.filter((t) => t.key !== key) }));

  const wholesaleProducts = products.filter(sellsWholesale);
  // the deepest step must not sell below the cost: a list, not a ban (the owner may clear old stock on purpose)
  const deepest = valid && scale.tiers.length ? [...scale.tiers].sort((a, b) => a.minPacks - b.minPacks).at(-1)! : null;
  const belowCost = deepest
    ? wholesaleProducts.filter((p) => {
        const price = volumeDiscountedPrice(p.wholesalePrice as number, deepest, scale.kind);
        return price > 0 && typeof p.costPrice === 'number' && p.costPrice > 0 && price < p.costPrice;
      })
    : [];
  // a fixed step larger than a product's wholesale price would give it away: that is never meant, so it is not saved
  const givenAway = deepest
    ? wholesaleProducts.filter((p) => volumeDiscountedPrice(p.wholesalePrice as number, deepest, scale.kind) <= 0)
    : [];
  const sample = wholesaleProducts[0];

  const save = async () => {
    const found = volumeDiscountErrors(scale);
    if (!found.length && givenAway.length) {
      const names = givenAway.slice(0, 3).map((p) => `«${p.title}»`).join(', ');
      found.push(`На последней ступени цена станет 0 ₽: ${names}${givenAway.length > 3 ? ` и ещё ${givenAway.length - 3}` : ''}. Уменьшите скидку`);
    }
    setErrors(found);
    if (found.length) {
      requestAnimationFrame(() => errorsRef.current?.focus());
      return;
    }
    if (!onUpdateSettings) return;
    const sorted = { ...scale, tiers: [...scale.tiers].sort((a, b) => a.minPacks - b.minPacks) };
    const { volumeDiscount: _old, ...restWholesale } = settings.wholesale ?? {};
    setSaving(true);
    const ok = await onUpdateSettings({
      ...settings,
      wholesale: sorted.tiers.length ? { ...restWholesale, volumeDiscount: sorted } : restWholesale,
    });
    setSaving(false);
    if (ok === false) return;
    setDraft(null);
    onShowToast(sorted.tiers.length ? 'Скидка за объём сохранена' : 'Скидка за объём выключена', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="neu-flat rounded-3xl p-4 space-y-2">
        <h3 className="text-base font-extrabold text-[#2D3A4E]">Опт: скидка за объём</h3>
        <p className="text-xs text-[#4E5C70] leading-snug">
          Оптовая цена уже снижена, поэтому промокоды и скидки магазина на оптовые товары не действуют. Действует только эта
          шкала: чем больше упаковок, тем ниже цена штуки. Оптовую цену, упаковку и минимум задаёт форма товара → «Цены» → «Опт»,
          наценку опта для всех товаров — «Курсы и наценка».
        </p>
        <p className="text-xs font-bold text-[#2D3A4E]">
          Оптом продаётся {wholesaleProducts.length} {pluralRu(wholesaleProducts.length, ['товар', 'товара', 'товаров'])}
        </p>
      </div>

      <div className="neu-flat rounded-3xl p-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-extrabold text-[#2D3A4E]">Как задаётся скидка</legend>
          <div role="radiogroup" aria-label="Как задаётся скидка" className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={current.kind === k.id}
                onClick={() => edit((d) => ({ ...d, kind: k.id }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  current.kind === k.id ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                }`}
              >
                {k.title}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="flex items-center gap-1 text-sm font-extrabold text-[#2D3A4E]">
            Как считать упаковки
            <AdminHint label="Как считать упаковки">
              По каждому товару — ступень у каждой модели своя. По всему заказу — все оптовые упаковки складываются.
            </AdminHint>
          </legend>
          <div role="radiogroup" aria-label="Как считать упаковки" className="grid gap-2 sm:grid-cols-2">
            {COUNT_BY.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={current.countBy === c.id}
                onClick={() => edit((d) => ({ ...d, countBy: c.id }))}
                className={`text-left px-3 py-2 rounded-xl cursor-pointer ${
                  current.countBy === c.id ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                }`}
              >
                <span className="block text-xs font-bold">{c.title}</span>
                <span className="block text-[11px] text-[#4E5C70]">{c.about}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-extrabold text-[#2D3A4E]">Ступени</legend>
          {current.tiers.length === 0 ? (
            <p className="text-xs text-[#4E5C70]">Ступеней нет — оптовые товары продаются по оптовой цене без скидки за объём.</p>
          ) : (
            <ul className="space-y-2" aria-label="Ступени скидки">
              {current.tiers.map((t, i) => (
                <li key={t.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="min-w-0">
                    <label htmlFor={`tier-${t.key}-packs`} className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      От упаковок
                    </label>
                    <input
                      id={`tier-${t.key}-packs`}
                      type="text"
                      inputMode="numeric"
                      value={t.minPacks}
                      onChange={(e) => editTier(t.key, 'minPacks', e.target.value)}
                      className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-[#2D3A4E]"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`tier-${t.key}-value`} className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      {current.kind === 'percent' ? 'Скидка, %' : 'Скидка, ₽ с шт.'}
                    </label>
                    <input
                      id={`tier-${t.key}-value`}
                      type="text"
                      inputMode="decimal"
                      value={t.value}
                      onChange={(e) => editTier(t.key, 'value', e.target.value)}
                      placeholder={current.kind === 'percent' ? 'напр. 5' : 'напр. 30'}
                      className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-[#2D3A4E]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(t.key)}
                    aria-label={`Удалить ступень ${i + 1}`}
                    className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-danger cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {current.tiers.length < MAX_VOLUME_TIERS && (
            <button
              type="button"
              onClick={addTier}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl neu-button text-xs font-extrabold text-accent cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Добавить ступень
            </button>
          )}
          {current.kind === 'percent' && (
            <p className="text-[11px] text-[#4E5C70]">Скидка — не больше {MAX_VOLUME_PERCENT} %.</p>
          )}
        </fieldset>

        {valid && sample && scale.tiers.length > 0 && (
          <div className="rounded-2xl p-3 neu-inset space-y-1">
            <p className="text-xs font-bold text-[#2D3A4E]">
              Пример: «{sample.title}», опт {rub(sample.wholesalePrice as number)} за штуку
            </p>
            <ul className="text-xs text-[#4E5C70] space-y-0.5">
              {[...scale.tiers]
                .sort((a, b) => a.minPacks - b.minPacks)
                .map((t) => (
                  <li key={t.minPacks}>
                    {tierText(t.minPacks, t.value, scale.kind)} → {rub(volumeDiscountedPrice(sample.wholesalePrice as number, t, scale.kind))} за штуку
                  </li>
                ))}
            </ul>
          </div>
        )}

        {belowCost.length > 0 && (
          <div role="status" className="rounded-2xl p-3 bg-warning-soft border border-warning/30 text-xs text-[#2D3A4E]">
            <p className="flex items-center gap-1.5 font-bold text-warning">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" /> На последней ступени цена ниже себестоимости:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {belowCost.slice(0, 10).map((p) => (
                <li key={p.id}>
                  {p.title}: {rub(volumeDiscountedPrice(p.wholesalePrice as number, deepest, scale.kind))} при себестоимости{' '}
                  {rub(p.costPrice as number)}
                </li>
              ))}
            </ul>
            {belowCost.length > 10 && <p className="mt-1">и ещё {belowCost.length - 10}</p>}
          </div>
        )}

        {errors.length > 0 && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl p-3 bg-danger-soft border border-danger/30 text-xs text-[#2D3A4E]"
          >
            <p className="flex items-center gap-1.5 font-bold text-danger">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Исправьте, чтобы сохранить:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className={`inline-flex items-center justify-center gap-2 px-5 h-11 rounded-2xl text-sm font-extrabold ${
              saving || !dirty ? 'neu-button-disabled' : 'neu-button-accent cursor-pointer'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
            Сохранить
          </button>
          {!dirty && <span className="text-xs text-[#4E5C70]">{saved ? 'Сохранено' : 'Скидка за объём не задана'}</span>}
        </div>
      </div>
    </div>
  );
};
