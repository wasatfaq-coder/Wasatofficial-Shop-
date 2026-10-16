import { AlertTriangle } from 'lucide-react';
import {
  SALE_CHANNELS,
  brokenPackDiscountedPrice,
  readBrokenPackDiscount,
  type SaleChannel,
} from '../../../shared/wholesalePricing';
import { effectiveWholesaleMarkup, parseDecimal, wholesalePriceFromRate, type ExchangeRates } from '../../../utils/currencyPricing';
import { AdminHint } from '../AdminHint';
import type { ProductForm } from './useProductForm';

const rub = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const inputClass =
  'w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-text-primary placeholder:text-text-muted';

interface ProductFormWholesaleProps {
  form: ProductForm;
  /** The rates, read by «Цены» while the purchase is in a currency; null — not read */
  rates: ExchangeRates | null;
  /** The cost of one item the owner sells against (from the rate or typed in ₽) */
  cost?: number;
}

/**
 * «Опт» in «Цены» of the product form (src/shared/wholesalePricing.ts): who the product is sold to, the wholesale
 * price of one item — no promo or discount of the shop applies to it, only the volume discount of «Опт» — the pack and
 * the fewest packs. With a purchase in a currency — the wholesale price at today's rates and «Подставить».
 */
export function ProductFormWholesale({ form, rates, cost }: ProductFormWholesaleProps) {
  const {
    formPrice,
    formSaleChannel,
    setFormSaleChannel,
    formWholesalePrice,
    setFormWholesalePrice,
    formWholesalePackSize,
    setFormWholesalePackSize,
    formWholesaleMinPacks,
    setFormWholesaleMinPacks,
    formWholesaleMarkup,
    setFormWholesaleMarkup,
    formPurchase,
    formPacks,
    settings,
  } = form;
  const purchase = formPurchase();
  const fromRate = purchase && rates ? wholesalePriceFromRate(purchase, rates) : null;
  const markup = purchase && rates ? effectiveWholesaleMarkup(purchase, rates) : undefined;
  const price = parseDecimal(formWholesalePrice);
  const wholesaleOn = formSaleChannel !== 'retail';
  const belowCost = wholesaleOn && price > 0 && cost !== undefined && cost > 0 && price < cost ? Math.ceil(cost - price) : 0;
  const notLower = wholesaleOn && formSaleChannel === 'both' && price > 0 && formPrice > 0 && price >= formPrice;

  const brokenDiscount = readBrokenPackDiscount(settings?.brokenPackDiscount ?? settings?.wholesale?.brokenPackDiscount);
  const roundedWholesale = price > 0 ? Math.round(price) : 0;
  const brokenPrice =
    formSaleChannel === 'both' && roundedWholesale > 0
      ? brokenPackDiscountedPrice(roundedWholesale, brokenDiscount)
      : null;
  const brokenBelowCost =
    brokenPrice !== null && cost !== undefined && cost > 0 && brokenPrice < cost ? Math.ceil(cost - brokenPrice) : 0;

  return (
    <fieldset className="space-y-2 pt-1">
      <legend className="flex items-center gap-1 text-[11px] font-bold text-text-secondary">
        Опт
        <AdminHint label="Опт">
          Оптовая цена уже снижена: промокоды и скидка товара на неё не действуют, только скидка за объём из раздела «Опт».
        </AdminHint>
      </legend>
      <div role="radiogroup" aria-label="Кому продаётся товар" className="flex flex-wrap gap-2">
        {SALE_CHANNELS.map(({ id, title }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={formSaleChannel === id}
            onClick={() => setFormSaleChannel(id as SaleChannel)}
            className={`px-3 py-1.5 min-h-8 rounded-xl text-xs font-bold cursor-pointer ${
              formSaleChannel === id ? 'neu-pill-active' : 'neu-button text-text-primary hover:text-accent'
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      {!wholesaleOn && formPacks.length > 0 && (
        <p className="text-xs text-text-secondary leading-snug rounded-xl p-2.5 neu-inset">
          При режиме «Только в розницу» ростовки скрываются на витрине, но сохраняются в карточке товара (вернутся при переключении на «И опт, и розница»).
        </p>
      )}

      {wholesaleOn && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor="product-form-wholesale-price" className="text-[11px] font-bold text-text-secondary block mb-1 leading-tight">
                Оптовая цена за штуку, ₽{formSaleChannel === 'wholesale' ? ' *' : ''}
              </label>
              <input
                id="product-form-wholesale-price"
                type="text"
                inputMode="decimal"
                value={formWholesalePrice}
                onChange={(e) => setFormWholesalePrice(e.target.value)}
                placeholder="пусто — не оптом"
                className={inputClass}
              />
            </div>
            {purchase && (
              <div className="min-w-0">
                <label htmlFor="product-form-wholesale-markup" className="text-[11px] font-bold text-text-secondary block mb-1 leading-tight">
                  Своя наценка опта, %
                </label>
                <input
                  id="product-form-wholesale-markup"
                  type="text"
                  inputMode="decimal"
                  value={formWholesaleMarkup}
                  onChange={(e) => setFormWholesaleMarkup(e.target.value)}
                  placeholder={rates?.wholesaleMarkupPercent !== undefined ? `общая, ${rates.wholesaleMarkupPercent.toLocaleString('ru-RU')}` : 'общая'}
                  className={inputClass}
                />
              </div>
            )}
            <div className="min-w-0">
              <label htmlFor="product-form-pack-size" className="text-[11px] font-bold text-text-secondary block mb-1 leading-tight">
                Штук в упаковке
              </label>
              <input
                id="product-form-pack-size"
                type="text"
                inputMode="numeric"
                value={formWholesalePackSize}
                onChange={(e) => setFormWholesalePackSize(e.target.value)}
                placeholder="1"
                className={inputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="product-form-min-packs" className="text-[11px] font-bold text-text-secondary block mb-1 leading-tight">
                Минимум упаковок
              </label>
              <input
                id="product-form-min-packs"
                type="text"
                inputMode="numeric"
                value={formWholesaleMinPacks}
                onChange={(e) => setFormWholesaleMinPacks(e.target.value)}
                placeholder="1"
                className={inputClass}
              />
            </div>
          </div>

          {fromRate !== null && markup !== undefined && (
            <div className="rounded-xl p-2.5 neu-inset flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-text-primary">
                <span className="font-extrabold">Опт по курсу: {rub(fromRate)}</span>{' '}
                <span className="text-text-secondary">наценка опта {markup.toLocaleString('ru-RU')} %</span>
              </p>
              {price === fromRate ? (
                <p className="text-xs font-bold text-success">Уже по курсу</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setFormWholesalePrice(String(fromRate))}
                  className="h-8 px-3 rounded-xl neu-button text-xs font-extrabold text-accent cursor-pointer"
                >
                  Подставить
                </button>
              )}
            </div>
          )}

          {brokenPrice !== null && (
            <p className="text-xs text-text-secondary leading-snug">
              При разбивке ростовки вещь уйдёт по{' '}
              <span className="font-extrabold text-text-primary">{rub(brokenPrice)}</span> за штуку
              {brokenDiscount
                ? ` (скидка на разбитую упаковку −${brokenDiscount.kind === 'percent' ? `${brokenDiscount.value} %` : rub(brokenDiscount.value)})`
                : ' (без доп. скидки на разбитую упаковку)'}
              .
            </p>
          )}

          {belowCost > 0 && (
            <p role="status" className="flex items-start gap-1.5 text-xs font-bold text-warning">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> Оптовая цена ниже закупки на {rub(belowCost)}
            </p>
          )}
          {brokenBelowCost > 0 && (
            <p role="status" className="flex items-start gap-1.5 text-xs font-bold text-warning">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> При разбивке ростовки цена ({rub(brokenPrice!)}) ниже закупки на {rub(brokenBelowCost)}
            </p>
          )}
          {notLower && (
            <p role="status" className="flex items-start gap-1.5 text-xs font-bold text-warning">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> Оптовая цена не ниже розничной
            </p>
          )}
          <p className="text-xs text-text-secondary leading-snug">
            Оптом заказывают целыми упаковками. Скидку за объём задаёт раздел «Опт» для всех оптовых товаров.
          </p>
        </>
      )}
    </fieldset>
  );
}
