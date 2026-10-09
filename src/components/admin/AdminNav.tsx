import React, { useEffect, useRef, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { motion } from 'motion/react';
import {
  BarChart3,
  Boxes,
  Coins,
  CircleHelp,
  FileText,
  FolderTree,
  Headphones,
  Image as ImageIcon,
  Layers,
  Loader2,
  Megaphone,
  Package,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { isAdminTab, type AdminNavCounts, type AdminTab } from './adminSections';
import { AdminHint } from './AdminHint';

const TABS: Record<AdminTab, { label: string; icon: LucideIcon }> = {
  analytics: { label: 'Аналитика', icon: BarChart3 },
  orders: { label: 'Заказы', icon: Package },
  customers: { label: 'Клиенты', icon: Users },
  support: { label: 'Чат поддержки', icon: Headphones },
  products: { label: 'Товары', icon: Layers },
  categories: { label: 'Категории', icon: FolderTree },
  inventory: { label: 'Склад и SKU', icon: Boxes },
  rates: { label: 'Курсы и наценка', icon: Coins },
  promos: { label: 'Промокоды', icon: Tag },
  banners: { label: 'Баннеры', icon: ImageIcon },
  delivery: { label: 'Доставка и ПВЗ', icon: Truck },
  payment: { label: 'Оплата', icon: Wallet },
  faq: { label: 'FAQ', icon: CircleHelp },
  legal: { label: 'Документы', icon: FileText },
  storefront: { label: 'Витрина', icon: Store },
};

type AdminGroupId = 'sales' | 'catalog' | 'marketing' | 'store';

/** 14 sections in 4 groups (Hick: 4 choices, then 2–5) */
const GROUPS: { id: AdminGroupId; label: string; icon: LucideIcon; tabs: AdminTab[]; hint?: string }[] = [
  { id: 'sales', label: 'Продажи', icon: TrendingUp, tabs: ['analytics', 'orders', 'customers', 'support'] },
  { id: 'catalog', label: 'Каталог', icon: Layers, tabs: ['products', 'categories', 'inventory', 'rates'] },
  { id: 'marketing', label: 'Маркетинг', icon: Megaphone, tabs: ['promos', 'banners'] },
  {
    id: 'store',
    label: 'Магазин',
    icon: Store,
    tabs: ['delivery', 'payment', 'faq', 'legal', 'storefront'],
    hint: 'Как покупатель получает и оплачивает заказ и что о вас узнаёт.',
  },
];

const groupOf = (tab: AdminTab) => GROUPS.find((g) => g.tabs.includes(tab)) ?? GROUPS[0];


/** The number; `className` places it. The words for screen readers go once, from the copy with `label` */
const Badge: React.FC<{ value: number; label?: string; className?: string }> = ({ value, label, className = '' }) =>
  value > 0 ? (
    <>
      <span
        aria-hidden="true"
        className={`min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-extrabold leading-[18px] text-center shrink-0 ${className}`}
      >
        {value > 99 ? '99+' : value}
      </span>
      {label && (
        <span className="sr-only">
          {', '}
          {label}: {value}
        </span>
      )}
    </>
  ) : null;

interface AdminNavProps {
  tab: AdminTab;
  /** A tab or group was chosen; the panel switches (or first asks about unsaved edits) */
  onRequestTab: (tab: AdminTab) => void;
  counts?: AdminNavCounts;
  /** Pointer or focus on a tab: start loading that section's code */
  onPrefetchTab?: (tab: AdminTab) => void;
  /** A section whose code is still loading after it was chosen (the current one stays on screen) */
  pendingTab?: AdminTab | null;
  /** Content of the selected section */
  children: React.ReactNode;
}

/**
 * Admin navigation: 4 groups (tablist), the sections of the selected group (tablist) and the section's panel.
 * Arrows move between tabs, Enter or Space opens one; a group opens the section last used in it.
 */
/** Computer (lg): the groups are a vertical menu on the left, so the arrows are ↑ ↓ there */
function useIsWide(): boolean {
  const query = '(min-width: 64rem)';
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isWide;
}

export const AdminNav: React.FC<AdminNavProps> = ({ tab, onRequestTab, onPrefetchTab, pendingTab, counts = {}, children }) => {
  const group = groupOf(tab);
  const isWide = useIsWide();
  const lastInGroup = useRef<Partial<Record<AdminGroupId, AdminTab>>>({});
  useEffect(() => {
    lastInGroup.current[groupOf(tab).id] = tab;
  }, [tab]);

  const groupCount = (g: (typeof GROUPS)[number]) =>
    g.tabs.reduce((sum, t) => sum + (counts[t]?.value ?? 0), 0);

  return (
    <Tabs.Root
      value={group.id}
      onValueChange={(next) => {
        const target = GROUPS.find((g) => g.id === next);
        if (target) onRequestTab(lastInGroup.current[target.id] ?? target.tabs[0]);
      }}
      orientation={isWide ? 'vertical' : 'horizontal'}
      className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-6 min-w-0 w-full"
    >
      <Tabs.List
        aria-label="Разделы панели"
        className="admin-tab-bar rounded-2xl p-1.5 grid grid-cols-4 gap-1.5 shrink-0 w-full lg:flex lg:flex-col lg:w-52 lg:self-start"
      >
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const isActive = g.id === group.id;
          const count = groupCount(g);
          return (
            <Tabs.Tab
              key={g.id}
              value={g.id}
              onPointerEnter={() => onPrefetchTab?.(lastInGroup.current[g.id] ?? g.tabs[0])}
              onFocus={() => onPrefetchTab?.(lastInGroup.current[g.id] ?? g.tabs[0])}
              className={`relative min-w-0 py-2 px-1 sm:px-3 lg:py-3 lg:px-4 rounded-xl font-extrabold text-[11px] sm:text-xs lg:text-sm tracking-tight sm:tracking-normal flex items-center justify-center lg:justify-start cursor-pointer select-none transition-colors ${
                isActive ? 'text-accent font-extrabold' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="adminGroupPill"
                  className="absolute inset-0 rounded-xl admin-tab-active z-0"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex flex-col sm:flex-row items-center gap-1 sm:gap-1.5 lg:gap-2.5 min-w-0 lg:w-full">
                {/* Phone: the number on the icon's corner; wider: after the label */}
                <span className="relative shrink-0">
                  <Icon className={`w-4 h-4 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 ${isActive ? 'text-accent' : 'text-[#4E5C70]'}`} />
                  {!isActive && <Badge value={count} className="absolute -top-2.5 -right-3.5 sm:hidden" />}
                </span>
                <span className="truncate max-w-full">{g.label}</span>
                {!isActive && <Badge value={count} label="ждут внимания" className="hidden sm:inline-block lg:ml-auto" />}
              </span>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>

      {/* The group's panel: its sections and the selected section */}
      <Tabs.Panel value={group.id} tabIndex={-1} className="flex-1 min-h-0 flex flex-col gap-3 min-w-0 w-full outline-none">
        <Tabs.Root
          value={tab}
          onValueChange={(next) => {
            if (isAdminTab(next)) onRequestTab(next);
          }}
          className="flex-1 min-h-0 flex flex-col gap-3 min-w-0 w-full"
        >
          <div className="flex items-start gap-1 shrink-0 min-w-0">
          <Tabs.List
            aria-label={`Разделы группы «${group.label}»`}
            className="flex-1 min-w-0 flex flex-wrap items-center gap-2 px-1 py-1.5 -my-1"
          >
            {group.tabs.map((t) => {
              const { label, icon: Icon } = TABS[t];
              const isActive = t === tab;
              const count = counts[t];
              return (
                <Tabs.Tab
                  key={t}
                  value={t}
                  onPointerEnter={() => onPrefetchTab?.(t)}
                  onFocus={() => onPrefetchTab?.(t)}
                  className={`h-8 px-3 rounded-xl text-[11px] sm:text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer select-none transition-colors ${
                    isActive
                      ? 'neu-pill-active text-accent font-extrabold'
                      : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E] font-extrabold'
                  }`}
                >
                  {pendingTab === t ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" aria-hidden="true" />
                  ) : (
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{label}</span>
                  {count && <Badge value={count.value} label={count.label} />}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
          {group.hint && (
            <AdminHint label={group.label} className="mt-1">
              {group.hint}
            </AdminHint>
          )}
          </div>

          <Tabs.Panel
            value={tab}
            aria-busy={pendingTab ? true : undefined}
            className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-1 scrollbar-thin min-w-0 w-full"
          >
            {children}
          </Tabs.Panel>
        </Tabs.Root>
      </Tabs.Panel>
    </Tabs.Root>
  );
};
