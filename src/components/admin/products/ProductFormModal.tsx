import { Tag, Check, X, Layers, AlertTriangle, DollarSign, Maximize2, Wand2 } from 'lucide-react';
import { descriptionDraft, withDescriptionDraft } from '../../../utils/descriptionDraft';
import { recategorizeSkuCode } from '../../../utils/inventory';
import { NeumorphicSelect } from '../../NeumorphicSelect';
import { ModalPortal } from '../../ModalPortal';
import { AdminProductCardStructure } from '../AdminProductCardStructure';
import type { StoreCategory } from '../../../types';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductForm } from './useProductForm';
import { PURCHASE_CURRENCIES, type PurchaseCurrency } from '../../../utils/currencyPricing';

const PRESET_BADGES = ['ХИТ', 'NEW', 'SALE', '-20%', 'PREMIUM', 'LIMITED', 'ECO', 'EXCLUSIVE'];
import { ProductFormGallery } from './ProductFormGallery';
import { ProductFormVariants } from './ProductFormVariants';
import { ProductFormSizeChart } from './ProductFormSizeChart';

/** The window of the product form: status, card structure, name, badge, category, description, prices, photos, variants */
export function ProductFormModal({
  form,
  categories,
  products,
  onShowToast,
}: {
  form: ProductForm;
  categories: StoreCategory[];
  /** The shop's products: their characteristics become chips in «Структура карточки» */
  products: AdminProductsTabProps['products'];
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const {
    isProductFormOpen,
    isSavingProduct,
    formErrorsRef,
    editingProduct,
    formTitle,
    setFormTitle,
    formCategory,
    setFormCategory,
    categoryIsListed,
    formCategoryOptions,
    formPrice,
    setFormPrice,
    formCostPrice,
    setFormCostPrice,
    formPurchaseCurrency,
    setFormPurchaseCurrency,
    formPurchaseAmount,
    setFormPurchaseAmount,
    formPurchaseMarkup,
    setFormPurchaseMarkup,
    formOldPrice,
    setFormOldPrice,
    formBadge,
    setFormBadge,
    formInStock,
    setFormInStock,
    setTextEditModal,
    formDescription,
    setFormDescription,
    formSkus,
    setFormSkus,
    formCard,
    setFormCard,
    formErrors,
    productFormGuard,
    productFormDialog,
    skuConflictInfo,
    handleFormKeyDown,
    handleSaveProduct,
    totalFormStock,
    totalFormInventoryValue,
  } = form;

  return (
    <>
      {isProductFormOpen && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[70] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={productFormDialog.ref} {...productFormDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-4 sm:p-6 max-w-4xl w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[92vh] overflow-y-auto my-auto">
            {/* Header: title on the left, status and close on the right (status wraps under the title on phones) */}
            <div className="flex flex-wrap items-start justify-between pb-3 border-b border-[#BAC5D5]/50 gap-x-3 gap-y-2.5">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 id={productFormDialog.titleId} className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#2D3A4E]">
                      {editingProduct ? 'Редактирование товара' : 'Новый товар каталога'}
                    </h3>
                    {editingProduct && (
                      <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-mono font-extrabold text-accent">
                        {editingProduct.id}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4E5C70] font-medium mt-0.5 leading-snug">
                    Параметры, цены, себестоимость и остатки SKU
                  </p>
                </div>
              </div>

              {/* Close: always in the top-right corner */}
              <button
                type="button"
                onClick={productFormGuard.requestClose}
                className="order-2 sm:order-3 w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer shrink-0"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Status switch: a raised track with the selected option pressed in */}
              <div
                className="order-3 sm:order-2 w-full sm:w-auto grid grid-cols-2 neu-flat-sm p-1 rounded-xl gap-1 shrink-0"
                role="group"
                aria-label="Статус товара"
              >
                <button
                  type="button"
                  onClick={() => setFormInStock(true)}
                  aria-pressed={formInStock}
                  className={`h-8 px-3 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                    formInStock ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  <span className={formInStock ? 'text-success' : ''}>В продаже</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormInStock(false)}
                  aria-pressed={!formInStock}
                  className={`h-8 px-3 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                    !formInStock ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  <span className={!formInStock ? 'text-danger' : ''}>Снят с витрины</span>
                </button>
              </div>
            </div>

            {/* Card structure: every section of the customer's card, right under the status switch */}
            <AdminProductCardStructure
              value={formCard}
              onChange={setFormCard}
              hasDescription={Boolean(formDescription.trim())}
              onShowToast={onShowToast}
              suggestFrom={products}
              isNewProduct={!editingProduct}
            />

            {/* SKU Uniqueness & Integrity Banner */}
            {skuConflictInfo.hasConflicts ? (
              <div className="neu-inset rounded-2xl p-3 border border-danger/25 text-danger text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-extrabold">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span>Повторяются артикулы или штрихкоды</span>
                </div>
                <div className="text-[11px] text-danger space-y-0.5 pl-6">
                  {skuConflictInfo.duplicateCodes.map((d, i) => (
                    <div key={i}>
                      {d.kind === 'sku' ? 'Артикул' : 'Штрихкод'} <strong className="font-mono">{d.code}</strong> уже
                      занят {d.conflictingProduct.startsWith('другой') ? d.conflictingProduct : `товаром «${d.conflictingProduct}»`}
                    </div>
                  ))}
                </div>
              </div>
            ) : null /* no «всё уникально» banner: it showed even for an empty new product */}

            <form onSubmit={handleSaveProduct} onKeyDown={handleFormKeyDown} noValidate className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Basic Info, Category, Pricing, Photos, Description */}
                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label htmlFor="product-form-title" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Название товара *
                    </label>
                    <input
                      id="product-form-title"
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="например, Рубашка льняная Slim Fit"
                      className="w-full px-3.5 py-2 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                      required
                    />
                  </div>

                  {/* Marketing Badge Selector - Unified Inset Container */}
                  <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-2.5">
                    <div className="flex items-start justify-between gap-2 pb-1 border-b border-[#BAC5D5]/30">
                      <label className="min-w-0 text-[11px] font-extrabold text-[#2D3A4E] flex items-start gap-1.5 uppercase tracking-wider leading-snug">
                        <Tag className="w-3.5 h-3.5 text-accent shrink-0 mt-px" />
                        <span>Маркетинговый ярлык (Бейдж)</span>
                      </label>
                      {formBadge ? (
                        <button
                          type="button"
                          onClick={() => setFormBadge('')}
                          className="shrink-0 whitespace-nowrap text-[11px] font-bold text-danger hover:text-danger hover:underline cursor-pointer"
                        >
                          Снять ярлык
                        </button>
                      ) : (
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-[#4E5C70]">Опционально</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {PRESET_BADGES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFormBadge(formBadge.trim().toUpperCase() === b ? '' : b)}
                          aria-pressed={formBadge.trim().toUpperCase() === b}
                          className={`h-7 px-2.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-all active:scale-95 flex items-center justify-center border ${
                            formBadge.trim().toUpperCase() === b
                              ? 'neu-pill-active border-transparent'
                              : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E] border-white/60'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      aria-label="Свой текст ярлыка"
                      value={formBadge}
                      onChange={(e) => setFormBadge(e.target.value)}
                      placeholder="Или свой текст (например: -30% или ХИТ СЕЗОНА)"
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs font-bold text-accent placeholder:text-[#56647A]"
                    />
                  </div>

                  {/* Category (the fabric is set in «Структура карточки» → «Состав ткани») */}
                  <div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1 min-h-5">
                        <label htmlFor="product-form-category" className="text-[11px] font-bold text-[#4E5C70]">
                          Категория *
                        </label>
                        {!categoryIsListed && formCategory && (
                          <span className="text-[11px] font-bold text-warning whitespace-nowrap">Нет в «Категориях»</span>
                        )}
                      </div>
                      <NeumorphicSelect
                        id="product-form-category"
                        ariaLabel="Категория"
                        value={formCategory}
                        onChange={(val) => {
                          // a new product's variants added before the category was picked got «PR» in their codes
                          if (!editingProduct) {
                            setFormSkus((prev) =>
                              prev.map((sku) => ({ ...sku, skuCode: recategorizeSkuCode(sku.skuCode, formCategory, val) }))
                            );
                          }
                          setFormCategory(val);
                        }}
                        options={formCategoryOptions}
                        placeholder={categories.length === 0 ? 'Категории не настроены' : 'Выберите категорию'}
                        emptyText="Категории не настроены: добавьте их в разделе «Категории»"
                        triggerClassName="h-10 px-3 rounded-xl"
                        variant="inset"
                      />
                    </div>

                  </div>

                  {/* Description Section - directly below Category */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1 min-h-5">
                      <label htmlFor="product-form-description" className="text-[11px] font-bold text-[#4E5C70]">
                        Описание товара
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTextEditModal({
                            isOpen: true,
                            category: formCategory,
                            title: 'Описание товара',
                            subtitle: 'Подробное описание фасона, преимуществ, кроя и ухода',
                            value: formDescription,
                          })
                        }
                        className="shrink-0 min-h-6 text-[11px] font-bold text-accent hover:text-accent-strong flex items-center gap-1 cursor-pointer"
                        title="Открыть окно редактирования описания"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Развернуть редактор</span>
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        id="product-form-description"
                        rows={2}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Краткое описание преимуществ ткани и кроя..."
                        className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] resize-y leading-relaxed"
                      />
                    </div>
                    {/* The description repeats the characteristics: the form writes those sentences (fast entry, stage 3) */}
                    {(() => {
                      const draft = descriptionDraft(formCard);
                      const added = Boolean(draft) && formDescription.includes(draft);
                      return (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setFormDescription(withDescriptionDraft(formDescription, draft))}
                            disabled={!draft || added}
                            className={`min-h-8 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                              draft && !added ? 'neu-button text-accent cursor-pointer' : 'neu-button-disabled text-[#4E5C70]'
                            }`}
                          >
                            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Черновик из характеристик
                          </button>
                          <span className="text-[11px] text-[#4E5C70] leading-snug">
                            {!draft
                              ? 'Заполните состав, покрой или страну в «Структуре карточки»'
                              : added
                              ? 'Характеристики уже в описании'
                              : 'Допишет состав, покрой и страну после вашего текста'}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Pricing Matrix: Price, CostPrice & OldPrice */}
                  <div className="p-3 neu-inset rounded-2xl space-y-2.5 border border-white/60">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-[#2D3A4E] flex-wrap gap-1">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-accent" />
                        Ценообразование и маржинальность
                      </span>
                      {formPrice > 0 && formCostPrice !== undefined && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-extrabold border ${
                            formPrice >= formCostPrice
                              ? 'bg-success-soft text-success border-success/25'
                              : 'bg-danger-soft text-danger border-danger/25'
                          }`}
                        >
                          Маржа: {Math.round(((formPrice - formCostPrice) / formPrice) * 100)}% (
                          {formPrice >= formCostPrice ? '+' : '−'}
                          {Math.abs(formPrice - formCostPrice).toLocaleString('ru-RU')} ₽)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="min-w-0">
                        <label htmlFor="product-form-price" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                          Цена, ₽ *
                        </label>
                        <input
                          id="product-form-price"
                          type="number"
                          value={formPrice || ''}
                          onChange={(e) => setFormPrice(Number(e.target.value))}
                          placeholder="напр. 2 990"
                          min="1"
                          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-extrabold text-accent"
                          required
                        />
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="product-form-cost" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight" title="Себестоимость закупки">
                          Закупка, ₽
                        </label>
                        <input
                          id="product-form-cost"
                          type="number"
                          value={formCostPrice ?? ''}
                          onChange={(e) =>
                            setFormCostPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="напр. 1 400"
                          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                        />
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="product-form-old-price" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                          Старая цена, ₽
                        </label>
                        <input
                          id="product-form-old-price"
                          type="number"
                          value={formOldPrice ?? ''}
                          onChange={(e) =>
                            setFormOldPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="если есть"
                          className={`w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] placeholder:text-[#56647A] ${
                            formOldPrice ? 'line-through' : ''
                          }`}
                        />
                      </div>
                    </div>

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
                              Закупка, {formPurchaseCurrency === 'USD' ? '$' : '¥'} *
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
                              placeholder="общая"
                              className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                            />
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-[#4E5C70] leading-snug">
                        {formPurchaseCurrency
                          ? 'Цену и закупку в ₽ пересчитает раздел «Курсы и наценка» кнопкой «Применить». Пустая своя наценка — общая для всех товаров.'
                          : 'Товар закуплен в долларах или юанях — выберите валюту, и его цена пойдёт за курсом.'}
                      </p>
                    </fieldset>
                  </div>

                  <ProductFormGallery form={form} onShowToast={onShowToast} />
                </div>

                <ProductFormVariants form={form} onShowToast={onShowToast} />
              </div>

              <ProductFormSizeChart form={form} products={products} />

              {/* Form Action Buttons & Summaries */}
              <div className="pt-3 border-t border-[#BAC5D5]/50 space-y-3">
                {/* Neumorphic Recessed Summary Columns */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Остаток</span>
                    <span className="text-xs sm:text-sm font-extrabold text-accent whitespace-nowrap">
                      {totalFormStock} <span className="text-[11px] font-bold">шт.</span>
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Стоимость</span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] whitespace-nowrap">
                      {totalFormInventoryValue.toLocaleString('ru-RU')} <span className="text-[11px] font-bold">₽</span>
                    </span>
                  </div>

                </div>

                {/* «В продаже» with zero stock is saved as out of stock: say so before saving */}
                {formInStock && totalFormStock === 0 && formSkus.length > 0 && (
                  <p className="neu-inset rounded-2xl p-3 text-xs font-bold text-warning leading-snug">
                    Остаток 0 шт.: покупатели увидят «Нет в наличии» (если в «Витрине» не включен предзаказ).
                  </p>
                )}

              </div>
              {/* Always in reach (the form is ~2 000 px long): sticks to the bottom of the window */}
              <div className="sticky bottom-0 z-10 neu-flat rounded-2xl p-2.5 space-y-2 w-full">
                {formErrors.length > 0 && (
                  <div
                    ref={formErrorsRef}
                    tabIndex={-1}
                    role="alert"
                    className="bg-danger-soft border border-danger/40 rounded-xl p-2.5 text-xs font-bold text-danger space-y-1"
                  >
                    {formErrors.map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={productFormGuard.requestClose}
                  className="h-11 shrink-0 px-5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="h-11 flex-1 sm:flex-initial min-w-0 px-6 neu-button-accent rounded-xl text-xs font-extrabold text-white whitespace-nowrap cursor-pointer transition-all flex items-center justify-center gap-2 disabled:cursor-wait"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingProduct ? 'Сохранение…' : editingProduct ? 'Сохранить изменения' : 'Создать товар'}</span>
                </button>
                </div>
              </div>
            </form>
          </div>
        </div></ModalPortal>
      )}
    </>
  );
}
