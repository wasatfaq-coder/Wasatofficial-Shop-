import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, DollarSign, Layers, Percent, Search, Share2 } from 'lucide-react';
import type { Product, PromoCode, StoreCategory } from '../../../types';
import { ProductThumbImage } from '../../ProductThumbImage';
import { DiscardChangesDialog, useDiscardGuard } from '../../DiscardChangesDialog';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import { AdminHint } from '../AdminHint';
import { isPromoListed, promoExpiryDate } from '../../../shared/orderPricing';
import { useChangedSince, useUnsavedChanges } from '../../../utils/unsavedChanges';
import { normalizedCode, uniquePromoCode } from '../../../utils/promoList';
import { pluralRu } from '../../../utils/pluralize';

type ScopeType = 'all' | 'categories' | 'products';

interface PromoFormProps {
  /** The promo being edited; null — a new one */
  promo: PromoCode | null;
  promos: PromoCode[];
  categories: StoreCategory[];
  products: Product[];
  /** Resolves to false when the database refused the write (App has already shown the error toast) */
  onUpdatePromos: (promos: PromoCode[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Back to the list: «К списку», «Отмена» and after the database saved the code */
  onClose: () => void;
}

const CODE_WORDS = ['STYLE', 'LOOK', 'SALE', 'VIP'];
const PERCENT_PRESETS = [10, 15, 20, 25, 30, 50];
const FIXED_PRESETS = [300, 500, 1000, 1500, 2000, 3000];

const fieldLabel = 'text-[11px] font-bold text-[#4E5C70] block';
const fieldInput = 'w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold';

function scopeOf(promo: PromoCode | null): ScopeType {
  if (promo?.applicableProductIds?.length) return 'products';
  if (promo?.applicableCategories?.length) return 'categories';
  return 'all';
}

/**
 * The promo code form, a screen of its own instead of the list (stage 8 of docs/admin-wholesale-plan.md, part 2,
 * finding 14): the code, the discount, the term and the limit first; the rest under «Ещё условия». A limit is told to
 * work only after a Google sign-in (finding 13). One check on «Создать / Сохранить», listed above the buttons; the form
 * closes only after the database saved the code (UX audit 03.10, finding 5).
 */
export const PromoForm: React.FC<PromoFormProps> = ({
  promo,
  promos,
  categories,
  products,
  onUpdatePromos,
  onShowToast,
  onClose,
}) => {
  const editingId = promo?.id ?? null;
  const usedCount = promo?.usedCount ?? 0;
  const [code, setCode] = useState(promo?.code ?? '');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>(
    promo ? promo.discountType || ((promo.discountValue ?? 0) > 100 ? 'fixed' : 'percent') : 'percent'
  );
  const [discountValue, setDiscountValue] = useState<number>(
    promo ? promo.discountValue ?? (promo.discountPercent || 15) : 15
  );
  const [title, setTitle] = useState(promo?.title ?? '');
  const [description, setDescription] = useState(promo?.description ?? '');
  const [minOrderAmount, setMinOrderAmount] = useState<number>(promo?.minOrderAmount || 0);
  // old codes keep the date as text («31 августа 2026 г.»): the date field gets it as a date
  const [expiresAt, setExpiresAt] = useState(promo ? promoExpiryDate(promo.expiresAt) ?? '' : '');
  // no limit by default: a code with a limit works only after a Google sign-in (finding 13)
  const [usageLimit, setUsageLimit] = useState<number | undefined>(promo?.usageLimit);
  const [badgeText, setBadgeText] = useState(promo?.badgeText ?? '');
  const [scopeType, setScopeType] = useState<ScopeType>(scopeOf(promo));
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    scopeOf(promo) === 'categories' ? promo?.applicableCategories ?? [] : []
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    scopeOf(promo) === 'products' ? promo?.applicableProductIds ?? [] : []
  );
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isPublic, setIsPublic] = useState(
    promo ? isPromoListed({ ...promo, active: true, usedCount: 0, expiresAt: undefined }) : true
  );
  const [isReferral, setIsReferral] = useState(Boolean(promo?.isReferral));
  const [partnerName, setPartnerName] = useState(promo?.partnerName ?? '');
  const [partnerCommissionPercent, setPartnerCommissionPercent] = useState<number>(
    promo?.partnerCommissionPercent || 10
  );
  // «Ещё условия» is open when the edited code has any of them, so nothing set is hidden from the owner
  const [moreOpen, setMoreOpen] = useState(
    Boolean(
      promo &&
        (promo.minOrderAmount || scopeOf(promo) !== 'all' || promo.badgeText || promo.isReferral || !isPublic)
    )
  );

  const [showFormErrors, setShowFormErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const formErrorsRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** The form was left (back to the list) while a save was on its way: that save does not close anything */
  const closedRef = useRef(false);
  useEffect(() => {
    closedRef.current = false;
    headingRef.current?.focus();
    return () => {
      closedRef.current = true;
    };
  }, []);

  const hasLimit = typeof usageLimit === 'number' && usageLimit > 0;

  // Checked on submit and then live, so a fixed field drops out of the list at once
  const validationErrors = useMemo(() => {
    const cleanCode = normalizedCode(code);
    const value = Number(discountValue);
    const maxValue = discountType === 'percent' ? 90 : 50000;
    const percent = Number(partnerCommissionPercent);
    return [
      !cleanCode && 'Введите код промокода',
      // Two promos with one code: the checkout would take either of them (UX audit 03.10, finding 5)
      cleanCode &&
        promos.some((p) => p.id !== editingId && normalizedCode(p.code) === cleanCode) &&
        `Код ${cleanCode} уже есть у другого промокода — задайте другой`,
      !(Number.isFinite(value) && value >= 1 && value <= maxValue) &&
        (discountType === 'percent'
          ? 'Размер скидки — от 1 до 90 %'
          : `Размер скидки — от 1 до ${maxValue.toLocaleString('ru-RU')} ₽`),
      hasLimit &&
        (usageLimit as number) < usedCount &&
        `Лимит — не меньше ${usedCount}: столько раз код уже применён. Чтобы остановить код, поставьте его на паузу`,
      isReferral && !partnerName.trim() && 'Укажите имя партнера или канал',
      isReferral && !(Number.isFinite(percent) && percent > 0 && percent <= 50) &&
        'Укажите комиссию партнера: от 0,5 до 50 %',
    ].filter((m): m is string => Boolean(m));
  }, [code, discountValue, discountType, partnerCommissionPercent, isReferral, partnerName, promos, editingId, hasLimit, usageLimit, usedCount]);
  const formErrors = [...(showFormErrors ? validationErrors : []), ...(saveError ? [saveError] : [])];

  // Unsaved edits: the admin panel asks before closing it or leaving the section
  const isDirty = useChangedSince(editingId ?? 'new', [
    code,
    discountType,
    discountValue,
    title,
    description,
    minOrderAmount,
    expiresAt,
    usageLimit,
    badgeText,
    scopeType,
    selectedCategories,
    selectedProductIds,
    isPublic,
    isReferral,
    partnerName,
    partnerCommissionPercent,
  ]);
  useUnsavedChanges(isDirty, 'Промокод');
  // «К списку» and «Отмена» ask before dropping edits, as every admin form does
  const guard = useDiscardGuard(isDirty, onClose);

  const filteredProductsForSelect = useMemo(() => {
    const q = productSearchQuery.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [products, productSearchQuery]);

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const handleGenerateCode = () => {
    const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
    setCode(uniquePromoCode(word, promos.map((p) => p.code), Math.random, 3));
  };

  /** «Создан / обновлен» and back to the list only after the database accepted the write; otherwise the input stays */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setShowFormErrors(true);
    setSaveError(null);
    if (validationErrors.length > 0) {
      // a problem inside «Ещё условия» (the partner) must be visible next to its field
      setMoreOpen(true);
      requestAnimationFrame(() => formErrorsRef.current?.focus());
      return;
    }
    const cleanCode = normalizedCode(code);
    const value = Number(discountValue);
    const defaultTitle =
      discountType === 'percent'
        ? `Скидка ${value}% по промокоду ${cleanCode}`
        : `Скидка ${value.toLocaleString('ru-RU')} ₽ по промокоду ${cleanCode}`;
    const fields: Partial<PromoCode> = {
      code: cleanCode,
      discountType,
      discountValue: value,
      discountPercent: discountType === 'percent' ? value : 0,
      title: title.trim() || defaultTitle,
      description: description.trim() || 'Применяется при оформлении заказа',
      minOrderAmount: minOrderAmount > 0 ? Number(minOrderAmount) : undefined,
      expiresAt: expiresAt || undefined,
      usageLimit: hasLimit ? Number(usageLimit) : undefined,
      badgeText: badgeText.trim() || undefined,
      applicableCategories: scopeType === 'categories' && selectedCategories.length > 0 ? selectedCategories : undefined,
      applicableProductIds: scopeType === 'products' && selectedProductIds.length > 0 ? selectedProductIds : undefined,
      isPublic,
      isReferral,
      partnerName: isReferral ? partnerName.trim() : undefined,
      partnerCommissionPercent: isReferral ? Number(partnerCommissionPercent) : undefined,
    };
    const next: PromoCode[] = editingId
      ? promos.map((p) => (p.id === editingId ? { ...p, ...fields } : p))
      : [
          {
            id: `promo-${Date.now()}`,
            usedCount: 0,
            active: true,
            generatedRevenue: 0,
            commissionEarned: 0,
            ...fields,
          } as PromoCode,
          ...promos,
        ];

    setIsSaving(true);
    const saved = await onUpdatePromos(next);
    // told even when the owner has already left the form: otherwise they would not know the code was saved
    if (saved !== false) {
      onShowToast(editingId ? `Промокод ${cleanCode} обновлен` : `Промокод ${cleanCode} создан и активирован`, 'success');
    }
    if (closedRef.current) return;
    setIsSaving(false);
    if (saved === false) {
      setSaveError('База не приняла промокод. Введённое осталось в форме: проверьте соединение и нажмите ещё раз');
      return;
    }
    onClose();
  };

  const moreSummary = [
    scopeType === 'all'
      ? 'весь каталог'
      : scopeType === 'categories'
        ? `категорий: ${selectedCategories.length}`
        : `товаров: ${selectedProductIds.length}`,
    minOrderAmount > 0 ? `от ${minOrderAmount.toLocaleString('ru-RU')} ₽` : 'без мин. чека',
    isPublic ? 'виден покупателям' : 'личный код',
    isReferral && 'партнёрский',
  ]
    .filter(Boolean)
    .join(' · ');

  const presets = discountType === 'percent' ? PERCENT_PRESETS : FIXED_PRESETS;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3.5 w-full min-w-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guard.requestClose}
          className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>К списку</span>
        </button>
        <h4 ref={headingRef} tabIndex={-1} className="text-sm font-extrabold text-[#2D3A4E] truncate">
          {promo ? `Промокод ${promo.code}` : 'Новый промокод'}
        </h4>
      </div>

      {usedCount > 0 && (
        <p className="text-xs text-[#2D3A4E] bg-warning-soft border border-warning/30 rounded-xl p-2.5">
          Код уже применён {usedCount} {pluralRu(usedCount, ['раз', 'раза', 'раз'])}. Новая скидка и условия подействуют
          на следующие заказы; оформленные заказы не меняются.
        </p>
      )}

      <div className="neu-inset rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor="promo-code" className={fieldLabel}>
              Код промокода *
            </label>
            <button
              type="button"
              onClick={handleGenerateCode}
              className="min-h-6 text-[11px] font-bold text-accent hover:underline cursor-pointer shrink-0"
            >
              Сгенерировать код
            </button>
          </div>
          <input
            id="promo-code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WASAT20"
            className={`${fieldInput} py-2.5 uppercase font-extrabold`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p id="promo-discount-type-label" className={fieldLabel}>
                Тип скидки *
              </p>
              <AdminHint label="Тип скидки">
                Процент — скидка в процентах от суммы подходящих товаров. Например, 15 % от 4 000 ₽ = 600 ₽. Фикс — вычитается одна сумма из заказа, но не больше стоимости подходящих товаров.
              </AdminHint>
            </div>
            <div role="radiogroup" aria-labelledby="promo-discount-type-label" className="flex rounded-xl neu-flat-sm p-1">
              {(
                [
                  { id: 'percent', label: 'Процент (%)', icon: <Percent className="w-3.5 h-3.5" aria-hidden="true" />, reset: 15 },
                  { id: 'fixed', label: 'Фикс (₽)', icon: <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />, reset: 500 },
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
                  className={`flex-1 min-h-8 py-1.5 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    discountType === option.id ? 'neu-pill-active' : 'text-[#4E5C70]'
                  }`}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <label htmlFor="promo-discount-value" className={fieldLabel}>
                Размер скидки ({discountType === 'fixed' ? '₽' : '%'}) *
              </label>
              <AdminHint label="Размер скидки">Процент — от 1 до 90, рубли — от 1 до 50 000.</AdminHint>
            </div>
            <input
              id="promo-discount-value"
              type="number"
              inputMode="numeric"
              min="1"
              max={discountType === 'percent' ? 90 : 50000}
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value))}
              className={`${fieldInput} py-2.5 font-extrabold`}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Быстрый выбор скидки">
          <span className="text-[11px] font-bold text-[#4E5C70]">Быстрый выбор:</span>
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              aria-pressed={discountValue === val}
              onClick={() => setDiscountValue(val)}
              className={`min-h-8 text-[11px] font-bold px-2.5 rounded-lg cursor-pointer ${
                discountValue === val ? 'neu-pill-active font-extrabold' : 'neu-button text-[#4E5C70]'
              }`}
            >
              {discountType === 'percent' ? `-${val}%` : `-${val.toLocaleString('ru-RU')} ₽`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label htmlFor="promo-expires-at" className={fieldLabel}>
                Действует до (включительно)
              </label>
              <AdminHint label="Действует до">Последний день действия по Москве. После полуночи код перестаёт работать.</AdminHint>
            </div>
            <input
              id="promo-expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-describedby="promo-expires-at-hint"
              className={fieldInput}
            />
            <p id="promo-expires-at-hint" className="text-[11px] text-[#4E5C70] mt-1">
              До конца дня по Москве. Пусто — без срока.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <label htmlFor="promo-usage-limit" className={fieldLabel}>
                Лимит использований (шт)
              </label>
              <AdminHint label="Лимит использований">Сколько заказов можно оформить с кодом. Код с лимитом работает только после входа через Google.</AdminHint>
            </div>
            <input
              id="promo-usage-limit"
              type="number"
              inputMode="numeric"
              min="0"
              value={usageLimit || ''}
              onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Без ограничений"
              aria-describedby="promo-usage-limit-hint"
              className={fieldInput}
            />
            <p
              id="promo-usage-limit-hint"
              className={`text-[11px] mt-1 ${hasLimit ? 'text-[#2D3A4E] bg-warning-soft border border-warning/30 rounded-lg p-2' : 'text-[#4E5C70]'}`}
            >
              {hasLimit
                ? 'Код с лимитом применит только покупатель, вошедший через Google: гость увидит «Код действует только после входа через Google». Для рекламы и рассылки гостям оставьте поле пустым.'
                : 'Пусто — без лимита, код применит и гость.'}
            </p>
          </div>
        </div>
      </div>

      {/* «Ещё условия»: the scope, the minimum, the texts for the buyer, visibility and the partner */}
      <div className="neu-inset rounded-2xl">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="promo-more-conditions"
          onClick={() => setMoreOpen((v) => !v)}
          className="w-full min-h-11 px-3.5 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <span className="min-w-0">
            <span className="block text-xs font-extrabold text-[#2D3A4E]">Ещё условия</span>
            {!moreOpen && <span className="block text-[11px] text-[#4E5C70] truncate">{moreSummary}</span>}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#4E5C70] shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {moreOpen && (
          <div id="promo-more-conditions" className="px-3.5 pb-3.5 space-y-3">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label htmlFor="promo-min-order" className={fieldLabel}>
                  Мин. сумма чека (₽)
                </label>
                <AdminHint label="Мин. сумма чека">Код сработает, только если товаров в корзине на эту сумму или больше. 0 — без условий.</AdminHint>
              </div>
              <input
                id="promo-min-order"
                type="number"
                inputMode="numeric"
                min="0"
                step="500"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                className={fieldInput}
              />
            </div>

            {/* Scope: all vs categories vs specific products */}
            <div className="pt-2 border-t border-[#BAC5D5]/40 space-y-2.5">
              <div className="flex items-center gap-1">
                <p id="promo-scope-label" className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
                  <span>Область действия скидки</span>
                </p>
                <AdminHint label="Область действия">Скидка считается только с выбранных категорий или товаров, остальное в корзине без скидки.</AdminHint>
              </div>
              <div role="radiogroup" aria-labelledby="promo-scope-label" className="flex flex-wrap items-center gap-1 neu-flat-sm p-1 rounded-xl">
                {(
                  [
                    { id: 'all', label: 'Весь каталог' },
                    { id: 'categories', label: 'Категории' },
                    { id: 'products', label: `Отдельные товары (${selectedProductIds.length})` },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={scopeType === option.id}
                    onClick={() => setScopeType(option.id)}
                    className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      scopeType === option.id ? 'neu-pill-active font-extrabold' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {scopeType === 'categories' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#4E5C70]">Скидка — на товары выбранных категорий:</span>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="min-h-6 text-accent font-bold hover:underline cursor-pointer shrink-0"
                      >
                        Сбросить выбор
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {categories.length === 0 && (
                      <span className="text-[11px] font-bold text-[#4E5C70]">Категории: не настроено</span>
                    )}
                    {categories.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedCategories((list) => toggleIn(list, cat.id))}
                          className={`min-h-8 px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isSelected ? 'neu-pill-active text-accent font-extrabold' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-accent shrink-0" aria-hidden="true" />}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {scopeType === 'products' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#4E5C70]">Скидка — только на выбранные товары:</span>
                    {selectedProductIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedProductIds([])}
                        className="min-h-6 text-accent font-bold hover:underline cursor-pointer shrink-0"
                      >
                        Очистить выбор ({selectedProductIds.length})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Найти товар для промокода"
                      placeholder="Найти товар"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto no-scrollbar p-1 neu-flat-sm rounded-xl">
                    {filteredProductsForSelect.map((prod) => {
                      const isSelected = selectedProductIds.includes(prod.id);
                      return (
                        // The whole row is a checkbox: Tab reaches it, its state is heard (audit 07.10, finding 38)
                        <button
                          key={prod.id}
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          onClick={() => setSelectedProductIds((list) => toggleIn(list, prod.id))}
                          className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected ? 'neu-pill-active' : 'hover:bg-white/40 border border-transparent'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-8 h-8 rounded-lg overflow-hidden shrink-0 neu-inset">
                              <ProductThumbImage product={prod} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-[#2D3A4E] truncate">{prod.title}</span>
                              <span className="block text-xs text-[#4E5C70]">{prod.price.toLocaleString('ru-RU')} ₽</span>
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                              isSelected ? 'neu-fill-accent text-white' : 'neu-inset text-transparent'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#BAC5D5]/40 space-y-2.5">
              <div>
                <label htmlFor="promo-title" className={`${fieldLabel} mb-1`}>
                  Заголовок для покупателя
                </label>
                <input
                  id="promo-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    discountType === 'fixed'
                      ? `Скидка ${Number(discountValue).toLocaleString('ru-RU')} ₽ на заказ`
                      : `Скидка ${discountValue}% на заказ`
                  }
                  className={fieldInput}
                />
              </div>
              <div>
                <label htmlFor="promo-description" className={`${fieldLabel} mb-1`}>
                  Поясняющий текст для покупателя
                </label>
                <input
                  id="promo-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Применяется при оформлении заказа"
                  className={`${fieldInput} font-normal`}
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label htmlFor="promo-badge-text" className={fieldLabel}>
                    Наклейка у кода
                  </label>
                  <AdminHint label="Наклейка у кода">Короткая наклейка рядом с кодом в окне «Промокоды» у покупателя.</AdminHint>
                </div>
                <input
                  id="promo-badge-text"
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="Например: Выгода"
                  className={`${fieldInput} font-normal`}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-[#2D3A4E]">
                  <span className="flex items-center gap-1">
                    Показывать покупателям в «Промокодах»
                    <AdminHint label="Показывать покупателям">Включено — код виден всем в «Промокодах». Выключено — работает только у того, кому дали код.</AdminHint>
                  </span>
                  <span className="block font-normal text-[#4E5C70]">
                    Выключите для личных кодов: их знает только тот, кому вы их дали
                  </span>
                </span>
                <NeumorphicSwitch checked={isPublic} onChange={setIsPublic} label="Показывать покупателям в «Промокодах»" />
              </div>
            </div>

            {/* Partner (influencer) code */}
            <div className="pt-2 border-t border-[#BAC5D5]/40 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <Share2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1">
                      <span className="text-[11px] font-extrabold text-[#2D3A4E]">Партнёрский промокод</span>
                      <AdminHint label="Партнёрский промокод">Считает продажи по коду и комиссию блогера. Деньги сайт не выплачивает.</AdminHint>
                    </span>
                    <span className="block text-[11px] text-[#4E5C70]">Продажи по коду и комиссия блогера</span>
                  </span>
                </span>
                <NeumorphicSwitch checked={isReferral} onChange={setIsReferral} label="Партнёрский промокод" />
              </div>
              {isReferral && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="promo-partner-name" className={`${fieldLabel} mb-1`}>
                      Имя партнёра или канал *
                    </label>
                    <input
                      id="promo-partner-name"
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Например: @alex_fashion"
                      className={fieldInput}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <label htmlFor="promo-partner-percent" className={fieldLabel}>
                        Комиссия партнёра (%)
                      </label>
                      <AdminHint label="Комиссия партнёра">Процент от оплаченных и полученных заказов с этим кодом, без доставки.</AdminHint>
                    </div>
                    <input
                      id="promo-partner-percent"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={partnerCommissionPercent}
                      onChange={(e) => setPartnerCommissionPercent(Number(e.target.value))}
                      className={fieldInput}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#4E5C70]">Промокоды не действуют на оптовые товары: оптовая цена уже снижена.</p>

      {/* Problems found on submit: one list above the buttons, no error toasts (as in the product form) */}
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

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={guard.requestClose}
          className="h-10 px-4 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="h-10 px-5 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:cursor-wait"
        >
          <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          <span>{isSaving ? 'Сохранение…' : promo ? 'Сохранить изменения' : 'Создать промокод'}</span>
        </button>
      </div>
      <DiscardChangesDialog {...guard.dialogProps} what="Изменения промокода" />
    </form>
  );
};
