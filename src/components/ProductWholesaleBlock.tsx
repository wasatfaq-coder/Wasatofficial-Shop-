import React from 'react';
import { Boxes } from 'lucide-react';
import type { WholesaleOffer } from '../utils/wholesaleOffer';
import { packTermsText, stepThresholdText } from '../utils/wholesaleOffer';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

interface ProductWholesaleBlockProps {
  offer: WholesaleOffer;
  retailPrice: number;
  /** The buyer chose «Оптом» (always on for a product sold only wholesale) */
  wholesaleMode: boolean;
  onChangeMode: (wholesale: boolean) => void;
}

/**
 * «Оптом» on the product page (stages 16–17 of docs/admin-wholesale-plan.md, part 2): the choice «В розницу / Оптом»
 * when the product is sold both ways, and the wholesale terms — the pack, the minimum and the volume-discount steps
 */
export const ProductWholesaleBlock: React.FC<ProductWholesaleBlockProps> = ({
  offer,
  retailPrice,
  wholesaleMode,
  onChangeMode,
}) => {
  const terms = packTermsText(offer);
  const choices = [
    { wholesale: false, title: 'В розницу', price: rub(retailPrice) },
    // a pack of several items is priced per pack, the item price is in the block below (owner task 11.10, item 3)
    { wholesale: true, title: 'Оптом', price: offer.packSize > 1 ? `${rub(offer.packPrice)}/уп.` : `${rub(offer.unitPrice)}/шт.` },
  ];
  return (
    <div className="space-y-2.5">
      {!offer.onlyWholesale && (
        <div role="radiogroup" aria-label="Как покупаете" className="grid grid-cols-2 gap-2">
          {choices.map((choice) => {
            const selected = choice.wholesale === wholesaleMode;
            return (
              <button
                key={choice.title}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChangeMode(choice.wholesale)}
                className={`min-h-11 px-3 py-2 rounded-2xl text-left cursor-pointer transition-all ${
                  selected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                }`}
              >
                <span className="block text-xs font-extrabold">{choice.title}</span>
                <span className="block text-xs text-[#4E5C70] whitespace-nowrap">{choice.price}</span>
              </button>
            );
          })}
        </div>
      )}

      {wholesaleMode && (
        <div className="neu-flat-sm rounded-2xl p-3 border border-white/60 space-y-2 text-xs text-[#4E5C70]">
          <p className="flex items-center gap-1.5 font-bold text-[#2D3A4E]">
            <Boxes className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>
              {offer.packSize > 1
                ? `Упаковка — ${rub(offer.packPrice)}`
                : `Оптовая цена — ${rub(offer.unitPrice)} за штуку`}
            </span>
          </p>
          {offer.packSize > 1 && (
            <p>
              {offer.packSize} шт. одного размера и цвета × {rub(offer.unitPrice)} = {rub(offer.packPrice)}
            </p>
          )}
          {terms && <p>{terms}{offer.minPacks > 1 ? ' — все цвета и размеры модели вместе' : ''}</p>}
          {offer.steps.length > 0 && (
            <div className="space-y-1">
              <p className="font-bold text-[#2D3A4E]">Скидка за объём</p>
              <ul className="space-y-0.5">
                {offer.steps.map((step) => (
                  <li key={step.minPacks} className="flex justify-between gap-3">
                    <span>{stepThresholdText(step.minPacks, offer.packSize)}</span>
                    <span className="font-bold text-[#2D3A4E] whitespace-nowrap">
                      {rub(step.unitPrice)}/шт.
                      {offer.packSize > 1 ? ` · ${rub(step.unitPrice * offer.packSize)}/уп.` : ''} ({step.discount})
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
