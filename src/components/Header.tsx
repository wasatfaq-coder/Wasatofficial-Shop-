import React from 'react';
import { Menu, ArrowLeft, Settings } from 'lucide-react';
import { ActiveTab } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  cartCount: number;
  onOpenDrawer: () => void;
  selectedProductTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  cartCount,
  onOpenDrawer,
  selectedProductTitle,
}) => {
  const isHome = activeTab === 'home';

  const getTitle = () => {
    switch (activeTab) {
      case 'home':
        return { main: 'ManStyle', sub: 'Мужская одежда' };
      case 'catalog':
        return { main: 'Каталог', sub: 'Поиск и фильтры' };
      case 'cart':
        return { main: 'Корзина', sub: `${cartCount} ${getDeclinedItems(cartCount)}` };
      case 'favorites':
        return { main: 'Избранное', sub: 'Ваши сохраненные товары' };
      case 'profile':
        return { main: 'Профиль', sub: 'Личный кабинет' };
      case 'product-detail':
        return { main: selectedProductTitle || 'Товар', sub: 'Детали товара' };
      case 'checkout':
        return { main: 'Оформление заказа', sub: 'Шаг 1 из 4' };
      case 'order-success':
        return { main: 'Заказ оформлен', sub: 'Успешно' };
      default:
        return { main: 'ManStyle', sub: 'Мужская одежда' };
    }
  };

  const titleInfo = getTitle();

  return (
    <header className="sticky top-0 z-30 pt-3 pb-3 px-4 bg-[#E3E8EF] transition-all duration-200">
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
        {/* Left Action Button */}
        {isHome ? (
          <button
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] transition-colors shrink-0"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>
        ) : (
          <button
            onClick={() => {
              if (activeTab === 'checkout') setActiveTab('cart');
              else if (activeTab === 'product-detail') setActiveTab('home');
              else setActiveTab('home');
            }}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] transition-colors shrink-0"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
        )}

        {/* Center Header Title */}
        <div className="text-center flex-1 min-w-0 px-2">
          <h1 className="text-lg font-bold text-[#2D3A4E] leading-tight truncate tracking-tight">
            {titleInfo.main}
          </h1>
          {titleInfo.sub && (
            <p className="text-xs font-semibold text-[#5C6B80] leading-none mt-0.5 truncate">
              {titleInfo.sub}
            </p>
          )}
        </div>

        {/* Right Action Button */}
        {activeTab === 'profile' ? (
          <button
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] transition-colors shrink-0"
            aria-label="Настройки"
          >
            <Settings className="w-5 h-5 stroke-[2]" />
          </button>
        ) : (
          /* Empty spacer to maintain symmetrical balance and center the title */
          <div className="w-11 h-11 shrink-0 pointer-events-none" />
        )}
      </div>
    </header>
  );
};

function getDeclinedItems(count: number): string {
  const abs = Math.abs(count);
  const rem100 = abs % 100;
  const rem10 = abs % 10;
  if (rem100 >= 11 && rem100 <= 19) return 'товаров';
  if (rem10 === 1) return 'товар';
  if (rem10 >= 2 && rem10 <= 4) return 'товара';
  return 'товаров';
}
