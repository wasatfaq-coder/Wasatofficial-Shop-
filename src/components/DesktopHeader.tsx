import React from 'react';
import { Grid, Heart, Menu, ShoppingBag, User } from 'lucide-react';
import type { ActiveTab, Product, StoreCategory } from '../types';
import { AutocompleteSearch } from './AutocompleteSearch';

interface DesktopHeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  storeName: string;
  cartCount: number;
  favoritesCount: number;
  onOpenDrawer: () => void;
  /** Search shared with the catalog: typing here filters the catalog */
  searchQuery: string;
  onSearchChange: (query: string) => void;
  products: Product[];
  categories: StoreCategory[];
  onSelectProduct: (product: Product) => void;
  onSelectCategory: (categoryId: string) => void;
}

const LINKS: { tab: ActiveTab; label: string; icon: typeof Grid; count?: 'cart' | 'favorites' }[] = [
  { tab: 'catalog', label: 'Каталог', icon: Grid },
  { tab: 'favorites', label: 'Избранное', icon: Heart, count: 'favorites' },
  { tab: 'cart', label: 'Корзина', icon: ShoppingBag, count: 'cart' },
  { tab: 'profile', label: 'Профиль', icon: User },
];

/**
 * Top bar on a computer (lg and wider) instead of the phone's bottom menu: the store name (home), search,
 * the sections with their counts and the menu. Hidden on phones and tablets.
 */
export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  activeTab,
  setActiveTab,
  storeName,
  cartCount,
  favoritesCount,
  onOpenDrawer,
  searchQuery,
  onSearchChange,
  products,
  categories,
  onSelectProduct,
  onSelectCategory,
}) => {
  const current = (tab: ActiveTab) =>
    activeTab === tab || (tab === 'cart' && activeTab === 'checkout') || (tab === 'catalog' && activeTab === 'product-detail');

  return (
    <header className="hidden lg:block sticky top-0 z-30 bg-[#E3E8EF] border-b border-[#BAC5D5]/50">
      <div className="px-6 py-3 flex items-center gap-5">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent shrink-0 cursor-pointer"
          aria-label="Открыть меню"
          title="Меню"
        >
          <Menu className="w-5 h-5" />
        </button>
        <a
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
          }}
          className="font-display text-xl font-extrabold text-[#2D3A4E] tracking-tight whitespace-nowrap hover:text-accent shrink-0"
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          {storeName}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold ml-1 align-baseline" aria-hidden="true" />
        </a>

        <div className="flex-1 min-w-0 max-w-xl">
          <AutocompleteSearch
            categories={categories}
            products={products}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            onSelectProduct={onSelectProduct}
            onSelectCategory={(categoryId) => {
              onSelectCategory(categoryId);
              setActiveTab('catalog');
            }}
            onSearchSubmit={() => setActiveTab('catalog')}
            placeholder="Поиск по товарам"
          />
        </div>

        <nav aria-label="Разделы магазина" className="ml-auto flex items-center gap-2 shrink-0">
          {LINKS.map(({ tab, label, icon: Icon, count }) => {
            const isCurrent = current(tab);
            const value = count === 'cart' ? cartCount : count === 'favorites' ? favoritesCount : 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`h-10 px-3.5 rounded-xl flex items-center gap-2 text-sm cursor-pointer select-none ${
                  isCurrent ? 'neu-pill-active text-accent font-bold' : 'neu-button text-[#2D3A4E] hover:text-accent font-semibold'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
                {value > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-accent text-white text-[11px] font-extrabold leading-5 text-center">
                    {value > 99 ? '99+' : value}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
