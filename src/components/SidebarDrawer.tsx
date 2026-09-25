import React from 'react';
import {
  X,
  Home,
  Grid,
  ShoppingBag,
  Heart,
  User,
  Headphones,
  Info,
  ChevronRight,
  PhoneCall,
  Ruler,
  MessageSquare,
  Sparkles,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, StorefrontSettings } from '../types';
import { publicSetting } from '../utils/storeContacts';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  activeTab?: ActiveTab;
  cartCount: number;
  favoritesCount: number;
  onOpenMySizes?: () => void;
  onOpenFilters?: () => void;
  onOpenSupportChat?: () => void;
  onOpenBrandDetails?: () => void;
  storefrontSettings?: StorefrontSettings;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  setActiveTab,
  activeTab,
  cartCount,
  favoritesCount,
  onOpenMySizes,
  onOpenFilters,
  onOpenSupportChat,
  onOpenBrandDetails,
  storefrontSettings,
}) => {
  const navigateTo = (tab: ActiveTab) => {
    setActiveTab(tab);
    onClose();
  };

  // Demo template phone is never shown to customers (see storeContacts.ts)
  const phone = publicSetting(storefrontSettings?.phone);
  const storeName = storefrontSettings?.storeName || 'MANSTYLE';
  const storeSlogan = storefrontSettings?.storeSlogan || 'Премиальная мужская одежда';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="sidebar-drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          className="fixed inset-0 z-50 flex pointer-events-auto"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/45 backdrop-blur-xs cursor-pointer"
          />

          {/* Drawer Container */}
          <motion.div
            key="drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-4/5 max-w-xs h-full neu-modal p-5 sm:p-6 flex flex-col justify-between z-10 border-r border-white/60 overflow-hidden bg-[#E3E8EF]"
          >
            <div className="flex flex-col min-h-0 flex-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#BAC5D5]/60 shrink-0">
                <div>
                  <h2 className="text-xl font-black text-[#2D3A4E] tracking-tight">{storeName}</h2>
                  <p className="text-[11px] text-[#5C6B80] font-semibold line-clamp-1">{storeSlogan}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer"
                >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>

          {/* Navigation: the current section is pressed in */}
          <nav className="my-4 flex flex-col gap-2.5 overflow-y-auto pr-1 custom-scrollbar flex-1">
            <button
              onClick={() => navigateTo('home')}
              className={`rounded-2xl p-3 px-4 flex items-center justify-between font-medium transition-all cursor-pointer active:scale-[0.98] group ${
                activeTab === 'home'
                  ? 'neu-pill-active font-bold'
                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Home className="w-5 h-5 text-[#5F6ED0] group-hover:scale-105 transition-transform" />
                <span className="group-hover:text-[#5F6ED0] transition-colors">Главная</span>
              </div>
              <ChevronRight
                className={`w-4 h-4 transition-colors ${
                  activeTab === 'home'
                    ? 'text-[#5F6ED0]'
                    : 'text-[#5C6B80] group-hover:text-[#5F6ED0]'
                }`}
              />
            </button>

            <button
              onClick={() => navigateTo('catalog')}
              className={`rounded-2xl p-3 px-4 flex items-center justify-between font-medium transition-all cursor-pointer active:scale-[0.98] group ${
                activeTab === 'catalog'
                  ? 'neu-pill-active font-bold'
                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Grid className="w-5 h-5 text-[#5F6ED0] group-hover:scale-105 transition-transform" />
                <span className="group-hover:text-[#5F6ED0] transition-colors">Каталог товаров</span>
              </div>
              <ChevronRight
                className={`w-4 h-4 transition-colors ${
                  activeTab === 'catalog'
                    ? 'text-[#5F6ED0]'
                    : 'text-[#5C6B80] group-hover:text-[#5F6ED0]'
                }`}
              />
            </button>

            <button
              onClick={() => {
                onClose();
                if (onOpenFilters) onOpenFilters();
              }}
              className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 px-4 flex items-center justify-between text-[#2D3A4E] font-medium hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="w-5 h-5 text-[#5F6ED0] stroke-[2] group-hover:scale-105 transition-transform" />
                <span className="font-bold text-[#2D3A4E] group-hover:text-[#5F6ED0] transition-colors">
                  Фильтры товаров
                </span>
              </div>
              <span className="neu-inset-deep text-[#5F6ED0] text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide border border-[#5F6ED0]/30">
                Поиск
              </span>
            </button>

            <button
              onClick={() => {
                onClose();
                if (onOpenMySizes) onOpenMySizes();
              }}
              className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 px-4 flex items-center justify-between text-[#2D3A4E] font-medium hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <Ruler className="w-5 h-5 text-[#5F6ED0] stroke-[2] group-hover:scale-105 transition-transform" />
                <span className="font-bold text-[#2D3A4E] group-hover:text-[#5F6ED0] transition-colors">
                  Мои размеры
                </span>
              </div>
              <span className="neu-fill-accent text-white text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wide">
                Подбор
              </span>
            </button>

            <button
              onClick={() => navigateTo('cart')}
              className={`rounded-2xl p-3 px-4 flex items-center justify-between font-medium transition-all cursor-pointer active:scale-[0.98] group ${
                activeTab === 'cart'
                  ? 'neu-pill-active font-bold'
                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-5 h-5 text-[#5F6ED0] group-hover:scale-105 transition-transform" />
                <span className="group-hover:text-[#5F6ED0] transition-colors">Корзина</span>
              </div>
              {cartCount > 0 ? (
                <span className="neu-fill-accent text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {cartCount}
                </span>
              ) : (
                <ChevronRight
                  className={`w-4 h-4 transition-colors ${
                    activeTab === 'cart'
                      ? 'text-[#5F6ED0]'
                      : 'text-[#5C6B80] group-hover:text-[#5F6ED0]'
                  }`}
                />
              )}
            </button>

            <button
              onClick={() => navigateTo('favorites')}
              className={`rounded-2xl p-3 px-4 flex items-center justify-between font-medium transition-all cursor-pointer active:scale-[0.98] group ${
                activeTab === 'favorites'
                  ? 'neu-pill-active font-bold'
                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-rose-500 group-hover:scale-105 transition-transform" />
                <span className="group-hover:text-[#5F6ED0] transition-colors">Избранное</span>
              </div>
              {favoritesCount > 0 ? (
                <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-xs">
                  {favoritesCount}
                </span>
              ) : (
                <ChevronRight
                  className={`w-4 h-4 transition-colors ${
                    activeTab === 'favorites'
                      ? 'text-[#5F6ED0]'
                      : 'text-[#5C6B80] group-hover:text-[#5F6ED0]'
                  }`}
                />
              )}
            </button>

            <button
              onClick={() => navigateTo('profile')}
              className={`rounded-2xl p-3 px-4 flex items-center justify-between font-medium transition-all cursor-pointer active:scale-[0.98] group ${
                activeTab === 'profile'
                  ? 'neu-pill-active font-bold'
                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-[#5F6ED0] group-hover:scale-105 transition-transform" />
                <span className="group-hover:text-[#5F6ED0] transition-colors">
                  Профиль
                </span>
              </div>
              <ChevronRight
                className={`w-4 h-4 transition-colors ${
                  activeTab === 'profile'
                    ? 'text-[#5F6ED0]'
                    : 'text-[#5C6B80] group-hover:text-[#5F6ED0]'
                }`}
              />
            </button>

            {/* Brand, Requisites & Concierge Button */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenBrandDetails) onOpenBrandDetails();
              }}
              className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 px-4 flex items-center justify-between text-[#2D3A4E] font-medium hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Building2 className="w-5 h-5 text-[#5F6ED0] stroke-[2] shrink-0 group-hover:scale-105 transition-transform" />
                <div className="text-left min-w-0">
                  <span className="font-bold text-[#2D3A4E] block text-sm leading-tight truncate group-hover:text-[#5F6ED0] transition-colors">
                    Бренд & Реквизиты
                  </span>
                  <span className="text-[10px] text-[#5C6B80] block font-semibold truncate">
                    Контакты консьерж-сервиса
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#5C6B80] group-hover:text-[#5F6ED0] transition-colors shrink-0" />
            </button>
          </nav>
        </div>

        {/* Footer Support Info */}
        <div className="pt-4 border-t border-[#BAC5D5]/60 space-y-2.5 shrink-0">
          <button
            onClick={() => {
              onClose();
              if (onOpenSupportChat) onOpenSupportChat();
            }}
            className="w-full neu-inset bg-[#E3E8EF] rounded-2xl p-3 px-3.5 flex items-center justify-between text-left transition-all group cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center shrink-0 text-[#5F6ED0]">
                <Headphones className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5 group-hover:text-[#5F6ED0] transition-colors">
                  <span>Поддержка 24/7</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                </p>
                <p className="text-[11px] text-[#5C6B80] font-medium">Онлайн-чат с консьержем</p>
              </div>
            </div>
            <MessageSquare className="w-4 h-4 text-[#5C6B80] group-hover:text-[#5F6ED0] transition-colors shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenBrandDetails) onOpenBrandDetails();
            }}
            className="w-full text-center py-1 px-2 rounded-xl hover:bg-[#BAC5D5]/20 transition-all cursor-pointer space-y-0.5 block"
            title="Открыть реквизиты, информацию о бренде и контакты"
          >
            <p className="text-[11px] text-[#5C6B80] font-bold hover:text-[#5F6ED0] transition-colors">
              {phone ? `${storeName} • ${phone}` : storeName}
            </p>
            <p className="text-[10px] text-[#5C6B80]/80">Реквизиты • О бренде • Контакты</p>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
