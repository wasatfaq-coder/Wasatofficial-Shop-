import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Plus, Search, Tag, TrendingUp, Users, Wand2 } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { NotConfigured } from '../NotConfigured';
import { AdminShowMore } from './AdminShowMore';
import { PromoForm } from './promos/PromoForm';
import { PromoBatchGenerator } from './promos/PromoBatchGenerator';
import { PromoBatchCard, PromoCard, discountLabel } from './promos/PromoListCards';
import type { Order, Product, PromoCode, StoreCategory } from '../../types';
import { isPromoExpired } from '../../shared/orderPricing';
import { copyToClipboard } from '../../utils/clipboard';
import { computePartnerCommissions } from '../../utils/partnerCommission';
import { pluralRu } from '../../utils/pluralize';
import { usePagedList } from '../../utils/usePagedList';
import {
  PROMO_LIST_FILTERS,
  promoFilterCounts,
  promoListRows,
  type PromoBatch,
  type PromoListFilter,
  type PromoListRow,
} from '../../utils/promoList';

interface AdminPromoConstructorTabProps {
  promos: PromoCode[];
  /** Admin → «Категории» (promo limited to categories) */
  categories?: StoreCategory[];
  products?: Product[];
  /** Orders the partner commission is counted from (paid and received only) */
  orders?: Order[];
  /** Resolves to false when the database refused the write (App has already shown the error toast) */
  onUpdatePromos: (promos: PromoCode[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type PromoView = { kind: 'list' } | { kind: 'form'; promo: PromoCode | null } | { kind: 'batch' };

/** «A, B, C и ещё 97»: a batch of single-use codes expires at once, and its codes would fill the phone screen */
function expiredCodesPreview(promos: PromoCode[]): string {
  const shown = promos.slice(0, 3).map((p) => p.code).join(', ');
  const rest = promos.length - 3;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}

const codesWord = (n: number) => pluralRu(n, ['промокод', 'промокода', 'промокодов']);

/**
 * «Промокоды» (stage 8 of docs/admin-wholesale-plan.md, part 2, findings 13 and 14): the list with search and status
 * chips, a batch of single-use codes as one row, by 20 with «Показать ещё»; the form and «Пачка кодов» are screens of
 * their own instead of panels above the list.
 */
export const AdminPromoConstructorTab: React.FC<AdminPromoConstructorTabProps> = ({
  promos,
  categories = [],
  products = [],
  orders = [],
  onUpdatePromos,
  onShowToast,
}) => {
  const [view, setView] = useState<PromoView>({ kind: 'list' });
  const [filter, setFilter] = useState<PromoListFilter>('all');
  const [query, setQuery] = useState('');
  const [promoToDelete, setPromoToDelete] = useState<PromoCode | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<PromoBatch | null>(null);
  const [isDisablingExpired, setIsDisablingExpired] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cameBackRef = useRef(false);
  // back from the form or «Пачка кодов»: the button that opened them is gone, the list's heading takes the focus
  useEffect(() => {
    if (view.kind !== 'list') cameBackRef.current = true;
    else if (cameBackRef.current) headingRef.current?.focus();
  }, [view.kind]);

  // Referral metrics: from the orders (paid and received), not from the promo counters a visitor can raise
  const partnerCommissions = useMemo(() => computePartnerCommissions(promos, orders), [promos, orders]);
  const commissionByPromo = useMemo(() => new Map(partnerCommissions.map((c) => [c.promoId, c])), [partnerCommissions]);

  // computed on every render, not memoized by `promos`: a code expires at midnight while the list stays the same
  const expiredActivePromos = promos.filter((p) => p.active && isPromoExpired(p));
  const counts = promoFilterCounts(promos);
  const rows = promoListRows(promos, filter, query);
  const page = usePagedList<PromoListRow>(rows, `${filter}|${query}`);

  const save = async (next: PromoCode[], toast: string, type: 'success' | 'info' = 'info') => {
    if ((await onUpdatePromos(next)) === false) return false;
    onShowToast(toast, type);
    return true;
  };

  const handleToggleActive = (promo: PromoCode) =>
    save(
      promos.map((p) => (p.id === promo.id ? { ...p, active: !p.active } : p)),
      `Промокод ${promo.code} ${promo.active ? 'на паузе' : 'снова действует'}`
    );

  const handleSetBatchActive = (batch: PromoBatch, active: boolean) => {
    const ids = new Set(batch.codes.map((p) => p.id));
    return save(
      promos.map((p) => (ids.has(p.id) ? { ...p, active } : p)),
      active ? 'Коды пачки снова действуют' : 'Пачка на паузе: покупатели её коды не применят'
    );
  };

  const handleCopy = async (text: string, toast: string) => {
    if (await copyToClipboard(text)) onShowToast(toast, 'success');
    else onShowToast('Не удалось скопировать: выделите код и скопируйте вручную', 'error');
  };

  const handleDisableExpired = async () => {
    const ids = new Set(expiredActivePromos.map((p) => p.id));
    if (ids.size === 0) return;
    setIsDisablingExpired(true);
    await save(
      promos.map((p) => (ids.has(p.id) ? { ...p, active: false } : p)),
      `Выключено ${ids.size} ${codesWord(ids.size)} с прошедшим сроком`,
      'success'
    );
    setIsDisablingExpired(false);
  };

  if (view.kind === 'form') {
    return (
      <PromoForm
        key={view.promo?.id ?? 'new'}
        promo={view.promo}
        promos={promos}
        categories={categories}
        products={products}
        onUpdatePromos={onUpdatePromos}
        onShowToast={onShowToast}
        onClose={() => setView({ kind: 'list' })}
      />
    );
  }
  if (view.kind === 'batch') {
    return (
      <PromoBatchGenerator
        promos={promos}
        onUpdatePromos={onUpdatePromos}
        onShowToast={onShowToast}
        onClose={() => setView({ kind: 'list' })}
      />
    );
  }

  const totalSales = partnerCommissions.reduce((acc, c) => acc + c.confirmedSales, 0);
  const totalCommission = partnerCommissions.reduce((acc, c) => acc + c.commission, 0);
  const totalOrders = partnerCommissions.reduce((acc, c) => acc + c.confirmedOrders, 0);
  const totalPending = partnerCommissions.reduce((acc, c) => acc + c.pendingOrders, 0);

  return (
    <div className="space-y-4 text-[#2D3A4E] w-full min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 ref={headingRef} tabIndex={-1} className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span>Промокоды</span>
          </h3>
          <p className="text-xs text-[#4E5C70]">Скидки по коду, одноразовые коды для рассылки и коды партнёров</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setView({ kind: 'batch' })}
            className="h-10 px-3.5 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <span>Пачка кодов</span>
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: 'form', promo: null })}
            className="h-10 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            <span>Новый промокод</span>
          </button>
        </div>
      </div>

      {expiredActivePromos.length > 0 && (
        <div className="bg-warning-soft border border-warning/30 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <p className="text-xs text-[#2D3A4E] flex-1 min-w-0">
            <strong>
              {expiredActivePromos.length} {codesWord(expiredActivePromos.length)} с прошедшим сроком
            </strong>{' '}
            ({expiredCodesPreview(expiredActivePromos)}) ещё включены. Покупатель их уже не видит и не применит;
            выключите, чтобы список совпадал с тем, что действует.
          </p>
          <button
            type="button"
            onClick={handleDisableExpired}
            disabled={isDisablingExpired}
            className={`h-9 px-4 rounded-xl text-xs font-extrabold shrink-0 self-start sm:self-auto ${
              isDisablingExpired ? 'neu-button-disabled' : 'neu-button text-[#2D3A4E] cursor-pointer'
            }`}
          >
            {isDisablingExpired ? 'Выключение…' : `Выключить ${expiredActivePromos.length}`}
          </button>
        </div>
      )}

      {promos.length === 0 ? (
        <NotConfigured title="Промокоды" hint="Покупатели видят «Промокоды: не настроено»." />
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Найти промокод"
                placeholder="Код, название или партнёр"
                className="w-full h-10 pl-9 pr-3 neu-inset rounded-xl text-xs text-[#2D3A4E]"
              />
            </div>
            <div role="radiogroup" aria-label="Какие промокоды показать" className="flex flex-wrap gap-1.5">
              {PROMO_LIST_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                    filter === f.id ? 'neu-pill-active font-extrabold' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  {f.label} ({counts[f.id]})
                </button>
              ))}
            </div>
          </div>

          {filter === 'partners' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="neu-inset rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                  Продажи партнёров
                </span>
                <p className="text-lg font-extrabold text-[#2D3A4E]">{totalSales.toLocaleString('ru-RU')} ₽</p>
                <p className="text-xs text-[#4E5C70]">Оплаченные и полученные заказы с партнёрскими кодами, без доставки</p>
              </div>
              <div className="neu-inset rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  Комиссия партнёров
                </span>
                <p className="text-lg font-extrabold text-accent">{totalCommission.toLocaleString('ru-RU')} ₽</p>
                <p className="text-xs text-[#4E5C70]">Для статистики: сайт её не выплачивает. Процент — в настройках кода</p>
              </div>
              <div className="neu-inset rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold text-[#4E5C70] uppercase tracking-wider flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                  Заказов от партнёров
                </span>
                <p className="text-lg font-extrabold text-[#2D3A4E]">
                  {totalOrders} {pluralRu(totalOrders, ['заказ', 'заказа', 'заказов'])}
                </p>
                <p className="text-xs text-[#4E5C70]">
                  {totalPending > 0
                    ? `Ещё ${totalPending} ${pluralRu(totalPending, ['ждёт', 'ждут', 'ждут'])} оплаты или получения — в комиссию пока не входят`
                    : 'Оплаченные и полученные клиентом'}
                </p>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-xs text-[#4E5C70] neu-inset rounded-2xl p-4 text-center">
              {query.trim() ? `По запросу «${query.trim()}» промокодов нет` : 'В этом списке промокодов нет'}
            </p>
          ) : (
            <div className="space-y-3 w-full min-w-0">
              {page.visible.map((row) =>
                row.kind === 'batch' ? (
                  <PromoBatchCard
                    key={row.batch.key}
                    batch={row.batch}
                    onSetActive={(active) => handleSetBatchActive(row.batch, active)}
                    onCopyUnused={() =>
                      handleCopy(
                        row.batch.unused.map((p) => p.code).join('\n'),
                        `Скопировано ${row.batch.unused.length} ${pluralRu(row.batch.unused.length, ['код', 'кода', 'кодов'])}: вставьте их в рассылку`
                      )
                    }
                    onDelete={() => setBatchToDelete(row.batch)}
                  />
                ) : (
                  <PromoCard
                    key={row.promo.id}
                    promo={row.promo}
                    categories={categories}
                    commission={commissionByPromo.get(row.promo.id)}
                    onToggleActive={() => handleToggleActive(row.promo)}
                    onEdit={() => setView({ kind: 'form', promo: row.promo })}
                    onCopy={() => handleCopy(row.promo.code, `Код ${row.promo.code} скопирован`)}
                    onDelete={() => setPromoToDelete(row.promo)}
                  />
                )
              )}
              <AdminShowMore shown={page.visible.length} total={rows.length} onShowMore={page.showMore} />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={promoToDelete !== null}
        title="Удалить промокод?"
        message="Код перестанет действовать. Это действие нельзя отменить: чтобы остановить код на время, поставьте его на паузу."
        preview={
          promoToDelete && (
            <p className="text-xs">
              <span className="font-mono font-extrabold">{promoToDelete.code}</span> · {discountLabel(promoToDelete)} ·
              использован {promoToDelete.usedCount} {pluralRu(promoToDelete.usedCount, ['раз', 'раза', 'раз'])}
            </p>
          )
        }
        onConfirm={() => {
          const target = promoToDelete;
          if (target) void save(promos.filter((p) => p.id !== target.id), `Промокод ${target.code} удалён`);
        }}
        onClose={() => setPromoToDelete(null)}
      />
      <ConfirmDialog
        isOpen={batchToDelete !== null}
        title="Удалить пачку кодов?"
        message="Все коды пачки перестанут действовать, в том числе уже разосланные. Это действие нельзя отменить."
        preview={
          batchToDelete && (
            <p className="text-xs">
              <span className="font-mono font-extrabold">{batchToDelete.prefix || 'Пачка кодов'}</span> ·{' '}
              {batchToDelete.codes.length} {pluralRu(batchToDelete.codes.length, ['код', 'кода', 'кодов'])} · использовано{' '}
              {batchToDelete.used}
            </p>
          )
        }
        onConfirm={() => {
          const target = batchToDelete;
          if (!target) return;
          const ids = new Set(target.codes.map((p) => p.id));
          void save(
            promos.filter((p) => !ids.has(p.id)),
            `Удалено ${target.codes.length} ${pluralRu(target.codes.length, ['код', 'кода', 'кодов'])} пачки`
          );
        }}
        onClose={() => setBatchToDelete(null)}
      />
    </div>
  );
};
