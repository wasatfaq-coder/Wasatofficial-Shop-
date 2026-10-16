import React, { useState } from 'react';
import { Calendar, ChevronDown, Copy, Download, Files, Layers, Pencil, Share2, Shirt, Trash2, Users } from 'lucide-react';
import type { PromoCode, StoreCategory } from '../../../types';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import { AdminActionMenu } from '../AdminActionMenu';
import { formatPromoExpiry, isLimitedPromo, isPromoExpired } from '../../../shared/orderPricing';
import type { PartnerCommission } from '../../../utils/partnerCommission';
import { categoryNamesText, isPromoUsedUp, type PromoBatch } from '../../../utils/promoList';
import { pluralRu } from '../../../utils/pluralize';

const chip = 'text-[11px] font-bold px-2 py-0.5 rounded-full';

export function discountLabel(promo: PromoCode): string {
  return promo.discountType === 'fixed'
    ? `-${(promo.discountValue || 0).toLocaleString('ru-RU')} ₽`
    : `-${promo.discountValue || promo.discountPercent}%`;
}

/** «Действует / На паузе»: the switch says what it does, the text next to it — what the code is now */
const ActiveSwitch: React.FC<{ checked: boolean; label: string; onChange: () => void }> = ({ checked, label, onChange }) => (
  <span className="flex items-center gap-1.5">
    <NeumorphicSwitch checked={checked} onChange={onChange} label={label} />
    <span aria-hidden="true" className={`text-[11px] font-bold ${checked ? 'text-success' : 'text-text-secondary'}`}>
      {checked ? 'Действует' : 'На паузе'}
    </span>
  </span>
);

interface PromoCardProps {
  promo: PromoCode;
  categories: StoreCategory[];
  commission?: PartnerCommission;
  onToggleActive: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

/** One code in «Промокоды»: what it gives, its conditions and status; edit, copy and pause at hand, delete in «Ещё» */
export const PromoCard: React.FC<PromoCardProps> = ({ promo, categories, commission, onToggleActive, onEdit, onDuplicate, onCopy, onDelete }) => {
  const expired = isPromoExpired(promo);
  const usedUp = isPromoUsedUp(promo);
  return (
    <article
      aria-label={`Промокод ${promo.code}`}
      className={`neu-inset rounded-2xl p-3 sm:p-4 space-y-2.5 border w-full min-w-0 ${
        promo.active ? 'border-transparent' : 'border-[#BAC5D5]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-mono font-extrabold text-xs sm:text-sm text-text-primary neu-flat-sm px-2.5 py-1 rounded-xl tracking-wider break-all">
            {promo.code}
          </span>
          <span className={`text-xs font-extrabold ${promo.discountType === 'fixed' ? 'text-warning' : 'text-accent'}`}>
            {discountLabel(promo)}
          </span>
          {promo.isReferral && (
            <span className={`${chip} neu-flat-sm text-accent flex items-center gap-1`}>
              <Share2 className="w-3 h-3" aria-hidden="true" />
              Партнёр: {promo.partnerName}
            </span>
          )}
          {expired && <span className={`${chip} neu-tone-warning`}>Срок истёк</span>}
          {usedUp && <span className={`${chip} neu-tone-warning`}>Лимит исчерпан</span>}
          {isLimitedPromo(promo) && !usedUp && (
            <span className={`${chip} neu-flat-sm text-text-primary`}>Только после входа Google</span>
          )}
          {promo.badgeText && <span className={`${chip} neu-fill-accent text-white`}>{promo.badgeText}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <ActiveSwitch checked={promo.active} label={`Действует: ${promo.code}`} onChange={onToggleActive} />
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Скопировать код ${promo.code}`}
            title="Скопировать код"
            className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Изменить промокод ${promo.code}`}
            title="Изменить"
            className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <AdminActionMenu
            of={`промокод ${promo.code}`}
            actions={[
              ...(onDuplicate
                ? [{ id: 'duplicate', label: 'Дублировать промокод', icon: <Files className="w-4 h-4" />, onSelect: onDuplicate }]
                : []),
              { id: 'delete', label: 'Удалить промокод', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>

      <div className="space-y-0.5 min-w-0">
        <h4 className="text-xs font-extrabold text-text-primary leading-snug break-words">{promo.title}</h4>
        <p className="text-xs text-text-secondary leading-relaxed break-words">{promo.description}</p>
      </div>

      {promo.isReferral && commission && (
        <div className="p-2.5 neu-flat-sm rounded-xl space-y-1 text-[11px]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              Продажи: <strong className="text-text-primary font-extrabold">{commission.confirmedSales.toLocaleString('ru-RU')} ₽</strong>
            </span>
            <span>
              {commission.percent === null ? (
                <span className="text-warning font-bold">Процент партнёра не задан</span>
              ) : (
                <>
                  Комиссия ({commission.percent}%):{' '}
                  <strong className="text-accent font-extrabold">{commission.commission.toLocaleString('ru-RU')} ₽</strong>
                </>
              )}
            </span>
          </div>
          <p className="text-[11px] text-text-secondary">
            Оплачено и получено: {commission.confirmedOrders} {pluralRu(commission.confirmedOrders, ['заказ', 'заказа', 'заказов'])}
            {commission.pendingOrders > 0 &&
              ` · ждут оплаты или получения: ${commission.pendingOrders} на ${commission.pendingSales.toLocaleString('ru-RU')} ₽`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 neu-divider-t text-[11px] text-text-secondary min-w-0">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-accent shrink-0" aria-hidden="true" />
          Срок: <strong className="text-text-primary">{promo.expiresAt ? `до ${formatPromoExpiry(promo.expiresAt)}` : 'без срока'}</strong>
        </span>
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3 text-accent shrink-0" aria-hidden="true" />
          Использовано: <strong className="text-text-primary">{promo.usedCount}</strong>
          {isLimitedPromo(promo) ? ` из ${promo.usageLimit}` : ' (без лимита)'}
        </span>
        <span>{promo.minOrderAmount ? `От ${promo.minOrderAmount.toLocaleString('ru-RU')} ₽` : 'Без мин. чека'}</span>
        {promo.applicableCategories && promo.applicableCategories.length > 0 && (
          <span className="flex items-center gap-1 font-bold text-accent break-words">
            <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
            Категории: {categoryNamesText(promo.applicableCategories, categories)}
          </span>
        )}
        {promo.applicableProductIds && promo.applicableProductIds.length > 0 && (
          <span className="flex items-center gap-1 font-bold text-accent">
            <Shirt className="w-3 h-3 shrink-0" aria-hidden="true" />
            Товаров: {promo.applicableProductIds.length}
          </span>
        )}
      </div>
    </article>
  );
};

interface PromoBatchCardProps {
  batch: PromoBatch;
  onSetActive: (active: boolean) => void;
  onCopyUnused: () => void;
  onExportCsv?: () => void;
  onDelete: () => void;
}

/**
 * A batch of single-use codes as one row (finding 14): how many codes, used and still worth sending; copy the unused
 * ones, pause or delete the batch, and its codes under «Коды пачки»
 */
export const PromoBatchCard: React.FC<PromoBatchCardProps> = ({ batch, onSetActive, onCopyUnused, onExportCsv, onDelete }) => {
  const [open, setOpen] = useState(false);
  const first = batch.codes[0];
  const name = batch.prefix ? `Пачка ${batch.prefix}` : first?.batchName ?? 'Пачка кодов';
  const allActive = batch.active === batch.codes.length;
  const listId = `promo-batch-${batch.key.replace(/[^\w-]/g, '')}`;
  const total = batch.codes.length;
  return (
    <article aria-label={name} className="neu-inset rounded-2xl p-3 sm:p-4 space-y-2.5 w-full min-w-0">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-mono font-extrabold text-xs sm:text-sm text-text-primary neu-flat-sm px-2.5 py-1 rounded-xl tracking-wider break-all">
            {name}
          </span>
          {first && (
            <span className={`text-xs font-extrabold ${first.discountType === 'fixed' ? 'text-warning' : 'text-accent'}`}>
              {discountLabel(first)}
            </span>
          )}
          <span className={`${chip} neu-flat-sm text-accent`}>Одноразовые</span>
          {first && isPromoExpired(first) && (
            <span className={`${chip} neu-tone-warning`}>Срок истёк</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <ActiveSwitch checked={allActive} label={`Действует: ${name}`} onChange={() => onSetActive(!allActive)} />
          <AdminActionMenu
            of={name}
            actions={[
              ...(onExportCsv
                ? [{ id: 'csv', label: 'Скачать CSV пачки', icon: <Download className="w-4 h-4" />, onSelect: onExportCsv }]
                : []),
              { id: 'delete', label: 'Удалить пачку', icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>

      <p className="text-xs text-text-primary">
        {total} {pluralRu(total, ['код', 'кода', 'кодов'])} · использовано {batch.used} · можно отправить {batch.unused.length}
        {first?.expiresAt ? ` · до ${formatPromoExpiry(first.expiresAt)}` : ''}
        {first?.minOrderAmount ? ` · от ${first.minOrderAmount.toLocaleString('ru-RU')} ₽` : ''}
      </p>
      {!allActive && batch.active > 0 && (
        <p className="text-[11px] text-text-secondary">
          На паузе {total - batch.active} из {total}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onCopyUnused}
          disabled={batch.unused.length === 0}
          className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            batch.unused.length === 0 ? 'neu-button-disabled' : 'neu-button text-text-primary hover:text-accent cursor-pointer'
          }`}
        >
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Скопировать неиспользованные ({batch.unused.length})</span>
        </button>
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            aria-label={`Скачать CSV пачки ${name}`}
            className="h-9 px-3 rounded-xl neu-button text-xs font-bold text-text-secondary hover:text-accent flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>CSV</span>
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="h-9 px-3 rounded-xl text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Коды пачки</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <ul id={listId} className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {batch.codes.map((p) => {
            const used = (p.usedCount ?? 0) > 0;
            return (
              <li
                key={p.id}
                className={`font-mono text-[11px] font-bold px-2 py-1 rounded-lg ${
                  used ? 'text-text-secondary line-through neu-inset' : 'text-text-primary neu-flat-sm'
                }`}
              >
                {p.code}
                {used && <span className="sr-only"> — использован</span>}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
};
