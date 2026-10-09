import { useEffect, useState } from 'react';
import { AlertTriangle, Coins } from 'lucide-react';
import type { Product } from '../../../types';
import {
  PURCHASE_CURRENCIES,
  effectiveMarkup,
  priceFromRate,
  repriceProduct,
  workingRate,
  type ExchangeRates,
  type PurchaseCurrency,
} from '../../../utils/currencyPricing';
import { subscribeToExchangeRates } from '../../../utils/firebaseSync';
import { AdminHint } from '../AdminHint';
import type { ProductForm } from './useProductForm';

const rub = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

/**
 * «Цены» of the product form: price, cost, old price and the purchase in dollars or yuan. Under the purchase — the
 * price at today's rates and «Подставить» (admin audit 09.10, А8): the same calculation as «Применить» in «Курсы и
 * наценка», so a discount is kept. A new product takes the price from the rate at once while the price is untouched.
 * A price below the cost is warned about, not forbidden (А9).
 */
export function ProductFormPrices({ form }: { form: ProductForm }) {
  const {
    editingProduct,
    formPrice,
    setFormPrice,
    formCostPrice,
    setFormCostPrice,
    formOldPrice,
    setFormOldPrice,
    formDiscountPercent,
    setFormDiscountPercent,
    autoPriceRef,
    formPurchaseCurrency,
    setFormPurchaseCurrency,
    formPurchaseAmount,
    setFormPurchaseAmount,
    formPurchaseMarkup,
    setFormPurchaseMarkup,
    formPurchase,
  } = form;

  // the rates are read only while a purchase in a currency is chosen (`settings/exchange_rates`, admin only)
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesFailed, setRatesFailed] = useState(false);
  const watchRates = Boolean(formPurchaseCurrency);
  useEffect(() => {
    if (!watchRates) return;
    setRatesFailed(false);
    return subscribeToExchangeRates(
      (next) => {
        setRates(next);
        setRatesFailed(false);
      },
      () => setRatesFailed(true)
    );
  }, [watchRates]);

  const purchase = formPurchase();
  const fromRate =
    purchase && rates
      ? repriceProduct(
          {
            price: formPrice,
            originalPrice: formOldPrice,
            discountPercent: formDiscountPercent,
            purchase,
          } as Product,
          rates
        )
      : null;
  const rate = purchase && rates ? workingRate(purchase.currency === 'USD' ? rates.usd : rates.cny) : null;
  const sign = PURCHASE_CURRENCIES.find((c) => c.id === formPurchaseCurrency)?.sign ?? '';

  const applyFromRate = () => {
    if (!fromRate) return;
    setFormPrice(fromRate.price);
    setFormCostPrice(fromRate.costPrice);
    setFormOldPrice(fromRate.originalPrice ?? undefined);
    setFormDiscountPercent(fromRate.discountPercent || undefined);
  };

  // A new product: its cost in ₽ follows the rate, and so does the price while the owner has not typed one of their
  // own (the last auto price lives in the form, so closing «Цены» does not forget it). The plain price from the rate
  // (no discount) does not depend on the price, so setting it cannot start the calculation again
  const plain = purchase && rates ? priceFromRate(purchase, rates) : null;
  const ratePrice = plain?.price;
  const rateCost = plain?.costPrice;
  useEffect(() => {
    if (editingProduct || ratePrice === undefined || rateCost === undefined) return;
    setFormCostPrice(rateCost);
    // only a new rate price moves the price: the owner's own price stays
    if (formPrice !== 0 && formPrice !== autoPriceRef.current) return;
    autoPriceRef.current = ratePrice;
    setFormPrice(ratePrice);
  }, [ratePrice, rateCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const sameAsRate =
    fromRate !== null &&
    fromRate.price === formPrice &&
    fromRate.costPrice === formCostPrice &&
    (fromRate.originalPrice ?? undefined) === (formOldPrice || undefined);

  // the cost the owner sells against: from the rate when the purchase is in a currency, else the cost typed in ₽
  const cost = purchase && fromRate ? fromRate.costPrice : formCostPrice;
  const belowCost = formPrice > 0 && cost !== undefined && cost > 0 && formPrice < cost ? Math.ceil(cost - formPrice) : 0;

  return (
    <>
      {formPrice > 0 && cost !== undefined && cost > 0 && (
        <div className="flex items-center justify-between text-[11px] font-extrabold text-[#2D3A4E] flex-wrap gap-1">
          <span className="flex items-center gap-1 flex-wrap">
            Маржа
            <AdminHint label="Маржа">Ваша прибыль с одной штуки: цена минус закупка.</AdminHint>
            {cost !== formCostPrice && (
              <span className="font-bold text-[#4E5C70]">по закупке по курсу, {rub(cost)}</span>
            )}
          </span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-lg font-extrabold border ${
              formPrice >= cost ? 'bg-success-soft text-success border-success/25' : 'bg-danger-soft text-danger border-danger/25'
            }`}
          >
            {Math.round(((formPrice - cost) / formPrice) * 100)}% ({formPrice >= cost ? '+' : '−'}
            {rub(Math.round(Math.abs(formPrice - cost)))})
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-0.5 mb-1">
            <label htmlFor="product-form-price" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
              Цена, ₽ *
            </label>
            <AdminHint label="Цена, ₽">Цена, по которой покупатель закажет товар.</AdminHint>
          </div>
          <input
            id="product-form-price"
            type="number"
            value={formPrice || ''}
            onChange={(e) => setFormPrice(Number(e.target.value))}
            placeholder="напр. 2 990"
            min="1"
            aria-describedby={belowCost > 0 ? 'product-form-below-cost' : undefined}
            className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-extrabold text-accent"
            required
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-0.5 mb-1">
            <label htmlFor="product-form-cost" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
              Закупка, ₽
            </label>
            <AdminHint label="Закупка">Во сколько товар обошёлся вам. Покупатель не видит.</AdminHint>
          </div>
          <input
            id="product-form-cost"
            type="number"
            value={formCostPrice ?? ''}
            onChange={(e) => setFormCostPrice(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="напр. 1 400"
            className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-0.5 mb-1">
            <label htmlFor="product-form-old-price" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
              Старая цена, ₽
            </label>
            <AdminHint label="Старая цена">Зачёркнутая цена рядом с новой. Должна быть выше текущей.</AdminHint>
          </div>
          <input
            id="product-form-old-price"
            type="number"
            value={formOldPrice ?? ''}
            onChange={(e) => setFormOldPrice(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="если есть"
            className={`w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] placeholder:text-[#56647A] ${
              formOldPrice ? 'line-through' : ''
            }`}
          />
        </div>
      </div>

      {belowCost > 0 && (
        <p
          id="product-form-below-cost"
          className="flex items-start gap-2 rounded-xl p-2.5 bg-warning-soft border border-warning/30 text-xs font-bold text-[#2D3A4E] leading-snug"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
          <span>
            Цена ниже закупки на {rub(belowCost)}: каждая продажа — в убыток. Сохранить можно, если так задумано.
          </span>
        </p>
      )}

      <fieldset className="space-y-2 pt-1">
        <legend className="text-[11px] font-bold text-[#4E5C70]">Закупка в валюте</legend>
        <div role="radiogroup" aria-label="Валюта закупки" className="flex gap-2">
          {([['', 'Нет'], ...PURCHASE_CURRENCIES.map((c) => [c.id, `${c.sign} ${c.title}`])] as [PurchaseCurrency | '', string][]).map(
            ([id, label]) => (
              <button
                key={id || 'none'}
                type="button"
                role="radio"
                aria-checked={formPurchaseCurrency === id}
                onClick={() => setFormPurchaseCurrency(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  formPurchaseCurrency === id ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
        {formPurchaseCurrency && (
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor="product-form-purchase" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                Закупка, {sign} *
              </label>
              <input
                id="product-form-purchase"
                type="text"
                inputMode="decimal"
                value={formPurchaseAmount}
                onChange={(e) => setFormPurchaseAmount(e.target.value)}
                placeholder="напр. 4,20"
                className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="product-form-purchase-markup" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                Своя наценка, %
              </label>
              <input
                id="product-form-purchase-markup"
                type="text"
                inputMode="decimal"
                value={formPurchaseMarkup}
                onChange={(e) => setFormPurchaseMarkup(e.target.value)}
                placeholder={rates ? `общая, ${rates.markupPercent.toLocaleString('ru-RU')}` : 'общая'}
                className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
              />
            </div>
          </div>
        )}

        {formPurchaseCurrency && purchase && (
          <div className="rounded-xl p-2.5 neu-inset space-y-2">
            {fromRate && rate !== null && rates ? (
              <>
                <div className="flex items-start gap-2">
                  <Coins className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-extrabold text-[#2D3A4E]">
                      По курсу: {rub(fromRate.price)}
                      {fromRate.originalPrice !== null && (
                        <span className="text-xs font-bold text-[#4E5C70]"> со скидкой, старая {rub(fromRate.originalPrice)}</span>
                      )}
                    </p>
                    <p className="text-xs text-[#4E5C70] leading-snug">
                      Закупка {rub(fromRate.costPrice)} по курсу {rub(rate)} за {sign}1, наценка{' '}
                      {effectiveMarkup(purchase, rates).toLocaleString('ru-RU')} %, вверх до 10 ₽.
                    </p>
                  </div>
                </div>
                {sameAsRate ? (
                  <p className="text-xs font-bold text-success">Цена и закупка в ₽ уже по курсу</p>
                ) : (
                  <button
                    type="button"
                    onClick={applyFromRate}
                    className="h-8 px-3 rounded-xl neu-button text-xs font-extrabold text-accent cursor-pointer"
                  >
                    Подставить
                  </button>
                )}
              </>
            ) : ratesFailed ? (
              <p className="text-xs text-danger font-bold">Курсы не прочитались: проверьте соединение.</p>
            ) : rates ? (
              <p className="text-xs text-[#4E5C70] leading-snug">
                Курс ЦБ для {sign} не задан: задайте его в «Курсы и наценка», и здесь появится цена по курсу.
              </p>
            ) : (
              <p className="text-xs text-[#4E5C70]">Загружаем курс…</p>
            )}
          </div>
        )}

        <p className="text-xs text-[#4E5C70] leading-snug">
          {formPurchaseCurrency
            ? 'При новом курсе цены всех таких товаров пересчитает «Применить» в «Курсы и наценка». Пустая своя наценка — общая для всех товаров.'
            : 'Товар закуплен в долларах или юанях — выберите валюту, и его цена пойдёт за курсом.'}
        </p>
      </fieldset>
    </>
  );
}
