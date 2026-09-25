import React, { useState } from 'react';
import {
  Heart,
  Minus,
  Plus,
  X,
  Tag,
  ShoppingBag,
  ArrowRight,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  Check,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import { CartItem, Product, ActiveTab, AppliedPromoInfo } from '../types';
import { getVariantStock, getProductTotalStock } from '../utils/inventory';
import { CartRemoveConfirmModal } from '../components/CartRemoveConfirmModal';
import { QuickOrderModal } from '../components/QuickOrderModal';

interface CartScreenProps {
  cartItems: CartItem[];
  favorites: string[];
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onUpdateVariant?: (cartItemId: string, newColor: string, newSize: string) => void;
  onMoveToFavorites?: (item: CartItem) => void;
  onToggleFavorite: (product: Product, e: React.MouseEvent) => void;
  onClearCart: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  appliedPromo: AppliedPromoInfo | null;
  onApplyPromo: (code: string) => void;
  onOpenPromoModal: () => void;
  onRemovePromo: () => void;
  onCompleteOrder?: (orderData: any) => void;
  storefrontSettings?: import('../types').StorefrontSettings;
}

export const CartScreen: React.FC<CartScreenProps> = ({
  cartItems,
  favorites,
  onUpdateQuantity,
  onRemoveItem,
  onUpdateVariant,
  onMoveToFavorites,
  onToggleFavorite,
  onClearCart,
  setActiveTab,
  onShowToast,
  appliedPromo,
  onApplyPromo,
  onOpenPromoModal,
  onRemovePromo,
  onCompleteOrder,
  storefrontSettings,
}) => {
  const [promoInput, setPromoInput] = useState('');
  const [itemToRemove, setItemToRemove] = useState<CartItem | null>(null);
  const [editingVariantItemId, setEditingVariantItemId] = useState<string | null>(null);
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [isClearCartConfirmOpen, setIsClearCartConfirmOpen] = useState(false);

  // Calculate totals
  const rawSubtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );

  let discountAmount = 0;
  if (appliedPromo) {
    if (appliedPromo.discountType === 'fixed' && appliedPromo.discountValue) {
      discountAmount = Math.min(rawSubtotal, appliedPromo.discountValue);
    } else if (appliedPromo.discountPercent) {
      discountAmount = Math.round((rawSubtotal * appliedPromo.discountPercent) / 100);
    } else if (appliedPromo.discountValue) {
      discountAmount = Math.round((rawSubtotal * appliedPromo.discountValue) / 100);
    }
  }

  const freeThreshold = storefrontSettings?.freeDeliveryThreshold ?? 5000;
  const courierBasePrice = storefrontSettings?.courierDeliveryPrice ?? 350;
  const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const deliveryFee = rawSubtotal >= freeThreshold || rawSubtotal === 0 ? 0 : courierBasePrice;
  const remainingForFreeDelivery = Math.max(0, freeThreshold - rawSubtotal);
  const finalTotal = Math.max(0, rawSubtotal - discountAmount + deliveryFee);

  const handlePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    onApplyPromo(promoInput.trim());
    setPromoInput('');
  };

  const handleQuickOrderSuccess = (details: { name: string; phone: string; address: string }) => {
    if (onCompleteOrder) {
      onCompleteOrder({
        items: cartItems,
        contact: { name: details.name, phone: details.phone, email: '' },
        address: details.address || 'Уточняется оператором',
        deliveryMethod: 'Быстрый заказ (1 клик)',
        totalPrice: finalTotal,
        paymentMethod: 'При получении (наличные / картой)',
      });
    } else {
      onClearCart();
      onShowToast(`Быстрый заказ успешно оформлен! Менеджер свяжется с вами по номеру ${details.phone}`, 'success');
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="py-12 space-y-5 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 rounded-full neu-flat flex items-center justify-center mx-auto text-[#5C6B80]">
          <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#2D3A4E]">Ваша корзина пуста</h2>
          <p className="text-xs text-[#5C6B80] max-w-xs mx-auto">
            Выберите стильные новинки из нашего каталога мужской одежды
          </p>
        </div>
        <button
          onClick={() => setActiveTab('catalog')}
          className="neu-button-primary rounded-full px-6 py-3 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Перейти в каталог</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 animate-in fade-in duration-300">
      {/* Free Delivery Threshold Dynamic Progress Banner */}
      <div className="neu-flat rounded-2xl p-3.5 border border-white/60 space-y-2 bg-[#E3E8EF]">
        <div className="flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#5F6ED0]" />
            <span className="text-[#2D3A4E]">
              {remainingForFreeDelivery === 0
                ? 'Бесплатная доставка получена!'
                : `До бесплатной доставки: ${remainingForFreeDelivery.toLocaleString('ru-RU')} ₽`}
            </span>
          </div>
          <span className="text-[11px] font-black text-[#5F6ED0]">
            {Math.min(100, Math.round((rawSubtotal / freeThreshold) * 100))}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden neu-inset">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              remainingForFreeDelivery === 0 ? 'bg-emerald-500' : 'bg-[#5F6ED0]'
            }`}
            style={{ width: `${Math.min(100, (rawSubtotal / freeThreshold) * 100)}%` }}
          />
        </div>
      </div>

      {/* Header bar with item counter & clear cart button */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#2D3A4E]">Товаров в корзине:</span>
          <span className="neu-inset px-2.5 py-0.5 rounded-full text-xs font-black text-[#5F6ED0]">
            {totalItemsCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsClearCartConfirmOpen(true)}
          className="text-xs font-bold text-[#5C6B80] hover:text-[#7E525E] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Очистить всё</span>
        </button>
      </div>

      {/* List of Cart Item Cards */}
      <div className="space-y-3">
        {cartItems.map((item, itemIdx) => {
          const isFav = favorites.includes(item.product.id);
          const availableStock = getVariantStock(item.product, item.selectedColor, item.selectedSize);
          const isAtMaxStock = item.quantity >= availableStock;
          const isEditingVariant = editingVariantItemId === item.id;

          return (
            <div
              key={`cart-item-${item.id}-${itemIdx}`}
              className="neu-flat rounded-3xl p-3.5 border border-white/60 relative space-y-3 transition-all"
            >
              <div className="flex gap-3.5 items-center">
                {/* Thumbnail Image */}
                <div className="relative w-20 h-20 aspect-square rounded-2xl overflow-hidden neu-inset p-1.5 shrink-0 bg-[#E3E8EF] flex items-center justify-center">
                  <img
                    src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                    alt={item.product?.title || ''}
                    className="w-full h-full object-cover object-top rounded-xl"
                  />
                  {availableStock <= 2 && availableStock > 0 && (
                    <span className="absolute bottom-1 right-1 neu-flat bg-[#E3E8EF]/95 text-[#2D3A4E] text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-white/60">
                      {availableStock} шт.
                    </span>
                  )}
                </div>

                {/* Info Column */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-sm font-bold text-[#2D3A4E] truncate">
                      {item.product.title}
                    </h3>
                    {/* Favorite Heart Icon */}
                    <button
                      onClick={(e) => onToggleFavorite(item.product, e)}
                      className={`w-7 h-7 rounded-full neu-button flex items-center justify-center transition-colors shrink-0 ${
                        isFav ? 'text-[#5F6ED0]' : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                      }`}
                      title={isFav ? 'В избранном' : 'Добавить в избранное'}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'fill-[#5F6ED0] stroke-[#5F6ED0]' : 'stroke-[2]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Interactive Variant Badge (Color & Size Changer Trigger) */}
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingVariantItemId(isEditingVariant ? null : item.id)}
                      className="neu-inset px-2.5 py-0.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[#5F6ED0] hover:scale-102 transition-transform cursor-pointer"
                      title="Нажмите, чтобы изменить цвет или размер"
                    >
                      <span>{item.selectedColor} • {item.selectedSize}</span>
                      <SlidersHorizontal className="w-3 h-3 text-[#5F6ED0]" />
                    </button>

                    <span className="text-[10px] font-semibold text-[#5C6B80]">
                      {availableStock <= 2 ? `Осталось: ${availableStock} шт.` : `В наличии: ${availableStock} шт.`}
                    </span>
                  </div>

                  <p className="text-sm font-extrabold text-[#2D3A4E] pt-0.5">
                    {(item.product.price * item.quantity).toLocaleString('ru-RU')} ₽
                  </p>

                  {/* Quantity Controller & Delete Button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="neu-inset rounded-full p-0.5 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          if (item.quantity === 1) {
                            setItemToRemove(item);
                          } else {
                            onUpdateQuantity(item.id, item.quantity - 1);
                          }
                        }}
                        className="w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer"
                        title={item.quantity === 1 ? 'Удалить товар' : 'Уменьшить количество'}
                      >
                        <Minus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                      <span className="text-xs font-bold text-[#2D3A4E] w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          if (item.quantity < availableStock) {
                            onUpdateQuantity(item.id, item.quantity + 1);
                          } else {
                            onShowToast(`Достигнут максимум наличия (${availableStock} шт.)`, 'info');
                          }
                        }}
                        disabled={isAtMaxStock}
                        className={`w-6 h-6 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] transition-opacity cursor-pointer ${
                          isAtMaxStock ? 'opacity-30 cursor-not-allowed' : 'hover:text-[#5F6ED0]'
                        }`}
                        title={isAtMaxStock ? `На складе всего ${availableStock} шт.` : 'Добавить'}
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Trigger removal modal */}
                    <button
                      onClick={() => setItemToRemove(item)}
                      className="w-7 h-7 rounded-full neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#7E525E] transition-colors cursor-pointer"
                      title="Удалить товар"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive In-Cart Variant Selector Drawer */}
              {isEditingVariant && onUpdateVariant && (
                <div className="neu-inset rounded-2xl p-3.5 sm:p-4 bg-[#E3E8EF] space-y-3 border border-white/70 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg neu-flat bg-[#E3E8EF] flex items-center justify-center text-[#5F6ED0] shrink-0 border border-white/60">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider block">
                          Выбор вариации
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingVariantItemId(null)}
                      className="px-2.5 py-1 rounded-xl neu-button text-[10px] font-extrabold text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      Закрыть
                    </button>
                  </div>

                  {/* Colors */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#5C6B80]">Цвет:</span>
                      <span className="text-[10px] font-extrabold text-[#5F6ED0] neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                        {item.selectedColor}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.product.colors.map((c, cIdx) => {
                        const colorName = typeof c === 'string' ? c : c?.name || '';
                        const colorHex = typeof c === 'object' && c !== null ? (c as any).hex : undefined;
                        const isCurrent = colorName === item.selectedColor;
                        const colStock = getVariantStock(item.product, colorName, item.selectedSize);
                        const isOutOfStock = colStock <= 0;

                        return (
                          <button
                            key={`cart-${item.id}-col-${colorName || cIdx}-${cIdx}`}
                            type="button"
                            disabled={isOutOfStock}
                            onClick={() => {
                              onUpdateVariant(item.id, colorName, item.selectedSize);
                            }}
                            className={`min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer select-none active:scale-95 ${
                              isCurrent
                                ? 'neu-inset bg-[#E3E8EF] text-[#1E293B] border border-[#5F6ED0]/40 font-black'
                                : isOutOfStock
                                ? 'opacity-35 neu-inset bg-[#E3E8EF]/60 text-[#5C6B80] line-through cursor-not-allowed border border-transparent'
                                : 'neu-button text-[#2D3A4E] hover:text-[#1E293B]'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: colorHex || '#94A3B8' }}
                            />
                            <span className="leading-none">{colorName}</span>
                            {isCurrent && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0 text-[#5F6ED0]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sizes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#5C6B80]">Размер:</span>
                      <span className="text-[10px] font-extrabold text-[#5F6ED0] neu-inset px-2 py-0.5 rounded-lg bg-[#E3E8EF]">
                        {item.selectedSize}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.product.sizes.map((sz, szIdx) => {
                        const isCurrent = sz === item.selectedSize;
                        const szStock = getVariantStock(item.product, item.selectedColor, sz);
                        const isOutOfStock = szStock <= 0;

                        return (
                          <button
                            key={`cart-${item.id}-sz-${sz}-${szIdx}`}
                            type="button"
                            disabled={isOutOfStock}
                            onClick={() => {
                              onUpdateVariant(item.id, item.selectedColor, sz);
                            }}
                            className={`min-w-[42px] min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                              isCurrent
                                ? 'neu-inset bg-[#E3E8EF] text-[#1E293B] border border-[#5F6ED0]/40 font-black'
                                : isOutOfStock
                                ? 'opacity-35 neu-inset bg-[#E3E8EF]/60 text-[#5C6B80] line-through cursor-not-allowed border border-transparent'
                                : 'neu-button text-[#2D3A4E] hover:text-[#1E293B]'
                            }`}
                          >
                            <span>{sz}</span>
                            {szStock <= 2 && szStock > 0 && (
                              <span className={`text-[10px] font-bold ${isCurrent ? 'text-amber-700' : 'text-amber-600'}`}>
                                ({szStock})
                              </span>
                            )}
                            {isCurrent && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0 text-[#5F6ED0]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stock footer & Confirm Button */}
                  <div className="pt-2 border-t border-[#BAC5D5]/50 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#5C6B80] font-bold min-w-0">
                      <span className="shrink-0">Наличие:</span>
                      <span
                        className={`truncate font-extrabold ${
                          availableStock === 0
                            ? 'text-[#7E525E]'
                            : availableStock <= 2
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {availableStock === 0
                          ? 'Нет в наличии'
                          : availableStock <= 2
                          ? `Осталось мало (${availableStock} шт.)`
                          : `${availableStock} шт. на складе`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingVariantItemId(null)}
                      className="px-3 py-1.5 rounded-xl neu-button text-[10px] font-black text-[#5F6ED0] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      Готово
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Promo Code Card with Modal Trigger */}
      <div className="neu-flat rounded-2xl p-3 border border-white/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onOpenPromoModal}
            className="flex-1 flex items-center justify-between text-xs font-bold text-[#2D3A4E] hover:text-[#5F6ED0] transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] group-hover:scale-105 transition-transform">
                <Tag className="w-3.5 h-3.5 stroke-[2.2]" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-[#2D3A4E]">
                  {appliedPromo ? `Промокод: ${appliedPromo.code}` : 'Добавить купоны и промокоды'}
                </p>
                <p className="text-[10px] text-[#5C6B80] font-normal">
                  {appliedPromo ? `Скидка ${appliedPromo.discountPercent}% применена` : 'Есть доступные купоны'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-extrabold text-[#5F6ED0] neu-inset px-2.5 py-1 rounded-xl transition-all">
              {appliedPromo ? 'Изменить' : 'Выбрать'}
            </span>
          </button>
        </div>

        <form onSubmit={handlePromoSubmit} className="flex items-center gap-2 pt-1 border-t border-[#BAC5D5]/50">
          <div className="relative flex-1">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder={appliedPromo ? `Активен: ${appliedPromo.code}` : 'Или введите код вручную'}
              className="w-full neu-inset rounded-xl py-2 px-3 text-xs font-medium text-[#2D3A4E] placeholder-[#5C6B80]/70 focus:outline-none uppercase"
            />
          </div>
          <button
            type="submit"
            className="neu-button rounded-xl px-3.5 py-2 text-xs font-bold text-[#2D3A4E] hover:text-[#5F6ED0] shrink-0 cursor-pointer"
          >
            Применить
          </button>
        </form>
      </div>

      {/* Applied Promo discount pill */}
      {appliedPromo && (
        <div className="neu-inset rounded-xl p-2.5 px-3.5 flex items-center justify-between text-xs font-bold text-[#5F6ED0] border border-[#5F6ED0]/30 bg-[#E3E8EF]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5F6ED0]" />
            <span>
              Промокод {appliedPromo.code} (
              {appliedPromo.discountType === 'fixed'
                ? `-${(appliedPromo.discountValue || 0).toLocaleString('ru-RU')} ₽`
                : `-${appliedPromo.discountValue || appliedPromo.discountPercent}%`}
              )
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>-{discountAmount.toLocaleString('ru-RU')} ₽</span>
            <button
              type="button"
              onClick={onRemovePromo}
              className="text-[10px] font-extrabold text-[#5C6B80] hover:text-[#7E525E] ml-1 underline cursor-pointer"
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      {/* Summary Cost Card */}
      <div className="neu-flat rounded-3xl p-3.5 border border-white/80 space-y-3">
        <div className="neu-inset rounded-2xl p-4 space-y-2.5 bg-[#E3E8EF]">
          <div className="space-y-2 text-xs font-semibold text-[#5C6B80]">
            <div className="flex justify-between">
              <span>Товары ({totalItemsCount})</span>
              <span className="text-[#2D3A4E] font-bold">{rawSubtotal.toLocaleString('ru-RU')} ₽</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-[#5F6ED0] font-bold">
                <span>Скидка</span>
                <span>-{discountAmount.toLocaleString('ru-RU')} ₽</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>Доставка</span>
              <span className={deliveryFee === 0 ? 'text-emerald-600 font-bold' : 'text-[#2D3A4E]'}>
                {deliveryFee === 0 ? 'Бесплатно' : `${deliveryFee} ₽`}
              </span>
            </div>
          </div>

          <div className="border-t border-[#BAC5D5]/60 pt-2.5 flex items-baseline justify-between">
            <span className="text-base font-bold text-[#2D3A4E]">Итого</span>
            <span className="text-xl font-extrabold text-[#2D3A4E]">
              {finalTotal.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        {/* Action Buttons: 1-Click Quick Order + Full Checkout */}
        <div className="space-y-2">
          <button
            onClick={() => setActiveTab('checkout')}
            className="w-full py-3.5 rounded-2xl neu-button-primary font-bold text-sm flex items-center justify-center gap-2 transition-all btn-confirm-order active:neu-inset-deep active:scale-[0.98] cursor-pointer"
          >
            <span>Оформить заказ</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsQuickOrderOpen(true)}
            className="w-full py-2.5 rounded-2xl neu-button font-bold text-xs text-[#5F6ED0] flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Быстрый заказ в 1 клик</span>
          </button>
        </div>
      </div>

      {/* Cart Removal Confirmation Modal */}
      <CartRemoveConfirmModal
        isOpen={!!itemToRemove}
        item={itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirmRemove={(id) => {
          onRemoveItem(id);
          setItemToRemove(null);
        }}
        onMoveToFavorites={(item) => {
          if (onMoveToFavorites) {
            onMoveToFavorites(item);
          } else {
            onToggleFavorite(item.product, {} as any);
            onRemoveItem(item.id);
          }
          setItemToRemove(null);
        }}
      />

      {/* Clear Cart Confirmation Modal */}
      {isClearCartConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm neu-modal rounded-3xl p-5 space-y-4 border border-white/80">
            <div className="flex items-center gap-2 text-[#7E525E] pb-2 border-b border-[#BAC5D5]/50">
              <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-[#7E525E]" />
              </div>
              <h3 className="text-sm font-extrabold text-[#2D3A4E]">Очистка всей корзины</h3>
            </div>
            <p className="text-xs text-[#5C6B80] leading-relaxed">
              Вы уверены, что хотите удалить все <strong>{totalItemsCount}</strong> поз. из корзины?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearCartConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl neu-button text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  setIsClearCartConfirmOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl neu-button text-xs font-black text-[#7E525E] hover:text-[#2D3A4E] cursor-pointer"
              >
                Да, очистить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick 1-Click Order Modal for Entire Cart */}
      <QuickOrderModal
        isOpen={isQuickOrderOpen}
        onClose={() => setIsQuickOrderOpen(false)}
        cartItems={cartItems}
        totalPrice={finalTotal}
        onSuccess={handleQuickOrderSuccess}
      />
    </div>
  );
};
