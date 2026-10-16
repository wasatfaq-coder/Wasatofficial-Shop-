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
import { m, AnimatePresence } from 'motion/react';
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
    className="neu-button rounded-2xl p-3 px-3.5 flex items-center justify-between gap-3 text-left text-text-primary hover:text-accent transition-all cursor-pointer group"
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
        <Icon className="w-4 h-4 stroke-[2.2] shrink-0" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        {/* Wraps instead of «Фильтры то…» on a 320 px phone */}
        <span className="block text-sm font-bold leading-tight">{label}</span>
        {hint && <span className="text-xs font-medium text-text-secondary block mt-0.5 leading-snug">{hint}</span>}
      </div>
    </div>
    <ChevronRight className="w-4 h-4 shrink-0 text-text-secondary group-hover:text-accent group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
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
        <m.div
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
            className="fixed inset-0 bg-text-primary/45 backdrop-blur-xs cursor-pointer"
          />

          {/* Drawer Container */}
          <m.div
            ref={dialog.ref}
            {...dialog.props}
            key="drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-[85%] max-w-xs h-full neu-modal rounded-r-3xl p-4 sm:p-6 flex flex-col justify-between z-10 overflow-hidden"
          >
            <div className="flex flex-col min-h-0 flex-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between gap-3 pb-4 neu-divider-b shrink-0">
                <div className="min-w-0">
                  <h2 id={dialog.titleId} className="text-xl font-extrabold text-text-primary tracking-tight">
                    {storeName}
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold ml-1 align-baseline" aria-hidden="true" />
                  </h2>
                  {storeSlogan && (
                    <p className="text-xs text-text-secondary font-semibold leading-snug line-clamp-2">{storeSlogan}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-full neu-button flex items-center justify-center text-text-primary hover:text-accent cursor-pointer shrink-0"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5 stroke-[2]" />
                </button>
              </div>

              {/* Negative horizontal margin + matching padding preserves full 17px neumorphic shadow bleed without clipping */}
              <nav aria-label="Меню" className="-mx-4 px-4 py-3.5 my-1 flex flex-col gap-3 overflow-y-auto no-scrollbar flex-1">
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
            className="pt-3 neu-divider-t shrink-0 flex items-center justify-center gap-3 text-xs"
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
      </m.div>
    </m.div>
  )}
</AnimatePresence>
);
};
