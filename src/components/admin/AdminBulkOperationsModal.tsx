import React, { useState } from 'react';
import {
  X,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  Check,
  Percent,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  CheckCheck,
  AlertCircle,
} from 'lucide-react';
import { Product } from '../../types';
import { CATEGORIES } from '../../data/products';
import { motion, AnimatePresence } from 'motion/react';

interface AdminBulkOperationsModalProps {
  isOpen: boolean;
  selectedProducts: Product[];
  onClose: () => void;
  onApplyBulkChanges?: (updatedProducts: Product[], summaryMessage: string) => void;
  onApplyChanges?: (updatedProducts: Product[], summaryMessage: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type BulkTab = 'pricing' | 'discounts' | 'categories';

const DISCOUNT_PRESETS = [10, 15, 20, 25, 30, 40, 50];
const PRICE_PRESETS_PERCENT = [5, 10, 15, 20, -10, -15, -20];
const PRICE_PRESETS_FIXED = [300, 500, 1000, -300, -500, -1000];

const BADGE_PRESETS = [
  'Скидка',
  'SALE',
  'Сезонная скидка',
  'Летний SALE',
  'ХИТ',
  'Черная пятница',
  'Ликвидация',
  'Без бейджа',
];

export const AdminBulkOperationsModal: React.FC<AdminBulkOperationsModalProps> = ({
  isOpen,
  selectedProducts,
  onClose,
  onApplyBulkChanges,
  onApplyChanges,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<BulkTab>('pricing');

  // --- Pricing Tab State ---
  const [priceAdjustmentType, setPriceAdjustmentType] = useState<'percent' | 'fixed'>('percent');
  const [priceAdjustmentValue, setPriceAdjustmentValue] = useState<number>(10);
  const [priceRounding, setPriceRounding] = useState<'none' | 'round90' | 'round50' | 'round100'>('round90');

  // --- Discounts Tab State ---
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [discountBadge, setDiscountBadge] = useState<string>('SALE');
  const [isRemoveDiscountMode, setIsRemoveDiscountMode] = useState<boolean>(false);

  // --- Category Tab State ---
  const [targetCategory, setTargetCategory] = useState<string>('shirts');

  const roundPrice = (price: number, rounding: 'none' | 'round90' | 'round50' | 'round100') => {
    if (price <= 0) return 0;
    if (rounding === 'none') return Math.round(price);
    if (rounding === 'round90') {
      // e.g. 2940 -> 2990, 2410 -> 2390
      const hundreds = Math.round(price / 100) * 100;
      return Math.max(90, hundreds - 10); // Ends with 90
    }
    if (rounding === 'round50') {
      return Math.round(price / 50) * 50;
    }
    if (rounding === 'round100') {
      return Math.round(price / 100) * 100;
    }
    return Math.round(price);
  };

  // Calculate preview products based on active tab
  const getPreviewProducts = (): Product[] => {
    return selectedProducts.map((p) => {
      if (activeTab === 'pricing') {
        let newPrice = p.price;
        if (priceAdjustmentType === 'percent') {
          newPrice = p.price * (1 + priceAdjustmentValue / 100);
        } else {
          newPrice = p.price + priceAdjustmentValue;
        }
        newPrice = Math.max(100, roundPrice(newPrice, priceRounding));
        return {
          ...p,
          price: newPrice,
        };
      }

      if (activeTab === 'discounts') {
        if (isRemoveDiscountMode) {
          // Revert discount
          const restoredPrice = p.originalPrice || p.price;
          return {
            ...p,
            price: restoredPrice,
            originalPrice: undefined,
            badge: p.badge === 'SALE' || p.badge === 'Скидка' ? undefined : p.badge,
          };
        } else {
          // Apply seasonal discount
          const basePrice = p.originalPrice || p.price;
          const discountedPrice = Math.round(basePrice * ((100 - discountPercent) / 100));
          const roundedPrice = roundPrice(discountedPrice, 'round90');
          return {
            ...p,
            price: roundedPrice,
            originalPrice: basePrice,
            badge: discountBadge === 'Без бейджа' ? undefined : discountBadge,
          };
        }
      }

      if (activeTab === 'categories') {
        const catObj = CATEGORIES.find((c) => c.id === targetCategory);
        return {
          ...p,
          category: targetCategory,
          categoryLabel: catObj ? catObj.name : targetCategory,
        };
      }

      return p;
    });
  };

  const previewProducts = getPreviewProducts();

  const handleApply = () => {
    const previewList = getPreviewProducts();
    let summaryMsg = '';

    if (activeTab === 'pricing') {
      const sign = priceAdjustmentValue >= 0 ? '+' : '';
      const unit = priceAdjustmentType === 'percent' ? '%' : ' ₽';
      summaryMsg = `Цены ${selectedProducts.length} товаров изменены на ${sign}${priceAdjustmentValue}${unit}`;
    } else if (activeTab === 'discounts') {
      if (isRemoveDiscountMode) {
        summaryMsg = `Сняты скидки с ${selectedProducts.length} выбранных товаров`;
      } else {
        summaryMsg = `Назначена сезонная скидка ${discountPercent}% для ${selectedProducts.length} товаров`;
      }
    } else if (activeTab === 'categories') {
      const catObj = CATEGORIES.find((c) => c.id === targetCategory);
      summaryMsg = `${selectedProducts.length} товаров перемещены в категорию "${catObj?.name || targetCategory}"`;
    }

    const callback = onApplyBulkChanges || onApplyChanges;
    if (callback) {
      callback(previewList, summaryMsg);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && selectedProducts.length > 0 && (
        <motion.div
          key="bulk-ops-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="bulk-ops-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="neu-modal rounded-3xl p-5 sm:p-6 max-w-2xl w-full text-[#2D3A4E] space-y-4 my-auto relative border border-white/80 max-h-[90vh] overflow-y-auto no-scrollbar z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-[#5F6ED0]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-[#2D3A4E]">
                      Массовые операции каталога
                    </h3>
                    <span className="neu-inset px-2.5 py-0.5 rounded-lg text-xs font-black text-[#5F6ED0] bg-[#E3E8EF]">
                      Выбрано: {selectedProducts.length} тов.
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5C6B80] font-medium">
                    Пакетное изменение цен, скидок и категорий в один клик
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Tabs Bar with Spring Indicator */}
            <div className="neu-inset rounded-2xl p-1.5 flex gap-1 bg-[#E3E8EF] text-xs">
              {[
                { id: 'pricing', label: 'Пакетная цена', icon: DollarSign },
                { id: 'discounts', label: 'Сезонные скидки', icon: Tag },
                { id: 'categories', label: 'Смена категории', icon: Layers },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as BulkTab)}
                    className={`relative flex-1 py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer select-none ${
                      isActive ? 'text-[#5F6ED0]' : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bulkTabPill"
                        className="absolute inset-0 rounded-xl neu-button bg-[#E3E8EF] z-0"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5 font-bold">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

        {/* Tab 1: Pricing */}
        {activeTab === 'pricing' && (
          <div className="neu-flat rounded-2xl p-4 bg-[#E3E8EF] space-y-3.5 border border-white/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wide">
                Режим корректировки цен
              </span>
              <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF]">
                <button
                  type="button"
                  onClick={() => setPriceAdjustmentType('percent')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    priceAdjustmentType === 'percent'
                      ? 'neu-pill-active font-black'
                      : 'text-[#5C6B80]'
                  }`}
                >
                  Процент (%)
                </button>
                <button
                  type="button"
                  onClick={() => setPriceAdjustmentType('fixed')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    priceAdjustmentType === 'fixed'
                      ? 'neu-pill-active font-black'
                      : 'text-[#5C6B80]'
                  }`}
                >
                  Рубли (₽)
                </button>
              </div>
            </div>

            {/* Input & Quick Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#5C6B80]">
                {priceAdjustmentType === 'percent'
                  ? 'Изменение цены в % (+ повышение, - снижение):'
                  : 'Изменение цены в ₽ (+ повышение, - снижение):'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={priceAdjustmentValue}
                  onChange={(e) => setPriceAdjustmentValue(Number(e.target.value))}
                  className="w-32 px-3 py-2 neu-inset rounded-xl text-sm font-black text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
                />
                <span className="text-xs font-black text-[#5F6ED0]">
                  {priceAdjustmentType === 'percent' ? '%' : '₽'}
                </span>
              </div>

              {/* Presets Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(priceAdjustmentType === 'percent' ? PRICE_PRESETS_PERCENT : PRICE_PRESETS_FIXED).map(
                  (val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPriceAdjustmentValue(val)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                        priceAdjustmentValue === val
                          ? 'neu-pill-active font-black'
                          : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                      }`}
                    >
                      {val > 0 ? `+${val}` : val}
                      {priceAdjustmentType === 'percent' ? '%' : ' ₽'}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Rounding Mode */}
            <div className="space-y-1.5 pt-2 border-t border-[#BAC5D5]/40">
              <label className="text-[11px] font-bold text-[#5C6B80]">
                Правило округления цен:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'round90', label: 'До 90 ₽ (маркетинг)' },
                  { id: 'round50', label: 'До 50 ₽' },
                  { id: 'round100', label: 'До 100 ₽' },
                  { id: 'none', label: 'Без округления' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPriceRounding(r.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all text-center cursor-pointer ${
                      priceRounding === r.id
                        ? 'neu-pill-active font-black'
                        : 'neu-button text-[#5C6B80]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Discounts */}
        {activeTab === 'discounts' && (
          <div className="neu-flat rounded-2xl p-4 bg-[#E3E8EF] space-y-3.5 border border-white/70">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wide">
                Сезонные скидки & Распродажа
              </span>
              <button
                type="button"
                onClick={() => setIsRemoveDiscountMode(!isRemoveDiscountMode)}
                className={`py-1.5 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all ${
                  isRemoveDiscountMode
                    ? 'neu-inset text-warning bg-warning-soft'
                    : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRemoveDiscountMode ? 'Режим: Снятие скидок' : 'Снять скидки'}</span>
              </button>
            </div>

            {!isRemoveDiscountMode ? (
              <>
                {/* Discount percentage presets */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-[#5C6B80]">
                    Размер скидки от текущей/базовой цены:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Math.max(1, Math.min(90, Number(e.target.value))))}
                      className="w-24 px-3 py-2 neu-inset rounded-xl text-sm font-black text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none"
                    />
                    <span className="text-sm font-black text-[#5F6ED0]">%</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {DISCOUNT_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountPercent(p)}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                          discountPercent === p
                            ? 'neu-pill-active font-black'
                            : 'neu-button text-[#5C6B80] hover:text-[#2D3A4E]'
                        }`}
                      >
                        -{p}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Badge assignment */}
                <div className="space-y-2 pt-2 border-t border-[#BAC5D5]/40">
                  <label className="text-[11px] font-bold text-[#5C6B80]">
                    Назначить бейдж акции на карточки:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {BADGE_PRESETS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setDiscountBadge(b)}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                          discountBadge === b
                            ? 'neu-pill-active font-black'
                            : 'neu-button text-[#5C6B80]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="neu-inset rounded-xl p-3 bg-[#E3E8EF] text-xs text-[#5C6B80] space-y-1">
                <p className="font-bold text-[#2D3A4E]">Снятие скидок:</p>
                <p>
                  Для всех выбранных товаров цены будут возвращены к базовым (`originalPrice`), а скидочные бейджи удалены.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Categories */}
        {activeTab === 'categories' && (
          <div className="neu-flat rounded-2xl p-4 bg-[#E3E8EF] space-y-3.5 border border-white/70">
            <span className="text-xs font-black text-[#2D3A4E] uppercase tracking-wide block">
              Перемещение товаров в новую категорию
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'linen', label: 'Лен' },
                { id: 'shirts', label: 'Рубашки' },
                { id: 'tshirts', label: 'Футболки & Поло' },
                { id: 'jackets', label: 'Куртки' },
                { id: 'trousers', label: 'Брюки' },
                { id: 'sweatshirts', label: 'Свитшоты' },
                { id: 'accessories', label: 'Аксессуары' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTargetCategory(cat.id)}
                  className={`p-3 rounded-2xl text-xs font-bold transition-all text-center cursor-pointer active:scale-95 flex flex-col items-center justify-center gap-1 ${
                    targetCategory === cat.id
                      ? 'neu-pill-active font-black'
                      : 'neu-button text-[#2D3A4E]'
                  }`}
                >
                  <span>{cat.label}</span>
                  {targetCategory === cat.id && (
                    <Check className="w-3.5 h-3.5 text-[#5F6ED0]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live Preview List */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase text-[#2D3A4E] tracking-wider flex items-center justify-between">
            <span>Предпросмотр изменений ({selectedProducts.length} позиций)</span>
            <span className="text-[11px] text-[#5C6B80] lowercase">
              было → станет
            </span>
          </label>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 no-scrollbar">
            {previewProducts.map((p, idx) => {
              const original = selectedProducts[idx];
              return (
                <div
                  key={p.id}
                  className="neu-inset rounded-xl p-2 sm:p-2.5 bg-[#E3E8EF] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <img
                      src={p.images?.[0] || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=100'}
                      alt={p.title}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 neu-flat"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-[#2D3A4E] truncate text-[11px]">
                        {p.title}
                      </p>
                      <p className="text-[10px] text-[#5C6B80] truncate">
                        Категория: {p.categoryLabel || p.category}
                      </p>
                    </div>
                  </div>

                  {/* Before -> After */}
                  <div className="flex items-center gap-2 shrink-0">
                    {activeTab === 'pricing' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#5C6B80] line-through">
                          {original.price.toLocaleString('ru-RU')} ₽
                        </span>
                        <ArrowRight className="w-3 h-3 text-[#5F6ED0]" />
                        <span className="font-black text-[#5F6ED0] text-xs">
                          {p.price.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>
                    )}

                    {activeTab === 'discounts' && (
                      <div className="flex items-center gap-1.5">
                        {isRemoveDiscountMode ? (
                          <span className="font-bold text-[#2D3A4E] text-xs">
                            {p.price.toLocaleString('ru-RU')} ₽ (базовая)
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] text-[#5C6B80] line-through">
                              {(p.originalPrice || original.price).toLocaleString('ru-RU')} ₽
                            </span>
                            <ArrowRight className="w-3 h-3 text-[#5F6ED0]" />
                            <span className="font-black text-[#5F6ED0] text-xs">
                              {p.price.toLocaleString('ru-RU')} ₽
                            </span>
                            {p.badge && (
                              <span className="neu-flat text-[9px] font-black px-1.5 py-0.5 rounded text-[#5F6ED0]">
                                {p.badge}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {activeTab === 'categories' && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[#5C6B80]">{original.categoryLabel}</span>
                        <ArrowRight className="w-3 h-3 text-[#5F6ED0]" />
                        <span className="font-black text-[#5F6ED0]">{p.categoryLabel}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-2 border-t border-[#BAC5D5]/50 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer text-center"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="w-full sm:w-auto py-2.5 px-5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <CheckCheck className="w-4 h-4 stroke-[2.5]" />
            <span>Применить ко всем {selectedProducts.length} товарам</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
