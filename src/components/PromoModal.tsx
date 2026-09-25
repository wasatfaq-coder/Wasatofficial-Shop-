import React, { useState } from 'react';
import {
  X,
  Tag,
  Ticket,
  Clock,
  Check,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Copy,
  Layers,
  Users,
  Share2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromoCode, CartItem, AppliedPromoInfo } from '../types';
import { INITIAL_PROMO_CODES } from '../data/marketingAndSupport';
import { copyToClipboard } from '../utils/clipboard';

interface PromoModalProps {
  isOpen: boolean;
  onClose: () => void;
  appliedPromo: AppliedPromoInfo | null;
  onApplyPromo: (code: string) => boolean;
  onRemovePromo: () => void;
  cartSubtotal?: number;
  cartItems?: CartItem[];
  promos?: PromoCode[];
}

export const PromoModal: React.FC<PromoModalProps> = ({
  isOpen,
  onClose,
  appliedPromo,
  onApplyPromo,
  onRemovePromo,
  cartSubtotal = 0,
  cartItems = [],
  promos = INITIAL_PROMO_CODES,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activePromos = promos.filter((p) => p.active);

  const getCategoryName = (catId: string) => {
    switch (catId) {
      case 'shirts':
        return 'Рубашки';
      case 'tshirts':
        return 'Футболки';
      case 'jackets':
        return 'Куртки';
      case 'trousers':
        return 'Брюки';
      case 'sweatshirts':
        return 'Свитшоты';
      default:
        return catId;
    }
  };

  const handleApply = (codeToApply: string) => {
    setErrorMessage('');
    const coupon = promos.find((c) => c.code.toUpperCase() === codeToApply.toUpperCase());

    if (!coupon) {
      setErrorMessage('Промокод не найден');
      return;
    }

    if (!coupon.active) {
      setErrorMessage('Срок действия промокода приостановлен или завершен');
      return;
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      setErrorMessage('Лимит использований данного промокода исчерпан');
      return;
    }

    if (coupon.minOrderAmount && cartSubtotal < coupon.minOrderAmount) {
      setErrorMessage(
        `Промокод ${coupon.code} действует при заказе от ${coupon.minOrderAmount.toLocaleString('ru-RU')} ₽`
      );
      return;
    }

    if (coupon.applicableCategories && coupon.applicableCategories.length > 0 && cartItems.length > 0) {
      const hasMatchingCategory = cartItems.some((item) =>
        coupon.applicableCategories?.includes(item.product.category)
      );
      if (!hasMatchingCategory) {
        const catNames = coupon.applicableCategories.map(getCategoryName).join(', ');
        setErrorMessage(`Промокод ${coupon.code} действует только на категории: ${catNames}`);
        return;
      }
    }

    if (coupon.applicableProductIds && coupon.applicableProductIds.length > 0 && cartItems.length > 0) {
      const hasMatchingProduct = cartItems.some((item) =>
        coupon.applicableProductIds?.includes(item.product.id)
      );
      if (!hasMatchingProduct) {
        setErrorMessage(`Промокод ${coupon.code} действует только на определенные товары`);
        return;
      }
    }

    const success = onApplyPromo(codeToApply);
    if (success) {
      onClose();
    } else {
      setErrorMessage('Не удалось применить промокод');
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    handleApply(customInput.trim());
  };

  const handleCopyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="promo-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="promo-modal"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md neu-modal rounded-3xl p-4 sm:p-5 border border-white/80 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar bg-[#E3E8EF] z-10"
          >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#BAC5D5]/50">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-2xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <Ticket className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <h3 className="text-base font-extrabold text-[#2D3A4E] leading-tight whitespace-nowrap">
                    Промокоды и купоны
                  </h3>
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full neu-inset text-[#5F6ED0] whitespace-nowrap shrink-0">
                    {activePromos.length} активных
                  </span>
                </div>
                <p className="text-[11px] text-[#5C6B80] font-medium truncate">
                  Процентные (-15%) и фиксированные (-500 ₽) скидки
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] transition-all active:scale-90 shrink-0 cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Error Banner if any */}
          {errorMessage && (
            <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] border border-[#7E525E]/40 text-[#7E525E] text-xs flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-[#7E525E] shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Active Applied Promo Status (If any applied) */}
          {appliedPromo && (
            <div className="neu-inset-deep rounded-2xl p-3.5 border border-[#5F6ED0]/40 flex items-center justify-between bg-[#E3E8EF]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neu-button-accent text-white font-black text-xs flex items-center justify-center shrink-0">
                  {appliedPromo.discountType === 'fixed'
                    ? `-${(appliedPromo.discountValue || 0).toLocaleString('ru-RU')} ₽`
                    : `-${appliedPromo.discountValue || appliedPromo.discountPercent}%`}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-[#5F6ED0]">
                      {appliedPromo.code}
                    </span>
                    <span className="text-[10px] font-bold text-[#5F6ED0] neu-inset px-1.5 py-0.5 rounded-md">
                      Применен
                    </span>
                  </div>
                  <p className="text-[10px] text-[#5C6B80] font-medium">
                    {appliedPromo.discountType === 'fixed'
                      ? `Скидка ${appliedPromo.discountValue?.toLocaleString('ru-RU')} ₽ учтена`
                      : `Скидка ${appliedPromo.discountPercent}% учтена в расчете заказа`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onRemovePromo}
                className="text-[11px] font-bold text-[#5C6B80] hover:text-[#7E525E] underline px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Отменить
              </button>
            </div>
          )}

          {/* List of Coupons */}
          <div className="space-y-3 pt-1">
            <h4 className="text-xs font-bold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#5F6ED0]" />
              <span>Доступные купоны со скидкой</span>
            </h4>

            <div className="space-y-3">
              {activePromos.map((coupon) => {
                const isCurrentActive = appliedPromo?.code.toUpperCase() === coupon.code;
                const isFixed = coupon.discountType === 'fixed';
                const discountLabel = isFixed
                  ? `-${(coupon.discountValue || 0).toLocaleString('ru-RU')} ₽`
                  : `-${coupon.discountValue || coupon.discountPercent}%`;

                const isMinOrderNotMet =
                  Boolean(coupon.minOrderAmount && cartSubtotal > 0 && cartSubtotal < coupon.minOrderAmount);

                return (
                  <div
                    key={coupon.id}
                    className={`rounded-2xl p-4 transition-all duration-200 relative overflow-hidden border ${
                      isCurrentActive
                        ? 'neu-inset-deep border-[#5F6ED0]/50'
                        : 'neu-flat border-white/80'
                    }`}
                  >
                    {/* Badge top right */}
                    {coupon.badgeText && (
                      <div className="absolute top-3 right-3 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full neu-button-accent text-white flex items-center gap-1 whitespace-nowrap shrink-0">
                        <Tag className="w-2.5 h-2.5" />
                        <span>{coupon.badgeText}</span>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Left Discount Box */}
                      <div className="w-12 h-12 rounded-2xl neu-inset flex flex-col items-center justify-center shrink-0 border border-white/60">
                        <span
                          className={`text-xs font-black leading-none ${
                            isFixed ? 'text-amber-600 text-[11px]' : 'text-[#5F6ED0]'
                          }`}
                        >
                          {discountLabel}
                        </span>
                        <span className="text-[8px] font-bold text-[#5C6B80] uppercase mt-0.5">
                          скидка
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-12">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-[#2D3A4E] tracking-wide font-mono neu-inset px-2 py-0.5 rounded-lg border border-white/40">
                            {coupon.code}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(coupon.code, e)}
                            className="text-[#5C6B80] hover:text-[#5F6ED0] text-[10px] flex items-center gap-0.5 font-bold transition-colors cursor-pointer"
                            title="Скопировать код"
                          >
                            {copiedCode === coupon.code ? (
                              <span className="text-emerald-600 font-black">Скопировано!</span>
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        <p className="text-xs font-bold text-[#2D3A4E] mt-1">
                          {coupon.title}
                        </p>
                        <p className="text-[11px] text-[#5C6B80] leading-snug mt-0.5">
                          {coupon.description}
                        </p>

                        {coupon.isReferral && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#5F6ED0] mt-1">
                            <Share2 className="w-3 h-3" />
                            Блогер: {coupon.partnerName}
                          </span>
                        )}

                        {/* Rules / Min Order badge */}
                        <div className="flex items-center gap-2 flex-wrap pt-2 text-[10px] text-[#5C6B80]">
                          {coupon.minOrderAmount ? (
                            <span
                              className={`neu-inset px-2 py-0.5 rounded-md font-semibold ${
                                isMinOrderNotMet ? 'text-amber-700 font-bold' : 'text-[#5F6ED0]'
                              }`}
                            >
                              От {coupon.minOrderAmount.toLocaleString('ru-RU')} ₽
                            </span>
                          ) : (
                            <span className="text-[#5C6B80]">Без мин. чека</span>
                          )}

                          {coupon.expiresAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#5F6ED0]" />
                              <span>До {coupon.expiresAt}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-3 pt-2.5 border-t border-[#BAC5D5]/40 flex items-center justify-between gap-2">
                      {isMinOrderNotMet ? (
                        <span className="text-[10px] text-amber-700 font-bold">
                          Добавьте еще товаров до {coupon.minOrderAmount?.toLocaleString('ru-RU')} ₽
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#5C6B80]">
                          {isCurrentActive ? 'Купон уже применен' : 'Готов к применению'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleApply(coupon.code)}
                        disabled={isCurrentActive}
                        className={`py-1.5 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                          isCurrentActive
                            ? 'neu-inset text-emerald-700 opacity-80 cursor-default'
                            : 'neu-button text-[#5F6ED0] hover:text-[#2D3A4E] hover:scale-105 active:scale-95'
                        }`}
                      >
                        {isCurrentActive ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Применен</span>
                          </>
                        ) : (
                          <>
                            <span>Применить</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Manual Input Form */}
          <div className="pt-2 border-t border-[#BAC5D5]/50 space-y-2">
            <label className="text-[11px] font-extrabold text-[#2D3A4E] block">
              Ввести секретный промокод вручную:
            </label>
            <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
                placeholder="ВВЕДИТЕ КОД (НАПРИМЕР, MANSTYLE20)"
                className="flex-1 px-3.5 py-2.5 neu-inset rounded-2xl text-xs uppercase font-bold text-[#2D3A4E] placeholder:text-[#5C6B80]/70 focus:outline-none bg-[#E3E8EF]"
              />
              <button
                type="submit"
                disabled={!customInput.trim()}
                className="py-2.5 px-4 rounded-2xl neu-button-accent text-white font-black text-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                Применить
              </button>
            </form>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
