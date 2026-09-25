import React, { useState, useMemo } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  Tag,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Users,
  Layers,
  Sparkles,
  Check,
  X,
  Copy,
  AlertCircle,
  Pencil,
  Filter,
  DollarSign,
  Percent,
  Share2,
  Wand2,
  Download,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  Package,
  Search,
  Shirt,
  ShoppingBag,
} from 'lucide-react';
import { PromoCode, Product } from '../../types';
import { CATEGORIES } from '../../data/products';
import { copyToClipboard } from '../../utils/clipboard';
import { NotConfigured } from '../NotConfigured';

interface AdminPromoConstructorTabProps {
  promos: PromoCode[];
  products?: Product[];
  onUpdatePromos: (promos: PromoCode[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminPromoConstructorTab: React.FC<AdminPromoConstructorTabProps> = ({
  promos,
  products = [],
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
  const [expiresAt, setExpiresAt] = useState('31 августа 2026 г.');
  const [usageLimit, setUsageLimit] = useState<number | undefined>(100);
  const [badgeText, setBadgeText] = useState('Новый купон');
  
  // Scope Targeting: 'all' | 'categories' | 'products'
  const [scopeType, setScopeType] = useState<'all' | 'categories' | 'products'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isPopular, setIsPopular] = useState(false);

  // Referral Fields
  const [isReferral, setIsReferral] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerCommissionPercent, setPartnerCommissionPercent] = useState<number>(10);

  // Batch Generator Fields
  const [batchPrefix, setBatchPrefix] = useState('SMS-');
  const [batchCount, setBatchCount] = useState<number>(10);
  const [batchDiscountType, setBatchDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [batchDiscountValue, setBatchDiscountValue] = useState<number>(500);
  const [batchMinOrder, setBatchMinOrder] = useState<number>(2500);
  const [batchExpiresAt, setBatchExpiresAt] = useState('31 августа 2026 г.');
  const [generatedBatchPreview, setGeneratedBatchPreview] = useState<string[]>([]);
  const [isBatchCopied, setIsBatchCopied] = useState(false);

  const resetForm = () => {
    setCode('');
    setDiscountType('percent');
    setDiscountValue(15);
    setTitle('');
    setDescription('');
    setMinOrderAmount(0);
    setExpiresAt('31 августа 2026 г.');
    setUsageLimit(100);
    setBadgeText('');
    setScopeType('all');
    setSelectedCategories([]);
    setSelectedProductIds([]);
    setProductSearchQuery('');
    setIsPopular(false);
    setIsReferral(false);
    setPartnerName('');
    setPartnerCommissionPercent(10);
    setIsCreating(false);
    setEditingId(null);
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
    setExpiresAt(p.expiresAt || '');
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
    setIsReferral(Boolean(p.isReferral));
    setPartnerName(p.partnerName || '');
    setPartnerCommissionPercent(p.partnerCommissionPercent || 10);
    setIsCreating(true);
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

  const handleSavePromo = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      onShowToast('Введите уникальный код купона', 'error');
      return;
    }

    const calculatedPercent = discountType === 'percent' ? Number(discountValue) : 0;
    const defaultTitle =
      discountType === 'percent'
        ? `Скидка ${discountValue}% по промокоду ${cleanCode}`
        : `Скидка ${discountValue.toLocaleString('ru-RU')} ₽ по промокоду ${cleanCode}`;

    const finalCategories = scopeType === 'categories' && selectedCategories.length > 0 ? selectedCategories : undefined;
    const finalProductIds = scopeType === 'products' && selectedProductIds.length > 0 ? selectedProductIds : undefined;

    if (editingId) {
      const updated = promos.map((p) =>
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
              expiresAt: expiresAt.trim() || 'Бессрочно',
              usageLimit: usageLimit && usageLimit > 0 ? Number(usageLimit) : undefined,
              badgeText: badgeText.trim() || undefined,
              applicableCategories: finalCategories,
              applicableProductIds: finalProductIds,
              isPopular,
              isReferral,
              partnerName: isReferral ? partnerName.trim() : undefined,
              partnerCommissionPercent: isReferral ? Number(partnerCommissionPercent) : undefined,
            }
          : p
      );
      onUpdatePromos(updated);
      onShowToast(`Промокод ${cleanCode} успешно обновлен`, 'success');
    } else {
      // Check duplicate
      if (promos.some((p) => p.code.toUpperCase() === cleanCode)) {
        onShowToast(`Промокод ${cleanCode} уже существует`, 'error');
        return;
      }

      const newPromo: PromoCode = {
        id: `promo-${Date.now()}`,
        code: cleanCode,
        discountType,
        discountValue: Number(discountValue),
        discountPercent: calculatedPercent,
        title: title.trim() || defaultTitle,
        description: description.trim() || 'Применяется при оформлении заказа',
        minOrderAmount: minOrderAmount > 0 ? Number(minOrderAmount) : undefined,
        expiresAt: expiresAt.trim() || 'Бессрочно',
        usageLimit: usageLimit && usageLimit > 0 ? Number(usageLimit) : undefined,
        usedCount: 0,
        active: true,
        badgeText: badgeText.trim() || undefined,
        applicableCategories: finalCategories,
        applicableProductIds: finalProductIds,
        isPopular,
        isReferral,
        partnerName: isReferral ? partnerName.trim() : undefined,
        partnerCommissionPercent: isReferral ? Number(partnerCommissionPercent) : undefined,
        generatedRevenue: 0,
        commissionEarned: 0,
      };

      onUpdatePromos([newPromo, ...promos]);
      onShowToast(`Промокод ${cleanCode} создан и активирован`, 'success');
    }

    resetForm();
  };

  const handleToggleActive = (id: string) => {
    const updated = promos.map((p) =>
      p.id === id ? { ...p, active: !p.active } : p
    );
    onUpdatePromos(updated);
    const target = updated.find((p) => p.id === id);
    onShowToast(
      `Промокод ${target?.code} ${target?.active ? 'активирован' : 'приостановлен'}`,
      'info'
    );
  };

  const handleDelete = (id: string) => {
    const target = promos.find((p) => p.id === id);
    const updated = promos.filter((p) => p.id !== id);
    onUpdatePromos(updated);
    onShowToast(`Промокод ${target?.code || ''} удален`, 'info');
  };

  const handleGenerateRandomCode = () => {
    const prefixes = ['STYLE', 'MAN', 'LOOK', 'SUMMER', 'VIP', 'SALE'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNum = Math.floor(10 + Math.random() * 90);
    setCode(`${randomPrefix}${randomNum}`);
  };

  // Generate Batch of Unique Single-Use Codes
  const handleGenerateBatch = () => {
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
        expiresAt: batchExpiresAt || '31 августа 2026 г.',
        usageLimit: 1, // Single-use!
        usedCount: 0,
        active: true,
        badgeText: 'Одноразовый',
        isBatch: true,
        batchName: `Пачка ${prefix} (${count} шт.)`,
      });
    }

    onUpdatePromos([...newBatchCodes, ...promos]);
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

  // Referral metrics
  const referralPromos = promos.filter((p) => p.isReferral);
  const totalReferralRevenue = referralPromos.reduce((acc, p) => acc + (p.generatedRevenue || 0), 0);
  const totalCommissionEarned = referralPromos.reduce((acc, p) => acc + (p.commissionEarned || 0), 0);
  const totalReferralOrders = referralPromos.reduce((acc, p) => acc + (p.usedCount || 0), 0);

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
          <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-accent shrink-0" />
            <span>Конструктор промокодов и программы лояльности</span>
          </h3>
          <p className="text-[11px] text-[#4E5C70] truncate">
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
          className={`py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 neu-inset active:scale-95 ${
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
      <div className="flex items-center gap-2 p-1.5 neu-flat-sm rounded-2xl bg-[#E3E8EF] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('all')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'all'
              ? 'neu-pill-active font-black'
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
              ? 'neu-pill-active font-black'
              : 'text-[#4E5C70] hover:text-[#2D3A4E]'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Реферальная система и блогеры ({referralPromos.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('batch_generator')}
          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'batch_generator'
              ? 'neu-pill-active font-black'
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
          <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-success" />
              Привлеченная выручка
            </span>
            <p className="text-lg font-black text-[#2D3A4E]">
              {totalReferralRevenue.toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-[11px] text-[#4E5C70]">
              По заказам с партнерскими купонами
            </p>
          </div>

          <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-accent" />
              Комиссия к выплате
            </span>
            <p className="text-lg font-black text-accent">
              {totalCommissionEarned.toLocaleString('ru-RU')} ₽
            </p>
            <p className="text-[11px] text-[#4E5C70]">
              Суммарный заработок инфлюенсеров
            </p>
          </div>

          <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-transparent space-y-1">
            <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-warning" />
              Заказов от партнеров
            </span>
            <p className="text-lg font-black text-[#2D3A4E]">
              {totalReferralOrders} покупок
            </p>
            <p className="text-[11px] text-[#4E5C70]">
              Конверсий по реферальным ссылкам/кодам
            </p>
          </div>
        </div>
      )}

      {/* Batch Generator Tool Panel */}
      {activeSubTab === 'batch_generator' && (
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-4 bg-[#E3E8EF] border border-accent/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#BAC5D5]/50 pb-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
                <Wand2 className="w-4 h-4 text-accent shrink-0" />
                <span>Генератор персональных одноразовых купонов</span>
              </h4>
              <p className="text-[11px] text-[#4E5C70] mt-0.5">
                Создание уникальных кодов для массовой рассылки в SMS, Telegram или Email
              </p>
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <button
                type="button"
                onClick={() => onShowToast('Каждый купон из пачки может быть активирован покупателем только 1 раз', 'info')}
                className="neu-button px-3 py-1.5 rounded-xl text-[11px] font-black text-accent hover:text-accent-strong flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all active:scale-95"
                title="Лимит применения промокода"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>1 использование на код</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Префикс кодов
              </label>
              <input
                type="text"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value.toUpperCase())}
                placeholder="SMS-"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-black bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Количество кодов
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-black bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Тип скидки
              </label>
              <div className="flex rounded-xl neu-flat-sm p-1 bg-[#E3E8EF]">
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
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Размер скидки ({batchDiscountType === 'fixed' ? '₽' : '%'})
              </label>
              <input
                type="number"
                min="1"
                value={batchDiscountValue}
                onChange={(e) => setBatchDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-black bg-[#E3E8EF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Мин. сумма чека (₽)
              </label>
              <input
                type="number"
                value={batchMinOrder}
                onChange={(e) => setBatchMinOrder(Number(e.target.value))}
                placeholder="2500"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Срок действия (до)
              </label>
              <input
                type="text"
                value={batchExpiresAt}
                onChange={(e) => setBatchExpiresAt(e.target.value)}
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
            <button
              type="button"
              onClick={handleGenerateBatch}
              className="neu-button-accent text-white font-black text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer"
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
            <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2">
              <span className="text-[11px] font-black text-[#4E5C70] uppercase tracking-wider block">
                Свежесгенерированные коды ({generatedBatchPreview.length} шт.):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {generatedBatchPreview.map((c, i) => (
                  <span
                    key={i}
                    className="font-mono text-[11px] font-bold text-[#2D3A4E] neu-flat px-2 py-1 rounded-lg bg-[#E3E8EF]"
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
          className="neu-inset rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-accent/30 animate-in fade-in slide-in-from-top-2 duration-200 w-full min-w-0"
        >
          <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-2.5 gap-2">
            <span className="text-xs font-black text-accent uppercase tracking-wider flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{editingId ? 'Редактирование промокода' : 'Новый промокод'}</span>
            </span>
            <button
              type="button"
              onClick={handleGenerateRandomCode}
              className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              Сгенерировать код
            </button>
          </div>

          {/* Row 1: Code, Discount Type & Discount Value */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Код промокода *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WASAT20"
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase font-black bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Тип скидки *
              </label>
              <div className="flex rounded-xl neu-flat-sm p-1 bg-[#E3E8EF]">
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
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Размер скидки ({discountType === 'fixed' ? '₽' : '%'}) *
              </label>
              <input
                type="number"
                min="1"
                max={discountType === 'percent' ? 90 : 50000}
                required
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2.5 neu-inset rounded-xl text-xs text-[#2D3A4E] font-black bg-[#E3E8EF]"
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
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg neu-button cursor-pointer ${
                      discountValue === val ? 'neu-pill-active font-black' : 'text-[#4E5C70]'
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
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg neu-button cursor-pointer ${
                      discountValue === val ? 'neu-pill-active font-black' : 'text-[#4E5C70]'
                    }`}
                  >
                    -{val.toLocaleString('ru-RU')} ₽
                  </button>
                ))}
          </div>

          {/* Row 2: Title & Description */}
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Заголовок купона
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  discountType === 'fixed'
                    ? `Фиксированная скидка ${discountValue} ₽ на заказ`
                    : `Скидка ${discountValue}% на весь гардероб`
                }
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                Поясняющий текст для покупателей
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Применяется при оформлении заказа в корзине"
                className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
              />
            </div>
          </div>

          {/* Referral / Influencer Integration Switcher & Fields */}
          <div className="p-3 neu-inset rounded-2xl space-y-2.5 bg-[#E3E8EF]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-[11px] font-black text-[#2D3A4E] block">
                    Партнерский промокод (Инфлюенсер / Блогер)
                  </span>
                  <span className="text-[11px] text-[#4E5C70]">
                    Учет привлеченной выручки и автоматический расчет комиссии
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReferral(!isReferral)}
                className="w-11 h-6 rounded-full neu-inset p-0.5 transition-colors cursor-pointer bg-[#E3E8EF] shrink-0"
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
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Имя инфлюенсера / Канал *
                  </label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Например: @alex_fashion или Блогер Максим"
                    className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                    Комиссия партнера (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={partnerCommissionPercent}
                    onChange={(e) => setPartnerCommissionPercent(Number(e.target.value))}
                    placeholder="10"
                    className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Limitations & Conditions (Min spend, Expiration, Usage Limit) */}
          <div className="p-3 sm:p-3.5 neu-inset rounded-2xl space-y-3 bg-[#E3E8EF]">
            <span className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider block">
              Ограничения и условия применения:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Мин. сумма чека (₽)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                  placeholder="0 (без мин. чека)"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Срок действия (до)
                </label>
                <input
                  type="text"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  placeholder="31 декабря 2026 г."
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Лимит использований (шт)
                </label>
                <input
                  type="number"
                  min="0"
                  value={usageLimit || ''}
                  onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Без ограничений"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] font-bold bg-[#E3E8EF]"
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
                <div className="flex items-center gap-1 neu-flat-sm p-1 rounded-xl bg-[#E3E8EF]">
                  <button
                    type="button"
                    onClick={() => setScopeType('all')}
                    className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                      scopeType === 'all'
                        ? 'neu-pill-active font-black'
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
                        ? 'neu-pill-active font-black'
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
                        ? 'neu-pill-active font-black'
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
                        className="text-accent font-bold hover:underline cursor-pointer"
                      >
                        Сбросить выбор
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {CATEGORIES.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleToggleCategory(cat.id)}
                          className={`py-1.5 px-2.5 sm:px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'neu-pill-active text-accent font-black'
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
                        className="text-accent font-bold hover:underline cursor-pointer"
                      >
                        Очистить выбор ({selectedProductIds.length})
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
                    <input
                      type="text"
                      placeholder="Поиск товаров для применения промокода..."
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto no-scrollbar p-1 neu-flat-sm rounded-xl bg-[#E3E8EF]">
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
                            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 neu-inset bg-slate-200">
                              <img
                                src={prod.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#2D3A4E] truncate">{prod.title}</p>
                              <p className="text-[11px] text-[#4E5C70] font-semibold">
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
                <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                  Текст бейджа (наклейка)
                </label>
                <input
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="Например: Популярный, Выгода"
                  className="w-full px-2.5 py-1.5 neu-flat rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 sm:pt-4">
                <span className="text-[11px] font-bold text-[#2D3A4E]">
                  Выделять в списке
                </span>
                <button
                  type="button"
                  onClick={() => setIsPopular(!isPopular)}
                  className="w-11 h-6 rounded-full neu-inset p-0.5 transition-colors cursor-pointer bg-[#E3E8EF] shrink-0"
                >
                  <div
                    className={`w-5 h-5 rounded-full transition-transform neu-flat ${
                      isPopular ? 'translate-x-5 bg-accent' : 'translate-x-0 bg-[#BAC5D5]'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

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
              className="py-2 px-4.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-white" />
              <span>{editingId ? 'Сохранить изменения' : 'Создать промокод'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Promos List */}
      <div className="space-y-3 w-full min-w-0">
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
                className={`neu-inset rounded-2xl p-3 sm:p-4 space-y-2.5 transition-all bg-[#E3E8EF] border w-full min-w-0 overflow-hidden ${
                  promo.active ? 'border-transparent' : 'border-slate-300/80 opacity-75'
                }`}
              >
                {/* Top Row: Code, Discount, Badges & Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                    <span className="font-mono font-black text-xs sm:text-sm text-[#2D3A4E] neu-button px-2.5 py-1 rounded-xl bg-[#E3E8EF] tracking-wider">
                      {promo.code}
                    </span>

                    <span
                      className={`text-xs font-black neu-button px-2.5 py-0.5 rounded-lg bg-[#E3E8EF] ${
                        isFixed ? 'text-warning' : 'text-accent'
                      }`}
                    >
                      {discountLabel}
                    </span>

                    {promo.isReferral && (
                      <span className="text-[11px] font-bold neu-button text-accent px-2 py-0.5 rounded-full flex items-center gap-1 bg-[#E3E8EF]">
                        <Share2 className="w-3 h-3" />
                        Партнер: {promo.partnerName}
                      </span>
                    )}

                    {promo.isBatch && (
                      <span className="text-[11px] font-bold neu-button text-purple-700 px-2 py-0.5 rounded-full bg-[#E3E8EF]">
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
                      className={`h-8 px-3 rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
                        promo.active
                          ? 'neu-button text-success bg-[#E3E8EF]'
                          : 'neu-inset text-[#4E5C70] bg-[#E3E8EF]'
                      }`}
                    >
                      {promo.active ? 'Активен' : 'Пауза'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(promo)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      title="Редактировать"
                      aria-label="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromoToDelete(promo)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center active:scale-95 transition-all cursor-pointer"
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
                  <p className="text-[11px] text-[#4E5C70] leading-relaxed break-words">
                    {promo.description}
                  </p>
                </div>

                {/* Partner stats row if referral */}
                {promo.isReferral && (
                  <div className="p-2.5 neu-button rounded-xl bg-[#E3E8EF] flex items-center justify-between gap-2 flex-wrap text-[11px]">
                    <div className="flex items-center gap-3">
                      <span>
                        Выручка: <strong className="text-[#2D3A4E] font-black">{(promo.generatedRevenue || 0).toLocaleString('ru-RU')} ₽</strong>
                      </span>
                      <span>
                        Комиссия ({promo.partnerCommissionPercent}%):{' '}
                        <strong className="text-accent font-black">
                          {(promo.commissionEarned || 0).toLocaleString('ru-RU')} ₽
                        </strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-success font-bold">
                      Привлечено заказов: {promo.usedCount}
                    </span>
                  </div>
                )}

                {/* Restrictions Chips */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-[#BAC5D5]/40 text-[11px] text-[#4E5C70] min-w-0">
                  <span className="flex items-center gap-1 font-semibold">
                    <Calendar className="w-3 h-3 text-accent shrink-0" />
                    <span>
                      Срок: <strong className="text-[#2D3A4E]">{promo.expiresAt}</strong>
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
                    <span className="font-semibold text-accent neu-button px-2 py-0.5 rounded-md bg-[#E3E8EF]">
                      От {promo.minOrderAmount.toLocaleString('ru-RU')} ₽
                    </span>
                  ) : (
                    <span className="text-[#4E5C70] font-semibold">Без мин. чека</span>
                  )}

                  {promo.applicableCategories && promo.applicableCategories.length > 0 && (
                    <span className="flex items-center gap-1 font-extrabold text-accent neu-button px-2 py-0.5 rounded-md bg-[#E3E8EF] break-all">
                      <Layers className="w-3 h-3 shrink-0" />
                      <span>Категории: {promo.applicableCategories.join(', ')}</span>
                    </span>
                  )}

                  {promo.applicableProductIds && promo.applicableProductIds.length > 0 && (
                    <span className="flex items-center gap-1 font-extrabold text-accent neu-button px-2 py-0.5 rounded-md bg-[#E3E8EF]">
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
