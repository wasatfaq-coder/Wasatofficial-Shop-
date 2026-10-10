import React, { useEffect, useRef } from 'react';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Coins,
  CircleHelp,
  FileText,
  FolderTree,
  Headphones,
  Home,
  Image as ImageIcon,
  Layers,
  Loader2,
  MoreHorizontal,
  Package,
  PackageOpen,
  Store,
  Tag,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AdminNavCounts, AdminTab } from './adminSections';

type SectionTab = Exclude<AdminTab, 'more'>;

/** `short` — the bottom bar's label on a phone; `about` — the line under the name in «Ещё» */
const TABS: Record<SectionTab, { label: string; short?: string; icon: LucideIcon; about?: string }> = {
  today: { label: 'Сегодня', icon: Home },
  orders: { label: 'Заказы', icon: Package },
  support: { label: 'Чат поддержки', short: 'Чат', icon: Headphones },
  products: { label: 'Товары', icon: Layers },
  customers: { label: 'Клиенты', icon: Users, about: 'Покупатели, их заказы и заметки' },
  analytics: { label: 'Аналитика', icon: BarChart3, about: 'Выручка, отмены, ошибки на сайте' },
  categories: { label: 'Категории', icon: FolderTree, about: 'Разделы каталога и их порядок' },
  inventory: { label: 'Склад и SKU', icon: Boxes, about: 'Остатки, приход и списание, этикетки' },
  rates: { label: 'Курсы и наценка', icon: Coins, about: 'Курс доллара и юаня, наценки розницы и опта' },
  wholesale: { label: 'Опт', icon: PackageOpen, about: 'Скидка за объём для оптовых товаров' },
  promos: { label: 'Промокоды', icon: Tag, about: 'Скидки по коду' },
  banners: { label: 'Баннеры', icon: ImageIcon, about: 'Слайды на главной' },
  delivery: { label: 'Доставка и ПВЗ', icon: Truck, about: 'Способы доставки, цены и пункты выдачи' },
  payment: { label: 'Оплата', icon: Wallet, about: 'Способы оплаты и реквизиты' },
  faq: { label: 'FAQ', icon: CircleHelp, about: 'Частые вопросы покупателей' },
  legal: { label: 'Документы', icon: FileText, about: 'Оферта и политика конфиденциальности' },
  storefront: { label: 'Витрина', icon: Store, about: 'Название, контакты, график, приём заказов, копия базы' },
};

/** Every day: one tap on the phone's bottom bar (menu variant A, owner's decision 09.10) */
const PRIMARY: SectionTab[] = ['today', 'orders', 'products', 'support'];

/** The rest — in «Ещё», a list with a line about each section, in the old groups */
const MORE_GROUPS: { label: string; tabs: SectionTab[] }[] = [
  { label: 'Продажи', tabs: ['customers', 'analytics'] },
  { label: 'Каталог', tabs: ['categories', 'inventory', 'rates', 'wholesale'] },
  { label: 'Маркетинг', tabs: ['promos', 'banners'] },
  { label: 'Магазин', tabs: ['delivery', 'payment', 'faq', 'legal', 'storefront'] },
];

const isMoreSection = (tab: AdminTab) => tab === 'more' || !PRIMARY.includes(tab as SectionTab);

/** The number; the words for screen readers go with it (`label`), after the section's name */
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
  /** A section was chosen; the panel switches (or first asks about unsaved edits) */
  onRequestTab: (tab: AdminTab) => void;
  counts?: AdminNavCounts;
  /** Pointer or focus on a section: start loading its code */
  onPrefetchTab?: (tab: AdminTab) => void;
  /** A section whose code is still loading after it was chosen (the current one stays on screen) */
  pendingTab?: AdminTab | null;
  /** Content of the selected section */
  children: React.ReactNode;
}

/**
 * Admin navigation, menu variant A (stage 2 of docs/admin-wholesale-plan.md): on a phone a bottom bar — «Сегодня»,
 * «Заказы», «Товары», «Чат», «Ещё» — and «Ещё» lists the other sections with a line about each; on a computer all
 * sections are on the left, «Сегодня» first. Buttons with `aria-current="page"`, one tap opens a section.
 */
export const AdminNav: React.FC<AdminNavProps> = ({ tab, onRequestTab, onPrefetchTab, pendingTab, counts = {}, children }) => {
  const prefetch = (t: AdminTab) => ({ onPointerEnter: () => onPrefetchTab?.(t), onFocus: () => onPrefetchTab?.(t) });
  const icon = (t: SectionTab, className: string) => {
    if (pendingTab === t) return <Loader2 className={`${className} animate-spin text-accent`} aria-hidden="true" />;
    const Icon = TABS[t].icon;
    return <Icon className={className} aria-hidden="true" />;
  };
  // The pressed button (a line of «Ещё» or «Сегодня», «Все разделы») leaves with the old content: focus goes to the
  // new section, not to the page, so the keyboard and a screen reader continue there
  const contentRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) contentRef.current?.focus({ preventScroll: true });
  }, [tab]);
  const moreCount = MORE_GROUPS.flatMap((g) => g.tabs).reduce((sum, t) => sum + (counts[t]?.value ?? 0), 0);
  const inMore = isMoreSection(tab);

  // «Ещё» on a phone: the list of sections; a section from it gets «‹ Все разделы» above it
  const moreList = (
    <nav aria-label="Все разделы" className="space-y-4 lg:hidden">
      <h3 className="text-lg font-extrabold text-[#2D3A4E] font-display">Ещё</h3>
      {MORE_GROUPS.map((group) => (
        <section key={group.label} aria-label={group.label} className="space-y-1.5">
          <h4 className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#4E5C70]">{group.label}</h4>
          <ul className="neu-flat rounded-2xl p-1.5 space-y-1">
            {group.tabs.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => onRequestTab(t)}
                  {...prefetch(t)}
                  className="w-full rounded-xl px-2.5 py-2 flex items-center gap-3 text-left cursor-pointer hover:bg-white/40 transition-colors"
                >
                  <span className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
                    {icon(t, 'w-4 h-4')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-[#2D3A4E]">{TABS[t].label}</span>
                    <span className="block text-xs text-[#4E5C70]">{TABS[t].about}</span>
                  </span>
                  {counts[t] && <Badge value={counts[t]!.value} label={counts[t]!.label} />}
                  <ChevronRight className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-6 min-w-0 w-full">
      {/* Computer: every section on the left */}
      <nav
        aria-label="Разделы панели"
        className="hidden lg:flex flex-col gap-0.5 w-56 shrink-0 self-stretch overflow-y-auto pr-1 scrollbar-thin"
      >
        {[{ label: '', tabs: PRIMARY }, ...MORE_GROUPS].map((group) => (
          <div key={group.label || 'primary'} className={group.label ? 'pt-2' : ''}>
            {group.label && (
              <div aria-hidden="true" className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-[#4E5C70]">
                {group.label}
              </div>
            )}
            {group.tabs.map((t) => {
              const isActive = t === tab;
              const count = counts[t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onRequestTab(t)}
                  {...prefetch(t)}
                  className={`w-full h-9 px-3 rounded-xl text-sm flex items-center gap-2.5 text-left cursor-pointer select-none transition-colors ${
                    isActive ? 'neu-pill-active text-accent font-extrabold' : 'text-[#4E5C70] hover:text-[#2D3A4E] font-bold'
                  }`}
                >
                  {icon(t, 'w-4 h-4 shrink-0')}
                  <span className="truncate flex-1">{TABS[t].label}</span>
                  {count && <Badge value={count.value} label={count.label} />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex-1 min-h-0 flex flex-col gap-3 min-w-0 w-full">
        {/* Phone: a section opened from «Ещё» says where it is and goes back to the list */}
        {inMore && tab !== 'more' && (
          <div className="lg:hidden flex items-center gap-2 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => onRequestTab('more')}
              className="h-8 pl-1.5 pr-2.5 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Все разделы
            </button>
            <span className="text-sm font-extrabold text-[#2D3A4E] truncate">{TABS[tab as SectionTab].label}</span>
          </div>
        )}
        <div
          ref={contentRef}
          role="region"
          tabIndex={-1}
          aria-label={tab === 'more' ? 'Ещё' : TABS[tab].label}
          aria-busy={pendingTab ? true : undefined}
          className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-1 scrollbar-thin min-w-0 w-full"
        >
          {tab === 'more' ? (
            <>
              {moreList}
              {/* a computer has every section on the left («Ещё» was chosen on a narrow window) */}
              <p className="hidden lg:block text-sm text-[#4E5C70]">Выберите раздел в списке слева.</p>
            </>
          ) : (
            children
          )}
        </div>
      </div>

      {/* Phone: the bottom bar */}
      <nav aria-label="Разделы панели" className="lg:hidden shrink-0 -mx-3 -mb-3 sm:mx-0 sm:mb-0 admin-tab-bar sm:rounded-2xl">
        <ul className="grid grid-cols-5 gap-1 px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {[...PRIMARY, 'more' as const].map((t) => {
            const isActive = t === 'more' ? inMore : t === tab;
            const count = t === 'more' ? (moreCount > 0 ? { value: moreCount, label: 'ждут внимания' } : undefined) : counts[t];
            const label = t === 'more' ? 'Ещё' : TABS[t].short ?? TABS[t].label;
            return (
              <li key={t} className="min-w-0">
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onRequestTab(t)}
                  {...prefetch(t)}
                  className={`w-full min-w-0 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer select-none transition-colors ${
                    isActive ? 'neu-pill-active text-accent font-extrabold' : 'text-[#4E5C70] hover:text-[#2D3A4E] font-bold'
                  }`}
                >
                  <span className="relative">
                    {t === 'more' ? <MoreHorizontal className="w-5 h-5" aria-hidden="true" /> : icon(t, 'w-5 h-5')}
                    {/* the number on the icon's corner; its words go after the name */}
                    {count && <Badge value={count.value} className="absolute -top-1.5 left-3.5" />}
                  </span>
                  <span className="truncate max-w-full">{label}</span>
                  {count && count.value > 0 && (
                    <span className="sr-only">
                      , {count.label}: {count.value}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
