import React from 'react';
import { Menu, ArrowLeft } from 'lucide-react';
import { STORE_NAME_DEFAULT } from '../utils/storeContacts';
import { ActiveTab } from '../types';
import { pluralRu } from '../utils/pluralize';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  /** «Назад»: the previous screen of this visit (browser history) */
  onBack?: () => void;
  cartCount: number;
  onOpenDrawer: () => void;
  selectedProductTitle?: string;
  storeName?: string;
}

/** Title and subtitle of a screen: the phone's top bar and the computer's title row */
export function screenTitle(
  activeTab: ActiveTab,
  cartCount: number,
  storeName: string,
  selectedProductTitle?: string
): { main: string; sub: string } {
  switch (activeTab) {
    case 'catalog':
      return { main: 'Каталог', sub: '' };
    case 'cart':
      return { main: 'Корзина', sub: `${cartCount} ${pluralRu(cartCount, ['товар', 'товара', 'товаров'])}` };
    case 'favorites':
      return { main: 'Избранное', sub: '' };
    case 'profile':
      return { main: 'Профиль', sub: '' };
    case 'product-detail':
      return { main: selectedProductTitle || 'Товар', sub: '' };
    case 'checkout':
      return { main: 'Оформление заказа', sub: `${cartCount} ${pluralRu(cartCount, ['товар', 'товара', 'товаров'])}` };
    case 'order-success':
      return { main: 'Заказ оформлен', sub: '' };
    case 'offer':
      return { main: 'Оферта', sub: 'Условия продажи' };
    case 'privacy':
      return { main: 'Персональные данные', sub: 'Политика обработки' };
    default:
      return { main: storeName, sub: 'Мужская одежда' };
  }
}

/**
 * Computer (lg): «Назад» and the screen's title at the top of <main> (the top bar is DesktopHeader).
 * Inside <main>, so the page has one banner landmark.
 */
export const DesktopTitleRow: React.FC<{ title: { main: string; sub: string }; onBack: () => void }> = ({ title, onBack }) => (
  <div className="hidden lg:flex items-center gap-4 pb-4">
    <button
      type="button"
      onClick={onBack}
      className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent shrink-0 cursor-pointer"
      aria-label="Назад"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
    <div className="min-w-0">
      {/* data-screen-heading: a new screen moves the focus here (useScreenHeadingFocus) */}
      <h1 data-screen-heading tabIndex={-1} className="text-2xl font-extrabold text-[#2D3A4E] leading-tight truncate tracking-tight">
        {title.main}
      </h1>
      {title.sub && <p className="text-xs font-semibold text-[#4E5C70] truncate">{title.sub}</p>}
    </div>
  </div>
);

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onBack,
  cartCount,
  onOpenDrawer,
  selectedProductTitle,
  storeName = STORE_NAME_DEFAULT,
}) => {
  const isHome = activeTab === 'home';

  const titleInfo = screenTitle(activeTab, cartCount, storeName, selectedProductTitle);

  return (
    <header className="sticky top-0 z-30 pt-3 pb-3 px-4 bg-[#E3E8EF] transition-all duration-200 lg:hidden">
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
        {/* Left Action Button */}
        {isHome ? (
          <button
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent transition-colors shrink-0"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>
        ) : (
          <button
            onClick={() => {
              if (onBack) onBack();
              else setActiveTab(activeTab === 'checkout' ? 'cart' : 'home');
            }}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent transition-colors shrink-0"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
        )}

        {/* Center Header Title */}
        <div className="text-center flex-1 min-w-0 px-2">
          {/* A step smaller on 320 px, so a short product name fits; the full one is on the product card */}
          <h1
            data-screen-heading
            tabIndex={-1}
            className="text-lg max-[359px]:text-base font-extrabold text-[#2D3A4E] leading-tight truncate tracking-tight"
          >
            {titleInfo.main}
            {/* Brand mark: a gold dot after the store name */}
            {titleInfo.main === storeName && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold ml-1 align-baseline" aria-hidden="true" />
            )}
          </h1>
          {titleInfo.sub && (
            <p className="text-xs font-semibold text-[#4E5C70] leading-none mt-0.5 truncate">
              {titleInfo.sub}
            </p>
          )}
        </div>

        {/* Right Action Button */}
        {activeTab === 'profile' ? (
          <button
            onClick={onOpenDrawer}
            className="w-11 h-11 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent transition-colors shrink-0"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5 stroke-[2]" />
          </button>
        ) : (
          /* Empty spacer to maintain symmetrical balance and center the title */
          <div className="w-11 h-11 shrink-0 pointer-events-none" />
        )}
      </div>
    </header>
  );
};

