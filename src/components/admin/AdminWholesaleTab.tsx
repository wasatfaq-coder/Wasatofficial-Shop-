import React, { useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Trash2, Download, FileText } from 'lucide-react';
import { withWholesaleSettingsChange } from '../../utils/priceHistory';
import type { Product, SaveStorefrontSettings, StorefrontSettings } from '../../types';
import {
  brokenPackDiscountErrors,
  brokenPackDiscountedPrice,
  brokenPackRawPrice,
  hasWholesalePrice,
  MAX_MIN_WHOLESALE_AMOUNT,
  MAX_VOLUME_PERCENT,
  MAX_VOLUME_TIERS,
  readBrokenPackDiscount,
  readMinWholesaleAmount,
  readVolumeDiscount,
  saleChannelOf,
  sellsWholesale,
  volumeDiscountErrors,
  volumeDiscountedPrice,
  volumeStepPrice,
  type BrokenPackDiscount,
  type VolumeCountBy,
  type VolumeDiscountKind,
  type VolumeDiscountScale,
} from '../../shared/wholesalePricing';
import { parseDecimal } from '../../utils/currencyPricing';
import { wholeNumber } from '../../utils/wholesaleEditing';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { pluralRu } from '../../utils/pluralize';
import { exportWholesalePriceListCSV, generateWholesalePriceListPDF } from '../../utils/wholesalePriceList';
import { preloadPdfLibraries } from '../../utils/pdfExport';
import { AdminHint } from './AdminHint';
import { AdminExample } from './AdminExample';

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
  minOrderAmount: string;
  brokenKind: VolumeDiscountKind;
  brokenValue: string;
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
const toDraft = (
  scale: VolumeDiscountScale | undefined,
  minOrderAmount: number | undefined,
  broken: BrokenPackDiscount | undefined
): Draft => ({
  kind: scale?.kind ?? 'percent',
  countBy: scale?.countBy ?? 'product',
  tiers: (scale?.tiers ?? []).map((t) => ({ key: nextKey++, minPacks: String(t.minPacks), value: String(t.value).replace('.', ',') })),
  minOrderAmount: minOrderAmount ? String(minOrderAmount) : '',
  brokenKind: broken?.kind ?? 'percent',
  brokenValue: broken ? String(broken.value).replace('.', ',') : '',
});
const fromDraft = (d: Draft): VolumeDiscountScale => ({
  kind: d.kind,
  countBy: d.countBy,
  tiers: d.tiers.map((t) => ({ minPacks: wholeNumber(t.minPacks), value: parseDecimal(t.value) })),
});
const brokenFromDraft = (d: Draft): BrokenPackDiscount | undefined => {
  const raw = d.brokenValue.trim();
  if (raw === '' || raw === '0') return undefined;
  return { kind: d.brokenKind, value: parseDecimal(raw) };
};
const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({
    ...a,
    minOrderAmount: a.minOrderAmount.trim(),
    brokenValue: a.brokenValue.trim(),
    tiers: a.tiers.map(({ key: _k, ...t }) => t),
  }) ===
  JSON.stringify({
    ...b,
    minOrderAmount: b.minOrderAmount.trim(),
    brokenValue: b.brokenValue.trim(),
    tiers: b.tiers.map(({ key: _k, ...t }) => t),
  });

/** «от 10 уп. — 5 %» / «от 10 уп. — 30 ₽ с шт.» */
const tierText = (minPacks: number, value: number, kind: VolumeDiscountKind) =>
  `от ${minPacks} уп. — ${kind === 'percent' ? `${value.toLocaleString('ru-RU')} %` : `${rub(value)} с шт.`}`;

/**
 * Admin → «Опт»: the volume discount of wholesale lines and the discount on broken size packs (src/shared/wholesalePricing.ts).
 */
export const AdminWholesaleTab: React.FC<AdminWholesaleTabProps> = ({ settings, onUpdateSettings, products, onShowToast }) => {
  const saved = readVolumeDiscount(settings.wholesale?.volumeDiscount);
  const savedMinAmount = readMinWholesaleAmount(settings.wholesale);
  const savedBroken = readBrokenPackDiscount(settings);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const errorsRef = useRef<HTMLDivElement>(null);

  const savedDraft = toDraft(saved, savedMinAmount, savedBroken);
  const current = draft ?? savedDraft;
  const dirty = draft !== null && !sameDraft(draft, savedDraft);
  useUnsavedChanges(dirty, 'Опт: скидка за объём');
  const scale = fromDraft(current);
  const brokenDraft = brokenFromDraft(current);
  const rawMin = current.minOrderAmount.trim();
  const parsedMin = rawMin === '' || rawMin === '0' ? undefined : wholeNumber(rawMin);
  const minValid = parsedMin === undefined || (Number.isInteger(parsedMin) && parsedMin >= 1 && parsedMin <= MAX_MIN_WHOLESALE_AMOUNT);
  const brokenErrs = brokenPackDiscountErrors(brokenDraft);
  const valid = volumeDiscountErrors(scale).length === 0 && minValid && brokenErrs.length === 0;

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
  const bothChannelProducts = products.filter((p) => saleChannelOf(p) === 'both' && hasWholesalePrice(p));
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
    ? wholesaleProducts.filter((p) => volumeStepPrice(p.wholesalePrice as number, deepest, scale.kind) <= 0)
    : [];

  // Stage 14 (owner's decision 12.10): broken pack discount CANNOT drop the price below costPrice or to 0 ₽ — blocks saving!
  const brokenBelowCost =
    brokenDraft && brokenErrs.length === 0
      ? bothChannelProducts.filter((p) => {
          const price = brokenPackDiscountedPrice(p.wholesalePrice as number, brokenDraft);
          return typeof p.costPrice === 'number' && p.costPrice > 0 && price < p.costPrice;
        })
      : [];
  const brokenGivenAway =
    brokenDraft && brokenErrs.length === 0
      ? bothChannelProducts.filter((p) => brokenPackRawPrice(p.wholesalePrice as number, brokenDraft) <= 0)
      : [];

  const sample = wholesaleProducts[0];
  const brokenSample = bothChannelProducts[0];

  const save = async () => {
    const found = [...volumeDiscountErrors(scale), ...brokenErrs];
    if (!minValid) {
      found.push(`Минимальная сумма оптового заказа — целое число рублей от 1 до ${MAX_MIN_WHOLESALE_AMOUNT.toLocaleString('ru-RU')} (или оставьте пустым)`);
    }
    if (!found.length && givenAway.length) {
      const names = givenAway.slice(0, 3).map((p) => `«${p.title}»`).join(', ');
      found.push(`На последней ступени цена станет 0 ₽: ${names}${givenAway.length > 3 ? ` и ещё ${givenAway.length - 3}` : ''}. Уменьшите скидку`);
    }
    if (!found.length && brokenGivenAway.length) {
      const names = brokenGivenAway.slice(0, 3).map((p) => `«${p.title}»`).join(', ');
      found.push(`Скидка на разбитую упаковку делает цену 0 ₽: ${names}${brokenGivenAway.length > 3 ? ` и ещё ${brokenGivenAway.length - 3}` : ''}. Уменьшите скидку`);
    }
    if (!found.length && brokenBelowCost.length) {
      const details = brokenBelowCost
        .slice(0, 3)
        .map(
          (p) =>
            `«${p.title}» (${rub(brokenPackDiscountedPrice(p.wholesalePrice as number, brokenDraft))} < себестоимости ${rub(p.costPrice as number)})`
        )
        .join(', ');
      found.push(
        `Цена разбитой упаковки ниже себестоимости: ${details}${
          brokenBelowCost.length > 3 ? ` и ещё ${brokenBelowCost.length - 3}` : ''
        }. Уменьшите скидку на разбитую упаковку`
      );
    }
    setErrors(found);
    if (found.length) {
      requestAnimationFrame(() => errorsRef.current?.focus());
      return;
    }
    if (!onUpdateSettings) return;
    const sorted = { ...scale, tiers: [...scale.tiers].sort((a, b) => a.minPacks - b.minPacks) };
    const { volumeDiscount: _old, minOrderAmount: _oldMin, brokenPackDiscount: _oldBroken, ...restWholesale } = settings.wholesale ?? {};
    const { brokenPackDiscount: _topBroken, ...restSettings } = settings;
    // the discounts it had end now: unpaid orders are checked by the discounts of their time (audit 29.10, finding 16)
    const wholesaleHistory = withWholesaleSettingsChange(
      settings.wholesaleHistory,
      { volumeDiscount: settings.wholesale?.volumeDiscount, brokenPackDiscount: settings.brokenPackDiscount ?? settings.wholesale?.brokenPackDiscount },
      { volumeDiscount: sorted.tiers.length ? sorted : undefined, brokenPackDiscount: brokenDraft ?? undefined }
    );
    setSaving(true);
    const ok = await onUpdateSettings({
      ...restSettings,
      ...(wholesaleHistory ? { wholesaleHistory } : {}),
      ...(brokenDraft ? { brokenPackDiscount: brokenDraft } : {}),
      wholesale: {
        ...restWholesale,
        ...(sorted.tiers.length ? { volumeDiscount: sorted } : {}),
        ...(parsedMin !== undefined ? { minOrderAmount: parsedMin } : {}),
        ...(brokenDraft ? { brokenPackDiscount: brokenDraft } : {}),
      },
    });
    setSaving(false);
    if (ok === false) return;
    setDraft(null);
    onShowToast(
      sorted.tiers.length || parsedMin !== undefined || brokenDraft ? 'Настройки опта сохранены' : 'Скидки опта выключены',
      'success'
    );
  };

  return (
    <div className="space-y-4">
      <div className="neu-flat rounded-3xl p-4 space-y-2">
        <h3 className="text-base font-extrabold text-text-primary">Опт: скидка за объём</h3>
        <p className="text-xs text-text-secondary leading-snug">
          Оптовая цена уже снижена, поэтому промокоды и скидки магазина на оптовые товары не действуют. Действует только эта
          шкала: чем больше упаковок, тем ниже цена штуки. Оптовую цену, упаковку и минимум задаёт форма товара → «Цены» → «Опт»,
          наценку опта для всех товаров — «Курсы и наценка».
        </p>
        <p className="text-xs font-bold text-text-primary">
          Оптом продаётся {wholesaleProducts.length} {pluralRu(wholesaleProducts.length, ['товар', 'товара', 'товаров'])}
        </p>
        {wholesaleProducts.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = exportWholesalePriceListCSV(products, settings.wholesale, settings.storeName);
                onShowToast(
                  ok ? 'Оптовый прайс-лист (CSV) скачан' : 'Нет открытых оптовых товаров для прайс-листа',
                  ok ? 'success' : 'info'
                );
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl neu-button text-xs font-extrabold text-text-primary hover:text-accent cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              <span>Скачать прайс CSV</span>
            </button>
            <button
              type="button"
              disabled={exportingPdf}
              onMouseEnter={preloadPdfLibraries}
              onFocus={preloadPdfLibraries}
              onClick={async () => {
                setExportingPdf(true);
                try {
                  const ok = await generateWholesalePriceListPDF(products, settings.wholesale, settings);
                  onShowToast(
                    ok ? 'Оптовый прайс-лист (PDF с фото и ростовками) скачан' : 'Нет открытых оптовых товаров для прайс-листа',
                    ok ? 'success' : 'info'
                  );
                } catch {
                  onShowToast('Не удалось сформировать PDF прайс-лист', 'error');
                } finally {
                  setExportingPdf(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-extrabold ${
                exportingPdf ? 'neu-button-disabled' : 'neu-button text-text-primary hover:text-accent cursor-pointer'
              }`}
            >
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden="true" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              )}
              <span>{exportingPdf ? 'Формируем PDF…' : 'Скачать прайс PDF с фото'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="neu-flat rounded-3xl p-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="wholesale-min-order-amount" className="flex items-center gap-1 text-sm font-extrabold text-text-primary">
            Минимальная сумма оптового заказа, ₽
            <AdminHint label="Минимальная сумма оптового заказа">
              Общая сумма оптовых строк и ростовок в корзине, меньше которой оптовый заказ не оформляется. Пусто или 0 — без минимальной суммы.
            </AdminHint>
          </label>
          <input
            id="wholesale-min-order-amount"
            type="text"
            inputMode="numeric"
            value={current.minOrderAmount}
            onChange={(e) => edit((d) => ({ ...d, minOrderAmount: e.target.value }))}
            placeholder="Без минимума (например: 15000)"
            className="w-full sm:max-w-xs h-10 px-3 neu-inset rounded-xl text-sm font-bold text-text-primary"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-extrabold text-text-primary">Как задаётся скидка</legend>
          <div role="radiogroup" aria-label="Как задаётся скидка" className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={current.kind === k.id}
                onClick={() => edit((d) => ({ ...d, kind: k.id }))}
                className={`px-3 py-1.5 min-h-8 rounded-xl text-xs font-bold cursor-pointer ${
                  current.kind === k.id ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'
                }`}
              >
                {k.title}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="flex items-center gap-1 text-sm font-extrabold text-text-primary">
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
                  current.countBy === c.id ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'
                }`}
              >
                <span className="block text-xs font-bold">{c.title}</span>
                <span className="block text-[11px] text-text-secondary">{c.about}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-extrabold text-text-primary">Ступени</legend>
          {current.tiers.length === 0 ? (
            <p className="text-xs text-text-secondary">Ступеней нет — оптовые товары продаются по оптовой цене без скидки за объём.</p>
          ) : (
            <ul className="space-y-2" aria-label="Ступени скидки">
              {current.tiers.map((t, i) => (
                <li key={t.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="min-w-0">
                    <label htmlFor={`tier-${t.key}-packs`} className="text-[11px] font-bold text-text-secondary block mb-1">
                      От упаковок
                    </label>
                    <input
                      id={`tier-${t.key}-packs`}
                      type="text"
                      inputMode="numeric"
                      value={t.minPacks}
                      onChange={(e) => editTier(t.key, 'minPacks', e.target.value)}
                      className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-text-primary"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`tier-${t.key}-value`} className="text-[11px] font-bold text-text-secondary block mb-1">
                      {current.kind === 'percent' ? 'Скидка, %' : 'Скидка, ₽ с шт.'}
                    </label>
                    <input
                      id={`tier-${t.key}-value`}
                      type="text"
                      inputMode="decimal"
                      value={t.value}
                      onChange={(e) => editTier(t.key, 'value', e.target.value)}
                      placeholder={current.kind === 'percent' ? 'напр. 5' : 'напр. 30'}
                      className="w-full h-10 px-3 neu-inset rounded-xl text-sm font-bold text-text-primary"
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
            <p className="text-[11px] text-text-secondary">Скидка — не больше {MAX_VOLUME_PERCENT} %.</p>
          )}
        </fieldset>

        {valid && sample && scale.tiers.length > 0 && (
          <AdminExample
            title={sample.title}
            lines={[
              `опт ${rub(sample.wholesalePrice as number)} за штуку`,
              ...[...scale.tiers]
                .sort((a, b) => a.minPacks - b.minPacks)
                .map(
                  (t) =>
                    `${tierText(t.minPacks, t.value, scale.kind)} → ${rub(volumeDiscountedPrice(sample.wholesalePrice as number, t, scale.kind))} за штуку`,
                ),
            ]}
          />
        )}

        {belowCost.length > 0 && (
          <div role="status" className="rounded-2xl p-3 neu-tone-warning text-xs text-text-primary">
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

        <div className="pt-3 neu-divider-t space-y-3">
          <div className="space-y-1">
            <h4 className="flex items-center gap-1 text-sm font-extrabold text-text-primary">
              Скидка на разбитую упаковку
              <AdminHint label="Скидка на разбитую упаковку">
                Если у товара «И опт, и розница» не хватает размера до целой ростовки, оставшиеся штуки продаются со скидкой от оптовой цены.
              </AdminHint>
            </h4>
            <p className="text-xs text-text-secondary leading-snug">
              Скидка от оптовой цены за штуку для товаров «И опт, и розница», когда на складе не хватает хотя бы одного размера до целой ростовки. Пусто или 0 — без дополнительной скидки (по обычной оптовой цене).
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-text-secondary">Способ скидки на разбитую упаковку</legend>
            <div role="radiogroup" aria-label="Способ скидки на разбитую упаковку" className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={current.brokenKind === k.id}
                  onClick={() => edit((d) => ({ ...d, brokenKind: k.id }))}
                  className={`px-3 py-1.5 min-h-8 rounded-xl text-xs font-bold cursor-pointer ${
                    current.brokenKind === k.id ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'
                  }`}
                >
                  {k.title}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="broken-pack-discount-value" className="text-xs font-bold text-text-secondary block">
              {current.brokenKind === 'percent' ? 'Скидка от оптовой цены, %' : 'Скидка от оптовой цены, ₽ с шт.'}
            </label>
            <input
              id="broken-pack-discount-value"
              type="text"
              inputMode="decimal"
              value={current.brokenValue}
              onChange={(e) => edit((d) => ({ ...d, brokenValue: e.target.value }))}
              placeholder={current.brokenKind === 'percent' ? 'напр. 10 (пусто — без скидки)' : 'напр. 100 (пусто — без скидки)'}
              className="w-full sm:max-w-xs h-10 px-3 neu-inset rounded-xl text-sm font-bold text-text-primary"
            />
          </div>

          {brokenDraft && brokenErrs.length === 0 && brokenSample && (
            <AdminExample
              title={`${brokenSample.title} (разбитая упаковка)`}
              lines={[
                `опт ${rub(brokenSample.wholesalePrice as number)} за штуку`,
                `разбитая упаковка (−${brokenDraft.kind === 'percent' ? `${brokenDraft.value} %` : rub(brokenDraft.value)}) → ${rub(
                  brokenPackDiscountedPrice(brokenSample.wholesalePrice as number, brokenDraft)
                )} за штуку${
                  typeof brokenSample.costPrice === 'number' && brokenSample.costPrice > 0
                    ? ` (себестоимость ${rub(brokenSample.costPrice)})`
                    : ''
                }`,
              ]}
            />
          )}

          {brokenBelowCost.length > 0 && (
            <div role="alert" className="rounded-2xl p-3 neu-tone-danger text-xs text-text-primary">
              <p className="flex items-center gap-1.5 font-bold text-danger">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Разбитая упаковка дешевле себестоимости (сохранение заблокировано):
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {brokenBelowCost.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    {p.title}: {rub(brokenPackDiscountedPrice(p.wholesalePrice as number, brokenDraft))} при себестоимости{' '}
                    {rub(p.costPrice as number)}
                  </li>
                ))}
              </ul>
              {brokenBelowCost.length > 10 && <p className="mt-1">и ещё {brokenBelowCost.length - 10}</p>}
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl p-3 neu-tone-danger text-xs text-text-primary"
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
          {!dirty && (
            <span className="text-xs text-text-secondary">
              {saved || savedMinAmount || savedBroken ? 'Сохранено' : 'Скидки опта не заданы'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
