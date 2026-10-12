import { Boxes, Plus, Trash2 } from 'lucide-react';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import { parseDecimal } from '../../../utils/currencyPricing';
import {
  SIZE_PACKS_MAX,
  SIZE_PACK_PRICE_MAX,
  SIZE_PACK_TITLE_MAX,
  productColorNames,
  sameColor,
  sizePackCompositionText,
  sizePackPieces,
  sizePackPrice,
  sizePackTitle,
} from '../../../shared/sizePacks';
import { newPackDraft, packDraftColors, packDraftLabel, packFromDraft, type SizePackDraft } from '../../../utils/sizePackEditing';
import { AdminHint } from '../AdminHint';
import type { ProductForm } from './useProductForm';

const FIELD_CLASS = 'w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]';
const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/**
 * «Ростовки» of the product form (stage 18 of docs/admin-wholesale-plan.md, owner's decision 11.10): a size pack is an
 * package of one colour made of several sizes, «48 ×1 · 50 ×2 · 52 ×1», with its own price and a barcode per colour. It is
 * apart from the wholesale pack of one variation (`wholesalePackSize`). The rows are drafts (src/utils/sizePackEditing.ts):
 * the check runs on «Сохранить» with the rest of the form; the customer does not see packs yet.
 */
export function ProductFormSizePacks({ form }: { form: ProductForm }) {
  const { formPacks, setFormPacks, formSizes, formColors, formSaleChannel, formWholesalePrice, setPendingRemoval } = form;
  const colorNames = productColorNames({ colors: formColors });
  // the wholesale price the product is saved with: «Только в розницу» drops it
  const wholesale = parseDecimal(formWholesalePrice);
  const wholesalePrice = formSaleChannel !== 'retail' && wholesale > 0 ? Math.round(wholesale) : undefined;

  const canAdd = formSizes.length > 0 && colorNames.length > 0 && formPacks.length < SIZE_PACKS_MAX;
  const addNote =
    formSizes.length === 0 || colorNames.length === 0
      ? 'Сначала добавьте размеры и цвета товара — ростовка собирается из них.'
      : formPacks.length >= SIZE_PACKS_MAX
      ? `У товара не больше ${SIZE_PACKS_MAX} ростовок.`
      : '';

  const update = (id: string, patch: Partial<SizePackDraft>) =>
    setFormPacks((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));

  const toggleColor = (draft: SizePackDraft, color: string) =>
    update(draft.id, {
      colors: draft.colors.some((c) => sameColor(c, color))
        ? draft.colors.filter((c) => !sameColor(c, color))
        : [...draft.colors, color],
    });

  const removePack = (draft: SizePackDraft, index: number) => {
    const pack = packFromDraft(draft, formSizes, formColors);
    setPendingRemoval({
      title: 'Удалить ростовку?',
      message: 'Ростовка и её штрихкоды исчезнут после сохранения товара. Остатки вариантов не меняются.',
      preview: (
        <>
          <span className="w-8 h-8 rounded-xl neu-flat flex items-center justify-center text-accent shrink-0">
            <Boxes className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-xs text-[#2D3A4E] break-words">
              {pack.sizes.length > 0 ? sizePackTitle(pack) : packDraftLabel(draft, index)}
            </p>
            {pack.sizes.length > 0 && <p className="text-[11px] text-[#4E5C70]">{sizePackCompositionText(pack)}</p>}
          </div>
        </>
      ),
      confirmLabel: 'Удалить ростовку',
      run: () => setFormPacks((prev) => prev.filter((d) => d.id !== draft.id)),
    });
  };

  return (
    <section aria-labelledby="product-form-size-packs" className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#BAC5D5]/30">
        <div className="flex items-center gap-1 min-w-0">
          <h4
            id="product-form-size-packs"
            className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider"
          >
            <Boxes className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            Ростовки
          </h4>
          <AdminHint label="Ростовки">Упаковка одного цвета из нескольких размеров, по N штук. Покупатель её пока не видит.</AdminHint>
        </div>
        <span className="text-[11px] font-semibold text-[#4E5C70] shrink-0">Необязательно</span>
      </div>
      <p className="text-xs text-[#4E5C70] leading-snug">
        Например, 48 ×1 · 50 ×2 · 52 ×1: размеры товара и сколько штук каждого в одной упаковке. У каждого цвета упаковки свой
        штрихкод. Это не «Упаковка» оптовой цены: та считается по одному варианту.
      </p>

      {formPacks.map((draft, index) => {
        const pack = packFromDraft(draft, formSizes, formColors);
        const pieces = sizePackPieces(pack);
        const price = sizePackPrice({ wholesalePrice }, pack);
        const colors = packDraftColors(draft, formColors);
        const base = `product-form-pack-${draft.id}`;
        return (
          <div
            key={draft.id}
            role="group"
            aria-label={packDraftLabel(draft, index)}
            className="neu-flat-sm rounded-2xl border border-white/60 p-3 space-y-3"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <label htmlFor={`${base}-title`} className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                  Название ростовки
                </label>
                <input
                  id={`${base}-title`}
                  type="text"
                  autoComplete="off"
                  maxLength={SIZE_PACK_TITLE_MAX}
                  value={draft.title}
                  onChange={(e) => update(draft.id, { title: e.target.value })}
                  placeholder={pack.sizes.length > 0 ? sizePackTitle(pack) : `Ростовка ${index + 1}`}
                  className={FIELD_CLASS}
                />
              </div>
              <button
                type="button"
                onClick={() => removePack(draft, index)}
                aria-label={`Удалить ростовку: ${packDraftLabel(draft, index)}`}
                title="Удалить ростовку"
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[#4E5C70] hover:text-danger cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div role="group" aria-labelledby={`${base}-qty-title`}>
              <div className="flex items-center gap-0.5 mb-1">
                <span id={`${base}-qty-title`} className="text-[11px] font-bold text-[#4E5C70] leading-tight">
                  Штук каждого размера в упаковке
                </span>
                {index === 0 && (
                  <AdminHint label="Штук каждого размера">
                    Сколько штук каждого размера в упаковке. Пустое поле — этого размера в упаковке нет.
                  </AdminHint>
                )}
              </div>
              <div className="grid grid-cols-3 min-[420px]:grid-cols-4 sm:grid-cols-6 gap-2">
                {formSizes.map((size, i) => (
                  <div key={size} className="min-w-0">
                    <label htmlFor={`${base}-qty-${i}`} className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                      {size}, шт.
                    </label>
                    <input
                      id={`${base}-qty-${i}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={3}
                      value={draft.qty[size] ?? ''}
                      onChange={(e) => update(draft.id, { qty: { ...draft.qty, [size]: e.target.value } })}
                      className={`${FIELD_CLASS} text-center`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <NeumorphicSwitch
                  id={`${base}-all-colors`}
                  checked={draft.allColors}
                  label={`Все цвета: ${packDraftLabel(draft, index)}`}
                  onChange={(on) => update(draft.id, on ? { allColors: true } : { allColors: false, colors: colorNames })}
                />
                <label htmlFor={`${base}-all-colors`} className="text-[11px] font-bold text-[#4E5C70] leading-tight">
                  Все цвета
                </label>
                {index === 0 && (
                  <AdminHint label="Все цвета" className="-ml-1.5">
                    В каких цветах продаётся эта упаковка. У каждого цвета свой штрихкод.
                  </AdminHint>
                )}
              </div>
              {!draft.allColors && (
                <div role="group" aria-label="Цвета ростовки" className="flex flex-wrap gap-1.5">
                  {formColors.map((color) => {
                    const on = draft.colors.some((c) => sameColor(c, color.name));
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => toggleColor(draft, color.name)}
                        aria-pressed={on}
                        className={`min-h-8 px-2.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                          on ? 'neu-pill-active text-[#2D3A4E]' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: color.hex }}
                        />
                        {color.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-w-0 sm:max-w-[50%]">
              <div className="flex items-center gap-0.5 mb-1">
                <label htmlFor={`${base}-price`} className="text-[11px] font-bold text-[#4E5C70] leading-tight">
                  Цена упаковки, ₽
                </label>
                {index === 0 && (
                  <AdminHint label="Цена упаковки">
                    Пусто — оптовая цена штуки × число штук в упаковке. Без обеих цен цены у ростовки нет.
                  </AdminHint>
                )}
              </div>
              <input
                id={`${base}-price`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={String(SIZE_PACK_PRICE_MAX).length + 2}
                value={draft.price}
                onChange={(e) => update(draft.id, { price: e.target.value })}
                placeholder={
                  draft.price.trim() !== '' || price === undefined
                    ? 'задайте цену'
                    : `по опту: ${rub(price)}`
                }
                aria-describedby={price === undefined && pieces > 0 ? `${base}-price-note` : undefined}
                className={FIELD_CLASS}
              />
              {price === undefined && pieces > 0 && (
                <p id={`${base}-price-note`} className="text-[11px] font-bold text-warning leading-snug mt-1">
                  Цена: задайте свою или оптовую цену товара
                </p>
              )}
            </div>

            <p className="text-xs text-[#4E5C70] leading-snug break-words">
              {pieces > 0 ? `${pieces} шт. в упаковке` : 'Укажите штуки хотя бы у одного размера'}
              {pieces > 0 && colors.length > 0 && (
                <>
                  {' · '}
                  {colors.map((color, i) => {
                    const code = pack.barcodes?.find((b) => sameColor(b.color, color))?.code;
                    return (
                      <span key={color}>
                        {i > 0 && ' · '}
                        {color}: {code ? <span className="font-mono">штрихкод {code}</span> : 'штрихкод выдастся при сохранении'}
                      </span>
                    );
                  })}
                </>
              )}
            </p>
          </div>
        );
      })}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setFormPacks((prev) => [...prev, newPackDraft(prev)])}
          disabled={!canAdd}
          aria-describedby={addNote ? 'product-form-size-packs-note' : undefined}
          className={`min-h-9 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${
            canAdd ? 'neu-button text-accent cursor-pointer' : 'neu-button-disabled text-[#4E5C70]'
          }`}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Добавить ростовку
        </button>
        {addNote && (
          <span id="product-form-size-packs-note" className="text-[11px] text-[#4E5C70] leading-snug">
            {addNote}
          </span>
        )}
      </div>
    </section>
  );
}
