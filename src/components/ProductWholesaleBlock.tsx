import React from 'react';
import { Boxes, PackageOpen } from 'lucide-react';
import type { WholesaleOffer } from '../utils/wholesaleOffer';
import { packTermsText, stepThresholdText } from '../utils/wholesaleOffer';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

/** How the buyer takes the product: by the item, wholesale by the pack, or from a broken pack (stages 11–12 of docs/unified-plan.md) */
export type BuyMode = 'retail' | 'wholesale' | 'pack' | 'broken';

export interface BrokenPackOfferInfo {
  unitPrice: number;
  baseWholesalePrice: number;
}

interface ProductWholesaleBlockProps {
  offer: WholesaleOffer;
  retailPrice: number;
  /** The chosen way (a product sold only wholesale is never in `retail` or `broken`) */
  mode: BuyMode;
  onChangeMode: (mode: BuyMode) => void;
  /** When the product has size packs, «Оптом» sells whole size packs at `packFrom.price` */
  packFrom?: { price: number; several: boolean; composition?: string; pieces?: number } | null;
  /** «Разбитая упаковка» is offered only when `saleChannel === 'both'` and an incomplete size pack exists in stock */
  brokenPack?: BrokenPackOfferInfo | null;
}

/**
 * «Оптом» and «Разбитая упаковка» on the product page (stages 11–12 of docs/unified-plan.md, docs/broken-pack-spec.md):
 * - «В розницу» — by the piece at retail price.
 * - «Оптом» — whole packs only (size packs when the product has them, otherwise `wholesalePackSize`), no separate «Ростовкой» button.
 * - «Разбитая упаковка» — shown only when `saleChannel === 'both'` and an incomplete pack is in stock.
 */
export const ProductWholesaleBlock: React.FC<ProductWholesaleBlockProps> = ({
  offer,
  retailPrice,
  mode,
  onChangeMode,
  packFrom = null,
  brokenPack = null,
}) => {
  const terms = packTermsText(offer);
  const wholesaleModeSelected = mode === 'wholesale' || mode === 'pack';
  const wholesalePriceLabel = packFrom
    ? `${packFrom.several ? 'от ' : ''}${rub(packFrom.price)}/уп.`
    : offer.packSize > 1
    ? `${rub(offer.packPrice)}/уп.`
    : `${rub(offer.unitPrice)}/шт.`;

  const choices: { mode: BuyMode; title: string; price: string }[] = [
    ...(offer.onlyWholesale ? [] : [{ mode: 'retail' as const, title: 'В розницу', price: rub(retailPrice) }]),
    {
      mode: 'wholesale' as const,
      title: 'Оптом',
      price: wholesalePriceLabel,
    },
    ...(!offer.onlyWholesale && brokenPack
      ? [{ mode: 'broken' as const, title: 'Разбитая упаковка', price: `${rub(brokenPack.unitPrice)}/шт.` }]
      : []),
  ];

  return (
    <div className="space-y-2.5">
      {choices.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Как покупаете"
          className={`grid gap-2 ${choices.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}
        >
          {choices.map((choice, index) => {
            const selected = choice.mode === 'wholesale' ? wholesaleModeSelected : choice.mode === mode;
            return (
              <button
                key={choice.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChangeMode(choice.mode)}
                className={`min-h-11 px-3 py-2 rounded-2xl text-left cursor-pointer transition-all ${
                  choices.length === 3 && index === 2 ? 'col-span-2 sm:col-span-1' : ''
                } ${selected ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'}`}
              >
                <span className="block text-xs font-extrabold">{choice.title}</span>
                <span className="block text-xs text-text-secondary whitespace-nowrap tabular-nums">{choice.price}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode === 'broken' && brokenPack && (
        <div
          role="note"
          className="neu-flat-sm rounded-2xl p-3 space-y-1.5 text-xs text-text-secondary"
        >
          <p className="flex items-center gap-1.5 font-bold text-text-primary">
            <PackageOpen className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>Разбитая упаковка продается со скидкой. Уточняйте доступные размеры в комплекте</span>
          </p>
          <p className="tabular-nums">
            Поштучный выбор оставшихся размеров неполной упаковки по сниженной цене {rub(brokenPack.unitPrice)}/шт. Скидка за объём и промокоды не применяются.
          </p>
        </div>
      )}

      {wholesaleModeSelected && (
        <div className="neu-flat-sm rounded-2xl p-3 space-y-2 text-xs text-text-secondary">
          <p className="flex items-center gap-1.5 font-bold text-text-primary tabular-nums">
            <Boxes className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>
              {packFrom
                ? `Целая упаковка — ${packFrom.several ? 'от ' : ''}${rub(packFrom.price)}`
                : offer.packSize > 1
                ? `Упаковка — ${rub(offer.packPrice)}`
                : `Оптовая цена — ${rub(offer.unitPrice)} за штуку`}
            </span>
          </p>
          {packFrom?.composition && (
            <p className="font-semibold text-text-primary">
              {packFrom.composition}
              {packFrom.pieces ? ` — ${packFrom.pieces} шт. в упаковке` : ''}
            </p>
          )}
          {!packFrom && offer.packSize > 1 && (
            <p className="tabular-nums">
              {offer.packSize} шт. одного размера и цвета × {rub(offer.unitPrice)} = {rub(offer.packPrice)}
            </p>
          )}
          {!packFrom && terms && <p>{terms}{offer.minPacks > 1 ? ' — все цвета и размеры модели вместе' : ''}</p>}
          {offer.steps.length > 0 && (
            <div className="space-y-1">
              <p className="font-bold text-text-primary">Скидка за объём</p>
              <ul className="space-y-0.5">
                {offer.steps.map((step) => (
                  <li key={step.minPacks} className="flex justify-between gap-3 tabular-nums">
                    <span>{stepThresholdText(step.minPacks, packFrom ? 1 : offer.packSize)}</span>
                    <span className="font-bold text-text-primary whitespace-nowrap">
                      {rub(step.unitPrice)}/шт.
                      {!packFrom && offer.packSize > 1 ? ` · ${rub(step.unitPrice * offer.packSize)}/уп.` : ''} ({step.discount})
                    </span>
                  </li>
                ))}
              </ul>
              <p>
                {offer.countBy === 'order'
                  ? 'Считаются все оптовые упаковки в заказе.'
                  : 'Считаются упаковки этой модели всех цветов и размеров.'}
              </p>
            </div>
          )}
          <p>Промокоды на оптовые цены не действуют.</p>
        </div>
      )}
    </div>
  );
};

