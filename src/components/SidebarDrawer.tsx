import React from 'react';
import {
  X,
  Headphones,
  ChevronRight,
  Ruler,
  Building2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab, StorefrontSettings } from '../types';
import { LEGAL_DOC_IDS, legalDocsReady } from '../utils/legalDocs';
import { getStoreName, publicSetting } from '../utils/storeContacts';
import { useDialogA11y } from '../utils/useDialogA11y';

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenMySizes?: () => void;
  onOpenFilters?: () => void;
  onOpenSupportChat?: () => void;
  onOpenBrandDetails?: () => void;
  storefrontSettings?: StorefrontSettings;
}

const DrawerItem: React.FC<{ icon: LucideIcon; label: string; hint?: string; onClick: () => void }> = ({
  icon: Icon,
  label,
  hint,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="neu-button rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-left text-[#2D3A4E] font-medium hover:text-accent transition-all cursor-pointer group"
  >
    <div className="flex items-center gap-3 min-w-0">
      <Icon className="w-5 h-5 text-accent stroke-[2] shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {/* Wraps instead of «Фильтры то…» on a 320 px phone */}
        <span className="block leading-tight">{label}</span>
        {hint && <span className="text-xs text-[#4E5C70] block mt-0.5 leading-snug">{hint}</span>}
      </div>
    </div>
    <ChevronRight className="w-4 h-4 shrink-0 text-[#4E5C70] group-hover:text-accent transition-colors" aria-hidden="true" />
  </button>
);

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  setActiveTab,
  onOpenMySizes,
  onOpenFilters,
  onOpenSupportChat,
  onOpenBrandDetails,
  storefrontSettings,
}) => {
  const dialog = useDialogA11y(isOpen, onClose);
  const run = (action?: () => void) => {
    onClose();
    action?.();
  };

  // Demo template phone is never shown to customers (see storeContacts.ts)
  const phone = publicSetting(storefrontSettings?.phone);
  const storeName = getStoreName(storefrontSettings);
  const storeSlogan = (storefrontSettings?.storeSlogan ?? '').trim();

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
            ref={dialog.ref}
            {...dialog.props}
            key="drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-[85%] max-w-xs h-full neu-modal p-4 sm:p-6 flex flex-col justify-between z-10 border-r border-white/60 overflow-hidden"
          >
            <div className="flex flex-col min-h-0 flex-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#BAC5D5]/60 shrink-0">
                <div>
                  <h2 id={dialog.titleId} className="text-xl font-extrabold text-[#2D3A4E] tracking-tight">
                    {storeName}
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold ml-1 align-baseline" aria-hidden="true" />
                  </h2>
                  {storeSlogan && (
                    <p className="text-xs text-[#4E5C70] font-semibold leading-snug line-clamp-2">{storeSlogan}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent cursor-pointer"
                  aria-label="Закрыть"
                >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>

          {/* Only what the bottom menu (and the computer header) does not have: screens are there */}
          <nav aria-label="Меню" className="my-4 flex flex-col gap-2.5 overflow-y-auto pr-1 custom-scrollbar flex-1">
            <DrawerItem icon={SlidersHorizontal} label="Фильтры товаров" onClick={() => run(onOpenFilters)} />
            <DrawerItem icon={Ruler} label="Мои размеры" onClick={() => run(onOpenMySizes)} />
            <DrawerItem
              icon={Building2}
              label="Бренд и реквизиты"
              hint={phone ? phone.replace(/-/g, '\u2011') /* non-breaking hyphens: the number does not split */ : 'Контакты и реквизиты'}
              onClick={() => run(onOpenBrandDetails)}
            />
            <DrawerItem
              icon={Headphones}
              label="Поддержка"
              hint="Онлайн-чат с магазином"
              onClick={() => run(onOpenSupportChat)}
            />
          </nav>
        </div>

        {legalDocsReady(storefrontSettings) && (
          <nav
            aria-label="Документы"
            className="pt-3 border-t border-[#BAC5D5]/60 shrink-0 flex items-center justify-center gap-3 text-xs"
          >
            {LEGAL_DOC_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onClose();
                  setActiveTab(id);
                }}
                className="min-h-8 px-1 font-bold text-accent hover:underline cursor-pointer"
              >
                {id === 'offer' ? 'Оферта' : 'Персональные данные'}
              </button>
            ))}
          </nav>
        )}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
