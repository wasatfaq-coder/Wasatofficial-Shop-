import React, { useState, useMemo, useRef } from 'react';
import { ProductThumbImage } from '../ProductThumbImage';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  Tag,
  Plus,
  Trash2,
  Calendar,
  Users,
  Layers,
  Sparkles,
  Check,
  X,
  Copy,
  Pencil,
  DollarSign,
  Percent,
  Share2,
  Wand2,
  CheckCircle2,
  TrendingUp,
  Search,
  Shirt,
} from 'lucide-react';
import { Order, PromoCode, Product, StoreCategory } from '../../types';
import { copyToClipboard } from '../../utils/clipboard';
import { NotConfigured } from '../NotConfigured';
import { NeumorphicSwitch } from '../NeumorphicSwitch';
import { formatPromoExpiry, isPromoExpired, isPromoListed, promoExpiryDate } from '../../shared/orderPricing';
import { useChangedSince, useUnsavedChanges } from '../../utils/unsavedChanges';
import { computePartnerCommissions } from '../../utils/partnerCommission';
import { pluralRu } from '../../utils/pluralize';

interface AdminPromoConstructorTabProps {
  promos: PromoCode[];
  /** Admin → «Категории» (promo limited to categories) */
  categories?: StoreCategory[];
  products?: Product[];
  /** Orders the partner commission is counted from (paid and received only) */
  orders?: Order[];
  /** Resolves to false when the database refused the write (App has already shown the error toast) */
  onUpdatePromos: (promos: PromoCode[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** A code as the checkout compares it: case and outer spaces do not matter */
const normalizedCode = (code: string | undefined) => (code ?? '').trim().toUpperCase();

/** «A, B, C и ещё 97»: a batch of single-use codes expires at once, and its codes would fill the phone screen */
function expiredCodesPreview(promos: PromoCode[]): string {
  const shown = promos.slice(0, 3).map((p) => p.code).join(', ');
  const rest = promos.length - 3;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}

export const AdminPromoConstructorTab: React.FC<AdminPromoConstructorTabProps> = ({
  promos,
  categories = [],
  products = [],
  orders = [],
  onUpdatePromos,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'referrals' | 'batch_generator'>('all');
  const [promoToDelete, setPromoToDelete] = useState<PromoCode | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(15);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState(''); // «YYYY-MM-DD», пусто — без срока
  const [usageLimit, setUsageLimit] = useState<number | undefined>(100);
  const [badgeText, setBadgeText] = useState('Новый купон');
  
  // Scope Targeting: 'all' | 'categories' | 'products'
  const [scopeType, setScopeType] = useState<'all' | 'categories' | 'products'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isPopular, setIsPopular] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // Referral Fields
  const [isReferral, setIsReferral] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerCommissionPercent, setPartnerCommissionPercent] = useState<number>(10);

  /** Problems found on «Создать / Сохранить»: listed above the buttons, as in the product form, instead of error toasts */
  const [showFormErrors, setShowFormErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const formErrorsRef = useRef<HTMLDivElement>(null);
  /** Changes when the form is closed or another promo is opened: a save that finishes later leaves that form alone */
  const formSessionRef = useRef(0);

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
      isReferral && !partnerName.trim() && 'Укажите имя партнера или канал',
      isReferral && !(Number.isFinite(percent) && percent > 0 && percent <= 50) &&
        'Укажите комиссию партнера: от 0,5 до 50 %',
    ].filter((m): m is string => Boolean(m));
  }, [code, discountValue, discountType, partnerCommissionPercent, isReferral, partnerName, promos, editingId]);
  const formErrors = [...(showFormErrors ? validationErrors : []), ...(saveError ? [saveError] : [])];

  // The open form (new or edited promo code) with unsaved edits: the admin panel asks before closing
  const isPromoFormDirty = useChangedSince(isCreating ? editingId ?? 'new' : null, [
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
    isPopular,
    isPublic,
    isReferral,
    partnerName,
    partnerCommissionPercent,
  ]);
  useUnsavedChanges(isPromoFormDirty, 'Промокод');

  // Batch Generator Fields
  const [batchPrefix, setBatchPrefix] = useState('SMS-');
  const [batchCount, setBatchCount] = useState<number>(10);
  const [batchDiscountType, setBatchDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [batchDiscountValue, setBatchDiscountValue] = useState<number>(500);
  const [batchMinOrder, setBatchMinOrder] = useState<number>(2500);
  const [batchExpiresAt, setBatchExpiresAt] = useState('');
  const [generatedBatchPreview, setGeneratedBatchPreview] = useState<string[]>([]);
  const [isBatchCopied, setIsBatchCopied] = useState(false);

  const resetForm = () => {
    setCode('');
    setDiscountType('percent');
    setDiscountValue(15);
    setTitle('');
    setDescription('');
    setMinOrderAmount(0);
    setExpiresAt('');
    setUsageLimit(100);
    setBadgeText('');
    setScopeType('all');
    setSelectedCategories([]);
    setSelectedProductIds([]);
    setProductSearchQuery('');
    setIsPopular(false);
    setIsPublic(true);
    setIsReferral(false);
    setPartnerName('');
    setPartnerCommissionPercent(10);
    setShowFormErrors(false);
    setSaveError(null);
    setIsCreating(false);
    setEditingId(null);
    formSessionRef.current += 1;
  };

  const handleOpenEdit = (p: PromoCode) => {
    setEditingId(p.id);
    setCode(p.code);
    const dType = p.discountType || (p.discountValue && p.discountValue > 100 ? 'fixed' : 'percent');
    setDiscountType(dType);
    setDiscountValue(p.discountValue !== undefined ? p.discountValue : p.discountPercent || 15);
    setTitle(p.title);
    setDescription(p.description);
    setMinOrderAmount(p.minOrderAmount || 0);
    // старые коды хранят срок текстом («31 августа 2026 г.») — в поле-дату он переходит датой
    setExpiresAt(promoExpiryDate(p.expiresAt) ?? '');
    setUsageLimit(p.usageLimit);
    setBadgeText(p.badgeText || '');
    
    if (p.applicableProductIds && p.applicableProductIds.length > 0) {
      setScopeType('products');
      setSelectedProductIds(p.applicableProductIds);
      setSelectedCategories([]);
    } else if (p.applicableCategories && p.applicableCategories.length > 0) {
      setScopeType('categories');
      setSelectedCategories(p.applicableCategories);
      setSelectedProductIds([]);
    } else {
      setScopeType('all');
      setSelectedCategories([]);
      setSelectedProductIds([]);
    }

    setIsPopular(Boolean(p.isPopular));
    setIsPublic(isPromoListed({ ...p, active: true, usedCount: 0, expiresAt: undefined }));
    setIsReferral(Boolean(p.isReferral));
    setPartnerName(p.partnerName || '');
    setPartnerCommissionPercent(p.partnerCommissionPercent || 10);
    setShowFormErrors(false);
    setSaveError(null);
    setIsCreating(true);
    formSessionRef.current += 1;
  };

  const handleToggleCategory = (catId: string) => {
    if (selectedCategories.includes(catId)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== catId));
    } else {
      setSelectedCategories([...selectedCategories, catId]);
    }
  };

  const handleToggleProduct = (prodId: string) => {
    if (selectedProductIds.includes(prodId)) {
      setSelectedProductIds(selectedProductIds.filter((id) => id !== prodId));
    } else {
      setSelectedProductIds([...selectedProductIds, prodId]);
    }
  };

  const filteredProductsForSelect = useMemo(() => {
    if (!productSearchQuery.trim()) return products;
    const q = productSearchQuery.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [products, productSearchQuery]);

  /** «Создан / обновлен» and a cleared form only after the database accepted the write; otherwise the input stays */
  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPromo) return;
    setShowFormErrors(true);
    setSaveError(null);
    if (validationErrors.length > 0) {
      requestAnimationFrame(() => formErrorsRef.current?.focus());
      return;
    }
    const cleanCode = normalizedCode(code);

    const calculatedPercent = discountType === 'percent' ? Number(discountValue) : 0;
    const defaultTitle =
      discountType === 'percent'
        ? `Скидка ${discountValue}% по промокоду ${cleanCode}`
        : `Скидка ${discountValue.toLocaleString('ru-RU')} ₽ по промокоду ${cleanCode}`;

    const finalCategories = scopeType === 'categories' && selectedCategories.length > 0 ? selectedCategories : undefined;
    const finalProductIds = scopeType === 'products' && selectedProductIds.length > 0 ? selectedProductIds : undefined;

    let next: PromoCode[];
    if (editingId) {
      next = promos.map((p) =>
        p.id === editingId
          ? {
              ...p,
              code: cleanCode,
              discountType,
              discountValue: Number(discountValue),
              discountPercent: calculatedPercent,
              title: title.trim() || defaultTitle,
              description: description.trim() || 'Применяется при оформлении заказа',
              minOrderAmount: minOrderAmount > 0 ? Number(minOrderAmount) : undefined,
              expiresAt: expiresAt || undefined,
              usageLimit: usageLimit && usageLimit > 0 ? Number(usageLimit) : undefined,
              badgeText: badgeText.trim() || undefined,
              applicableCategories: finalCategories,
              applicableProductIds: finalProductIds,
              isPopular,
              isPublic,
              isReferral,
              partnerName: isReferral ? partnerName.trim() : undefined,
              partnerCommissionPercent: isReferral ? Number(partnerCommissionPercent) : undefined,
            }
          : p
      );
    } else {
      const newPromo: PromoCode = {
        id: `promo-${Date.now()}`,
        code: cleanCode,
        discountType,
        discountValue: Number(discountValue),
        discountPercent: calculatedPercent,
        title: title.trim() || defaultTitle,
        description: description.trim() || 'Применяется при оформлении заказа',
        minOrderAmount: minOrderAmount > 0 ? Number(minOrderAmount) : undefined,
        expiresAt: expiresAt || undefined,
        usageLimit: usageLimit && usageLimit > 0 ? Number(usageLimit) : undefined,
        usedCount: 0,
        active: true,
        badgeText: badgeText.trim() || undefined,
        applicableCategories: finalCategories,
        applicableProductIds: finalProductIds,
        isPopular,
        isPublic,
        isReferral,
        partnerName: isReferral ? partnerName.trim() : undefined,
        partnerCommissionPercent: isReferral ? Number(partnerCommissionPercent) : undefined,
        generatedRevenue: 0,
        commissionEarned: 0,
      };
      next = [newPromo, ...promos];
    }

    const session = formSessionRef.current;
    setIsSavingPromo(true);
    const saved = await onUpdatePromos(next);
    setIsSavingPromo(false);
    // the admin closed the form or opened another promo meanwhile: that form stays as it is
    const sameForm = formSessionRef.current === session;
    if (saved === false) {
      if (sameForm) {
        setSaveError(
          'База не приняла промокод. Введённое осталось в форме: проверьте соединение и нажмите ещё раз'
        );
      }
      return;
    }
    onShowToast(editingId ? `Промокод ${cleanCode} обновлен` : `Промокод ${cleanCode} создан и активирован`, 'success');
    if (sameForm) resetForm();
  };

  const handleToggleActive = async (id: string) => {
    const updated = promos.map((p) =>
      p.id === id ? { ...p, active: !p.active } : p
    );
    const target = updated.find((p) => p.id === id);
    if ((await onUpdatePromos(updated)) === false) return;
    onShowToast(
      `Промокод ${target?.code} ${target?.active ? 'активирован' : 'приостановлен'}`,
      'info'
    );
  };

  // Active codes whose last day has passed: customers no longer see or apply them, but they stay «активные» here
  // computed on every render, not memoized by `promos`: a code expires at midnight while the list stays the same
  const expiredActivePromos = promos.filter((p) => p.active && isPromoExpired(p));
  const [isDisablingExpired, setIsDisablingExpired] = useState(false);

  const handleDisableExpired = async () => {
    const ids = new Set(expiredActivePromos.map((p) => p.id));
    if (ids.size === 0) return;
    setIsDisablingExpired(true);
    const updated = promos.map((p) => (ids.has(p.id) ? { ...p, active: false } : p));
    const saved = await onUpdatePromos(updated);
    setIsDisablingExpired(false);
    if (saved === false) return;
    onShowToast(
      `Выключено ${ids.size} ${pluralRu(ids.size, ['промокод', 'промокода', 'промокодов'])} с прошедшим сроком`,
      'success'
    );
  };

  const handleDelete = async (id: string) => {
    const target = promos.find((p) => p.id === id);
    const updated = promos.filter((p) => p.id !== id);
    if ((await onUpdatePromos(updated)) === false) return;
    onShowToast(`Промокод ${target?.code || ''} удален`, 'info');
  };

  const handleGenerateRandomCode = () => {
    const prefixes = ['STYLE', 'MAN', 'LOOK', 'SUMMER', 'VIP', 'SALE'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNum = Math.floor(10 + Math.random() * 90);
    setCode(`${randomPrefix}${randomNum}`);
  };

  // Generate Batch of Unique Single-Use Codes
  const handleGenerateBatch = async () => {
    const prefix = batchPrefix.trim().toUpperCase() || 'VIP-';
    const count = Math.min(Math.max(1, batchCount), 100);
    const newBatchCodes: PromoCode[] = [];
    const generatedStrings: string[] = [];

    const existingCodes = new Set(promos.map((p) => p.code.toUpperCase()));

    for (let i = 0; i < count; i++) {
      let uniqueCode = '';
      let attempts = 0;
      do {
        const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        uniqueCode = `${prefix}${randPart}`;
        attempts++;
      } while ((existingCodes.has(uniqueCode) || generatedStrings.includes(uniqueCode)) && attempts < 100);

      generatedStrings.push(uniqueCode);
      const calculatedPercent = batchDiscountType === 'percent' ? Number(batchDiscountValue) : 0;
      const titleStr =
        batchDiscountType === 'percent'
          ? `Персональная скидка ${batchDiscountValue}%`
          : `Персональный купон на ${batchDiscountValue} ₽`;

      newBatchCodes.push({
        id: `batch-${Date.now()}-${i}`,
        code: uniqueCode,
        discountType: batchDiscountType,
        discountValue: Number(batchDiscountValue),
        discountPercent: calculatedPercent,
        title: titleStr,
        description: 'Одноразовый персональный промокод из рассылки',
        minOrderAmount: batchMinOrder > 0 ? Number(batchMinOrder) : undefined,
        expiresAt: batchExpiresAt || undefined,
        usageLimit: 1, // Single-use!
        usedCount: 0,
        active: true,
        badgeText: 'Одноразовый',
        isBatch: true,
        batchName: `Пачка ${prefix} (${count} шт.)`,
      });
    }

    // the codes are listed for the mailing only once the database has them: a code it refused would not work
    if ((await onUpdatePromos([...newBatchCodes, ...promos])) === false) return;
    setGeneratedBatchPreview(generatedStrings);
    onShowToast(`Сгенерировано ${count} одноразовых промокодов`, 'success');
  };

  const handleCopyBatchToClipboard = () => {
    if (generatedBatchPreview.length === 0) return;
    const textToCopy = generatedBatchPreview.join('\n');
    copyToClipboard(textToCopy);
    setIsBatchCopied(true);
    setTimeout(() => setIsBatchCopied(false), 3000);
    onShowToast('Список промокодов скопирован в буфер для рассылки', 'success');
  };

  // Referral metrics: from the orders (paid and received), not from the promo counters a visitor can raise
  const partnerCommissions = useMemo(() => computePartnerCommissions(promos, orders), [promos, orders]);
  const commissionByPromo = useMemo(
    () => new Map(partnerCommissions.map((c) => [c.promoId, c])),
    [partnerCommissions]
  );
  const totalReferralRevenue = partnerCommissions.reduce((acc, c) => acc + c.confirmedSales, 0);
  const totalCommissionEarned = partnerCommissions.reduce((acc, c) => acc + c.commission, 0);
  const totalReferralOrders = partnerCommissions.reduce((acc, c) => acc + c.confirmedOrders, 0);
  const totalPendingOrders = partnerCommissions.reduce((acc, c) => acc + c.pendingOrders, 0);

  // Filtered promos list
  const filteredPromos = promos.filter((p) => {
    if (activeSubTab === 'referrals') return Boolean(p.isReferral);
    return true;
  });

  return (
    <div className="space-y-4 text-[#2D3A4E] w-full min-w-0 max-w-full">
      {/* Header & Sub-Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-accent shrink-0" />
            <span>Конструктор промокодов и программы лояльности</span>
          </h3>
          <p className="text-xs text-[#4E5C70] truncate">
            Процентные и фиксированные скидки (₽), генерация пачек кодов и реферальная система
          </p>
        </div>

        <button
          onClick={() => {
            if (isCreating) {
              resetForm();
            } else {
              resetForm();
              setIsCreating(true);
            }
          }}
          className={`py-2 px-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 neu-inset active:scale-95 ${
            isCreating
              ? 'text-[#4E5C70]'
              : 'text-accent hover:text-accent-strong bg-[#E3E8EF]'
          }`}
        >
          {isCreating ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>Отмена</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Создать промокод</span>
            </>
          )}
        </button>
      </div>

      {/* Sub-Tabs: All / Referrals / Batch Generator */}
      <div className="flex items-center gap-2 p-1.5 neu-flat-sm rounded-2xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('all')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'all'
              ? 'neu-pill-active font-extrabold'
              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Все промокоды ({promos.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('referrals')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'referrals'
              ? 'neu-pill-active font-extrabold'
              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Реферальная система и блогеры ({partnerCommissions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('batch_generator')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'batch_generator'
              ? 'neu-pill-active font-extrabold'
              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Генератор пачки для SMS/Email</span>
        </button>
      </div>

      {/* Referral Analytics Overview (Visible in Referrals tab) */}
      {activeSubTab === 'referrals' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="neu-inset rounded-2xl p-3.5 border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-success" />
              Продажи партнеров
            </span>
            <p className="text-lg font-extrabold text-[#2D3A4E]">
              {totalReferralRevenue.toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-xs text-[#4E5C70]">
              Оплаченные и полученные заказы с партнерскими кодами, без доставки
            </p>
          </div>

          <div className="neu-inset rounded-2xl p-3.5 border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-accent" />
              Комиссия партнеров
            </span>
            <p className="text-lg font-extrabold text-accent">
              {totalCommissionEarned.toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-xs text-[#4E5C70]">
              Для статистики: сайт ее не выплачивает. Процент — в настройках кода
            </p>
          </div>

          <div className="neu-inset rounded-2xl p-3.5 border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-warning" />
              Заказов от партнеров
            </span>
            <p className="text-lg font-extrabold text-[#2D3A4E]">
              {totalReferralOrders} {pluralRu(totalReferralOrders, ['заказ', 'заказа', 'заказов'])}
            </p>
            <p className="text-xs text-[#4E5C70]">
              {totalPendingOrders > 0
                ? `Еще ${totalPendingOrders} ${pluralRu(totalPendingOrders, ['ждет', 'ждут', 'ждут'])} оплаты или получения — в комиссию пока не входят`
                : 'Оплаченные и полученные клиентом'}
            </p>
          </div>
        </div>
      )}

      {/* Batch Generator Tool Panel */}
      {activeSubTab === 'batch_generator' && (
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-4 border border-accent/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#BAC5D5]/50 pb-3">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
                <Wand2 className="w-4 h-4 text-accent shrink-0" />
                <span>Генератор персональных одноразовых купонов</span>
              </h4>
              <p className="text-xs text-[#4E5C70] mt-0.5">
                Создание уникальных кодов для массовой рассылки в SMS, Telegram или Email
              </p>
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <button
                type="button"
                onClick={() => onShowToast('Каждый купон из пачки может быть активирован покупателем только 1 раз', 'info')}
                className="neu-button px-3 py-1.5 rounded-xl text-[11px] font-extrabold text-accent hover:text-accent-strong flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all"
                title="Лимит применения промокода"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>1 использование на код</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="batch-prefix" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Префикс кодов
              </label>
              <input
                id="batch-prefix"
                type="text"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value.toUpperCase())}
                placeholder="SMS-"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-extrabold"
              />
            </div>

            <div>
              <label htmlFor="batch-count" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Количество кодов
              </label>
              <input
                id="batch-count"
                type="number"
                min="1"
                max="100"
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-extrabold"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Тип скидки
              </label>
              <div className="flex rounded-xl neu-flat-sm p-1">
                <button
                  type="button"
                  onClick={() => setBatchDiscountType('fixed')}
                  className={`flex-1 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                    batchDiscountType === 'fixed' ? 'neu-pill-active' : 'text-[#4E5C70]'
                  }`}
                >
                  Фиксированная (₽)
                </button>
                <button
                  type="button"
                  onClick={() => setBatchDiscountType('percent')}
                  className={`flex-1 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                    batchDiscountType === 'percent' ? 'neu-pill-active' : 'text-[#4E5C70]'
                  }`}
                >
                  Процент (%)
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="batch-discount-value" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Размер скидки ({batchDiscountType === 'fixed' ? '₽' : '%'})
              </label>
              <input
                id="batch-discount-value"
                type="number"
                min="1"
                value={batchDiscountValue}
                onChange={(e) => setBatchDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-extrabold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="batch-min-order" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Мин. сумма чека (₽)
              </label>
              <input
                id="batch-min-order"
                type="number"
                value={batchMinOrder}
                onChange={(e) => setBatchMinOrder(Number(e.target.value))}
                placeholder="2500"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold"
              />
            </div>

            <div>
              <label htmlFor="batch-expires-at" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Действуют до (включительно)
              </label>
              <input
                id="batch-expires-at"
                type="date"
                value={batchExpiresAt}
                onChange={(e) => setBatchExpiresAt(e.target.value)}
                aria-describedby="batch-expires-at-hint"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold"
              />
              <p id="batch-expires-at-hint" className="text-[11px] text-[#4E5C70] mt-1">
                До конца дня по Москве. Пусто — без срока.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
            <button
              type="button"
              onClick={handleGenerateBatch}
              className="neu-button-accent text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Wand2 className="w-4 h-4 text-white" />
              <span>Сгенерировать {batchCount} промокодов</span>
            </button>

            {generatedBatchPreview.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBatchToClipboard}
                  className="neu-button font-bold text-xs py-2 px-3.5 rounded-xl text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer"
                >
                  {isBatchCopied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <span className="text-success font-bold">Скопировано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-accent" />
                      <span>Скопировать список ({generatedBatchPreview.length})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Generated preview list */}
          {generatedBatchPreview.length > 0 && (
            <div className="neu-inset rounded-2xl p-3 space-y-2">
              <span className="text-[11px] font-extrabold text-[#4E5C70] uppercase tracking-wider block">
                Свежесгенерированные коды ({generatedBatchPreview.length} шт.):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {generatedBatchPreview.map((c, i) => (
                  <span
                    key={i}
                    className="font-mono text-[11px] font-bold text-[#2D3A4E] neu-flat px-2 py-1 rounded-lg"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Promo Constructor Form */}
      {isCreating && (
        <form
          onSubmit={handleSavePromo}
          noValidate
          className="neu-inset rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 space-y-3.5 border border-accent/30 animate-in fade-in slide-in-from-top-2 duration-200 w-full min-w-0"
        >
          <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5 gap-2">
            <span className="text-xs font-extrabold text-accent uppercase tracking-wider flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{editingId ? 'Редактирование промокода' : 'Новый промокод'}</span>
            </span>
            <button
              type="button"
              onClick={handleGenerateRandomCode}
              className="min-h-6 text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              Сгенерировать код
            </button>
          </div>

          {/* Row 1: Code, Discount Type & Discount Value */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="promo-code" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Код промокода *
              </label>
              <input
                id="promo-code"
                type="text"
                required
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WASAT20"
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase font-extrabold"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Тип скидки *
              </label>
              <div className="flex rounded-xl neu-flat-sm p-1">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType('percent');
                    if (discountValue > 100) setDiscountValue(15);
                  }}
                  className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1 ${
                    discountType === 'percent'
                      ? 'neu-pill-active'
                      : 'text-[#4E5C70]'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Процент (%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType('fixed');
                    if (discountValue <= 100) setDiscountValue(500);
                  }}
                  className={`flex-1 py-1.5 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1 ${
                    discountType === 'fixed'
                      ? 'neu-pill-active'
                      : 'text-[#4E5C70]'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Фикс (₽)</span>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="promo-discount-value" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Размер скидки ({discountType === 'fixed' ? '₽' : '%'}) *
              </label>
              <input
                id="promo-discount-value"
                type="number"
                min="1"
                max={discountType === 'percent' ? 90 : 50000}
                required
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] font-extrabold"
              />
            </div>
          </div>

          {/* Quick Preset Buttons for discount */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-[#4E5C70]">Быстрый выбор:</span>
            {discountType === 'percent'
              ? [10, 15, 20, 25, 30, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDiscountValue(val)}
                    className={`min-h-6 text-[11px] font-bold px-2 py-0.5 rounded-lg neu-button cursor-pointer ${
                      discountValue === val ? 'neu-pill-active font-extrabold' : 'text-[#4E5C70]'
                    }`}
                  >
                    -{val}%
                  </button>
                ))
              : [300, 500, 1000, 1500, 2000, 3000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDiscountValue(val)}
                    className={`min-h-6 text-[11px] font-bold px-2 py-0.5 rounded-lg neu-button cursor-pointer ${
                      discountValue === val ? 'neu-pill-active font-extrabold' : 'text-[#4E5C70]'
                    }`}
                  >
                    -{val.toLocaleString('ru-RU')} ₽
                  </button>
                ))}
          </div>

          {/* Row 2: Title & Description */}
          <div className="space-y-2.5">
            <div>
              <label htmlFor="promo-title" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Заголовок купона
              </label>
              <input
                id="promo-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  discountType === 'fixed'
                    ? `Фиксированная скидка ${discountValue} ₽ на заказ`
                    : `Скидка ${discountValue}% на весь гардероб`
                }
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold"
              />
            </div>

            <div>
              <label htmlFor="promo-description" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Поясняющий текст для покупателей
              </label>
              <input
                id="promo-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Применяется при оформлении заказа в корзине"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
              />
            </div>
          </div>

          {/* Referral / Influencer Integration Switcher & Fields */}
          <div className="p-3 neu-inset rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-[11px] font-extrabold text-[#2D3A4E] block">
                    Партнерский промокод (Инфлюенсер / Блогер)
                  </span>
                  <span className="text-[11px] text-[#4E5C70]">
                    Учет привлеченной выручки и автоматический расчет комиссии
                  </span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isReferral}
                aria-label="Партнерский промокод"
                onClick={() => setIsReferral(!isReferral)}
                className="w-11 h-6 rounded-full neu-inset p-0.5 transition-colors cursor-pointer shrink-0"
              >
                <div
                  className={`w-5 h-5 rounded-full transition-transform neu-flat ${
                    isReferral ? 'translate-x-5 bg-accent' : 'translate-x-0 bg-[#BAC5D5]'
                  }`}
                />
              </button>
            </div>

            {isReferral && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#BAC5D5]/50 animate-in fade-in duration-150">
                <div>
                  <label htmlFor="promo-partner-name" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Имя инфлюенсера / Канал *
                  </label>
                  <input
                    id="promo-partner-name"
                    type="text"
                    required
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Например: @alex_fashion или Блогер Максим"
                    className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold"
                  />
                </div>

                <div>
                  <label htmlFor="promo-partner-percent" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Комиссия партнера (% от оплаченных и полученных заказов, без доставки)
                  </label>
                  <input
                    id="promo-partner-percent"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0.5"
                    max="50"
                    value={partnerCommissionPercent}
                    onChange={(e) => setPartnerCommissionPercent(Number(e.target.value))}
                    placeholder="10"
                    className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Limitations & Conditions (Min spend, Expiration, Usage Limit) */}
          <div className="p-3 sm:p-3.5 neu-inset rounded-2xl space-y-3">
            <span className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider block">
              Ограничения и условия применения:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="promo-min-order" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Мин. сумма чека (₽)
                </label>
                <input
                  id="promo-min-order"
                  type="number"
                  min="0"
                  step="500"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                  placeholder="0 (без мин. чека)"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold"
                />
              </div>

              <div>
                <label htmlFor="promo-expires-at" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Действует до (включительно)
                </label>
                <input
                  id="promo-expires-at"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  aria-describedby="promo-expires-at-hint"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold"
                />
                <p id="promo-expires-at-hint" className="text-[11px] text-[#4E5C70] mt-1">
                  До конца дня по Москве. Пусто — без срока.
                </p>
              </div>

              <div>
                <label htmlFor="promo-usage-limit" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Лимит использований (шт)
                </label>
                <input
                  id="promo-usage-limit"
                  type="number"
                  min="0"
                  value={usageLimit || ''}
                  onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Без ограничений"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold"
                />
              </div>
            </div>

            {/* Scope Targeting: All vs Categories vs Specific Products */}
            <div className="pt-2 border-t border-[#BAC5D5]/40 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Область действия скидки:</span>
                </label>
                <div className="flex items-center gap-1 neu-flat-sm p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setScopeType('all')}
                    className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                      scopeType === 'all'
                        ? 'neu-pill-active font-extrabold'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Весь каталог
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeType('categories')}
                    className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                      scopeType === 'categories'
                        ? 'neu-pill-active font-extrabold'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Категории
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeType('products')}
                    className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                      scopeType === 'products'
                        ? 'neu-pill-active font-extrabold'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Отдельные товары ({selectedProductIds.length})
                  </button>
                </div>
              </div>

              {/* Scope: Categories selection */}
              {scopeType === 'categories' && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#4E5C70] font-semibold">
                      Выберите категории, к товарам которых будет применима скидка:
                    </span>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="min-h-6 text-accent font-bold hover:underline cursor-pointer"
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
                          onClick={() => handleToggleCategory(cat.id)}
                          className={`py-1.5 px-2.5 sm:px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'neu-pill-active text-accent font-extrabold'
                              : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-accent shrink-0" />}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scope: Specific Products selection */}
              {scopeType === 'products' && (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#4E5C70] font-semibold">
                      Привязка промокода к конкретным позициям ассортимента:
                    </span>
                    {selectedProductIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedProductIds([])}
                        className="min-h-6 text-accent font-bold hover:underline cursor-pointer"
                      >
                        Очистить выбор ({selectedProductIds.length})
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
                    <input
                      type="text"
                      aria-label="Найти товар для промокода"
                      placeholder="Найти товар"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 neu-inset rounded-xl text-xs text-[#2D3A4E]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto no-scrollbar p-1 neu-flat-sm rounded-xl">
                    {filteredProductsForSelect.map((prod) => {
                      const isSelected = selectedProductIds.includes(prod.id);
                      return (
                        <div
                          key={prod.id}
                          onClick={() => handleToggleProduct(prod.id)}
                          className={`p-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'neu-pill-active'
                              : 'hover:bg-white/40 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 neu-inset">
                              <ProductThumbImage
                                product={prod}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#2D3A4E] truncate">{prod.title}</p>
                              <p className="text-xs text-[#4E5C70] font-semibold">
                                {prod.price.toLocaleString('ru-RU')} ₽ • {prod.category}
                              </p>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? 'neu-fill-accent text-white'
                                : 'neu-inset text-transparent'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Badges & Popular tag */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#BAC5D5]/40">
              <div>
                <label htmlFor="promo-badge-text" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Текст бейджа (наклейка)
                </label>
                <input
                  id="promo-badge-text"
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="Например: Популярный, Выгода"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 sm:pt-4">
                <span className="text-[11px] font-bold text-[#2D3A4E]">
                  Выделять в списке
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPopular}
                  aria-label="Выделять в списке"
                  onClick={() => setIsPopular(!isPopular)}
                  className="w-11 h-6 rounded-full neu-inset p-0.5 transition-colors cursor-pointer shrink-0"
                >
                  <div
                    className={`w-5 h-5 rounded-full transition-transform neu-flat ${
                      isPopular ? 'translate-x-5 bg-accent' : 'translate-x-0 bg-[#BAC5D5]'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 sm:pt-4 sm:col-span-2">
                <span id="promo-is-public-label" className="text-[11px] font-bold text-[#2D3A4E]">
                  Показывать покупателям в «Промокодах»
                  <span className="block font-normal text-[#4E5C70]">
                    Выключите для личных кодов: их знает только тот, кому вы их дали
                  </span>
                </span>
                <NeumorphicSwitch
                  checked={isPublic}
                  onChange={setIsPublic}
                  label="Показывать покупателям в «Промокодах»"
                />
              </div>
            </div>
          </div>

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

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="py-2 px-3.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSavingPromo}
              className="py-2 px-4.5 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:cursor-wait"
            >
              <Check className="w-3.5 h-3.5 text-white" />
              <span>{isSavingPromo ? 'Сохранение…' : editingId ? 'Сохранить изменения' : 'Создать промокод'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Promos List */}
      <div className="space-y-3 w-full min-w-0">
        {expiredActivePromos.length > 0 && (
          <div className="bg-warning-soft border border-warning/30 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <p className="text-xs text-[#2D3A4E] flex-1 min-w-0">
              <strong>
                {expiredActivePromos.length} {pluralRu(expiredActivePromos.length, ['промокод', 'промокода', 'промокодов'])}{' '}
                с прошедшим сроком
              </strong>{' '}
              ({expiredCodesPreview(expiredActivePromos)}) ещё включены. Покупатель их уже не видит и не применит;
              выключите, чтобы список совпадал с тем, что действует.
            </p>
            <button
              type="button"
              onClick={handleDisableExpired}
              disabled={isDisablingExpired}
              className={`h-9 px-4 rounded-xl text-xs font-extrabold shrink-0 self-start sm:self-auto ${
                isDisablingExpired ? 'neu-button-disabled' : 'neu-button text-[#2D3A4E] cursor-pointer'
              }`}
            >
              {isDisablingExpired ? 'Выключение…' : `Выключить ${expiredActivePromos.length}`}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between px-0.5">
          <p className="text-xs font-bold text-[#4E5C70]">
            Отображается: <strong className="text-[#2D3A4E]">{filteredPromos.length}</strong> (активных:{' '}
            {filteredPromos.filter((p) => p.active).length})
          </p>
        </div>

        <div className="space-y-3 w-full min-w-0">
          {promos.length === 0 && (
            <NotConfigured title="Промокоды" hint="Покупатели видят «Промокоды: не настроено»." />
          )}
          {filteredPromos.map((promo, prIdx) => {
            const isFixed = promo.discountType === 'fixed';
            const discountLabel = isFixed
              ? `-${(promo.discountValue || 0).toLocaleString('ru-RU')} ₽`
              : `-${promo.discountValue || promo.discountPercent}%`;

            return (
              <div
                key={`promo-card-${promo.id}-${prIdx}`}
                className={`neu-inset rounded-2xl p-3 sm:p-4 space-y-2.5 transition-all border w-full min-w-0 overflow-hidden ${
                  promo.active ? 'border-transparent' : 'border-[#BAC5D5] opacity-75'
                }`}
              >
                {/* Top Row: Code, Discount, Badges & Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                    <span className="font-mono font-extrabold text-xs sm:text-sm text-[#2D3A4E] neu-flat-sm px-2.5 py-1 rounded-xl tracking-wider">
                      {promo.code}
                    </span>

                    <span
                      className={`text-xs font-extrabold neu-button px-2.5 py-0.5 rounded-lg ${
                        isFixed ? 'text-warning' : 'text-accent'
                      }`}
                    >
                      {discountLabel}
                    </span>

                    {promo.isReferral && (
                      <span className="text-[11px] font-bold neu-flat-sm text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Share2 className="w-3 h-3" />
                        Партнер: {promo.partnerName}
                      </span>
                    )}

                    {isPromoExpired(promo) && (
                      <span className="text-[11px] font-bold bg-warning-soft text-warning border border-warning/30 px-2 py-0.5 rounded-full">
                        Срок истёк
                      </span>
                    )}

                    {promo.isBatch && (
                      <span className="text-[11px] font-bold neu-flat-sm text-accent px-2 py-0.5 rounded-full">
                        Одноразовый
                      </span>
                    )}

                    {promo.badgeText && (
                      <span className="text-[11px] font-bold neu-fill-accent text-white px-2 py-0.5 rounded-full">
                        {promo.badgeText}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(promo.id)}
                      className={`h-8 px-3 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
                        promo.active
                          ? 'neu-button text-success'
                          : 'neu-inset text-[#4E5C70]'
                      }`}
                    >
                      {promo.active ? 'Активен' : 'Пауза'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(promo)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:scale-105 transition-all cursor-pointer"
                      title="Редактировать"
                      aria-label="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromoToDelete(promo)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center transition-all cursor-pointer"
                      title="Удалить"
                      aria-label="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-xs font-extrabold text-[#2D3A4E] leading-snug break-words">
                    {promo.title}
                  </h4>
                  <p className="text-xs text-[#4E5C70] leading-relaxed break-words">
                    {promo.description}
                  </p>
                </div>

                {/* Partner stats row if referral */}
                {promo.isReferral && (() => {
                  const c = commissionByPromo.get(promo.id);
                  if (!c) return null;
                  return (
                    <div className="p-2.5 neu-flat-sm rounded-xl space-y-1 text-[11px]">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          Продажи: <strong className="text-[#2D3A4E] font-extrabold">{c.confirmedSales.toLocaleString('ru-RU')} ₽</strong>
                        </span>
                        <span>
                          {c.percent === null ? (
                            <span className="text-warning font-bold">Процент партнера не задан</span>
                          ) : (
                            <>
                              Комиссия ({c.percent}%):{' '}
                              <strong className="text-accent font-extrabold">{c.commission.toLocaleString('ru-RU')} ₽</strong>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#4E5C70]">
                        Оплачено и получено: {c.confirmedOrders} {pluralRu(c.confirmedOrders, ['заказ', 'заказа', 'заказов'])}
                        {c.pendingOrders > 0 &&
                          ` · ждут оплаты или получения: ${c.pendingOrders} на ${c.pendingSales.toLocaleString('ru-RU')} ₽`}
                      </p>
                    </div>
                  );
                })()}

                {/* Restrictions Chips */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70] min-w-0">
                  <span className="flex items-center gap-1 font-semibold">
                    <Calendar className="w-3 h-3 text-accent shrink-0" />
                    <span>
                      Срок: <strong className="text-[#2D3A4E]">{promo.expiresAt ? `до ${formatPromoExpiry(promo.expiresAt)}` : 'без срока'}</strong>
                    </span>
                  </span>

                  <span className="flex items-center gap-1 font-semibold">
                    <Users className="w-3 h-3 text-accent shrink-0" />
                    <span>
                      Использовано: <strong className="text-[#2D3A4E]">{promo.usedCount}</strong>
                      {promo.usageLimit ? ` / ${promo.usageLimit}` : ' (без лимита)'}
                    </span>
                  </span>

                  {promo.minOrderAmount ? (
                    <span className="font-semibold text-accent neu-flat-sm px-2 py-0.5 rounded-md">
                      От {promo.minOrderAmount.toLocaleString('ru-RU')} ₽
                    </span>
                  ) : (
                    <span className="text-[#4E5C70] font-semibold">Без мин. чека</span>
                  )}

                  {promo.applicableCategories && promo.applicableCategories.length > 0 && (
                    <span className="flex items-center gap-1 font-extrabold text-accent neu-flat-sm px-2 py-0.5 rounded-md break-all">
                      <Layers className="w-3 h-3 shrink-0" />
                      <span>Категории: {promo.applicableCategories.join(', ')}</span>
                    </span>
                  )}

                  {promo.applicableProductIds && promo.applicableProductIds.length > 0 && (
                    <span className="flex items-center gap-1 font-extrabold text-accent neu-flat-sm px-2 py-0.5 rounded-md">
                      <Shirt className="w-3 h-3 shrink-0" />
                      <span>Выбрано товаров: {promo.applicableProductIds.length} шт.</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={promoToDelete !== null}
        title="Удалить промокод?"
        message={`Промокод ${promoToDelete?.code || ''} перестанет действовать. Это действие нельзя отменить.`}
        onConfirm={() => promoToDelete && handleDelete(promoToDelete.id)}
        onClose={() => setPromoToDelete(null)}
      />
    </div>
  );
};
