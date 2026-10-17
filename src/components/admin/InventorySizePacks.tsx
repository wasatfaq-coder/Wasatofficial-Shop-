import React, { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import type { Product, ProductSKU } from '../../types';
import { auth } from '../../firebase';
import { sizePackBarcodeKey, skuKey } from '../../shared/barcode';
import {
  brokenPackState,
  packStockSummary,
  productSizePacks,
  sizePackColors,
  sizePackCompositionText,
  sizePackPieces,
  sizePackTitle,
  sizePacksAvailable,
} from '../../shared/sizePacks';
import { saleChannelOf } from '../../shared/wholesalePricing';
import { formatOrderDate } from '../../shared/orderDate';
import {
  packMarkId,
  setPackMarkInFirestore,
  subscribeToPackMarks,
  type PackMark,
} from '../../utils/firebaseSync';
import { AdminHint } from './AdminHint';
import { SelectCheckbox } from './SelectCheckbox';
import type { LabelTarget } from './AdminLabelGenerator';

/**
 * «Склад и SKU» → «Остатки»: the size packs («ростовки») of one model (stage 18 of docs/admin-wholesale-plan.md
 * and stages 3 & 5 of docs/broken-pack-plan.md).
 * For each pack: how many whole packs can be assembled per colour, and for `saleChannel === 'both'` two explicit
 * counters («Целых упаковок» and «В разбитых») plus the warehouse keeper's «Упаковка вскрыта» mark (`pack_marks`).
 */

/** Key of a pack colour in the set of ticked rows (the same set as the variations' `skuKey`) */
export const packLabelKey = sizePackBarcodeKey;

// Shared listener across all mounted components so only one Firestore snapshot is active
let sharedMarks: Record<string, PackMark> = {};
const markListeners = new Set<(marks: Record<string, PackMark>) => void>();
let unsubscribeSharedMarks: (() => void) | null = null;

export function usePackMarks(): Record<string, PackMark> {
  const [marks, setMarks] = useState<Record<string, PackMark>>(() => sharedMarks);
  useEffect(() => {
    markListeners.add(setMarks);
    if (!unsubscribeSharedMarks) {
      unsubscribeSharedMarks = subscribeToPackMarks((next) => {
        sharedMarks = next;
        markListeners.forEach((fn) => fn(next));
      });
    } else {
      setMarks(sharedMarks);
    }
    return () => {
      markListeners.delete(setMarks);
      if (markListeners.size === 0 && unsubscribeSharedMarks) {
        unsubscribeSharedMarks();
        unsubscribeSharedMarks = null;
      }
    };
  }, []);
  return marks;
}

interface InventorySizePacksProps {
  product: Product;
  selectedKeys: Set<string>;
  onSelect: (keys: string[], selected: boolean) => void;
}

export const InventorySizePacks: React.FC<InventorySizePacksProps> = ({ product, selectedKeys, onSelect }) => {
  const packMarks = usePackMarks();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const packs = productSizePacks(product)
    .map((pack) => ({ pack, colors: sizePackColors(product, pack) }))
    // a product without colours has no variations to make a pack from
    .filter((entry) => entry.colors.length > 0);
  if (packs.length === 0) return null;

  const isBothChannel = saleChannelOf(product) === 'both';

  const handleToggleMark = async (packId: string, color: string, currentlyOpened: boolean) => {
    const docId = packMarkId(product.id, packId, color);
    if (busyKey === docId) return;
    setBusyKey(docId);
    try {
      await setPackMarkInFirestore(
        product.id,
        packId,
        color,
        !currentlyOpened,
        auth.currentUser?.email ?? 'admin',
      );
    } catch {
      // handled by firebaseSync
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-1.5" role="group" aria-label={`Ростовки: ${product.title}`}>
      {packs.map(({ pack, colors }, index) => {
        const title = sizePackTitle(pack);
        const pieces = sizePackPieces(pack);
        return (
          <div key={pack.id} className="neu-flat-sm rounded-xl p-2 sm:p-2.5 space-y-1.5">
            <div className="flex items-start gap-1 min-w-0">
              <p className="text-[11px] font-extrabold text-text-primary leading-snug break-words min-w-0">
                {title} ({pieces} шт.): можно собрать —{' '}
                {colors.map((color, i) => {
                  const count = sizePacksAvailable(product, pack, color);
                  return (
                    <React.Fragment key={color}>
                      {i > 0 && ' · '}
                      <span className={count === 0 ? 'text-danger' : 'text-accent'}>
                        {color} {count}
                      </span>
                    </React.Fragment>
                  );
                })}
              </p>
              {index === 0 && (
                <AdminHint label="Ростовка">
                  Набор размеров одного цвета ({sizePackCompositionText(pack)}). «Можно собрать» и остаток в разбитых считаются автоматически по остаткам вариантов. Пометка «Вскрыта» — памятка кладовщика, остатки не меняет.
                </AdminHint>
              )}
            </div>

            {isBothChannel && (
              <ul className="space-y-1 pl-1" aria-label={`Остаток ростовки по цветам: ${title}`}>
                {colors.map((color) => {
                  const summary = packStockSummary(product, pack, color);
                  const broken = brokenPackState(product, pack, color);
                  const docId = packMarkId(product.id, pack.id, color);
                  const mark = packMarks[docId];
                  const hasAnyPieces = summary.wholePacks > 0 || summary.totalBrokenPieces > 0 || Boolean(broken);
                  const leftoverParts = summary.sizes
                    .filter((s) => s.brokenStock > 0)
                    .map((s) => `${s.size} ×${s.brokenStock}`)
                    .join(' · ');

                  return (
                    <li key={color} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug">
                      <span className="font-bold text-text-primary">{color}:</span>
                      <span className="font-semibold text-text-secondary">
                        Целых упаковок:{' '}
                        <strong className={summary.wholePacks > 0 ? 'text-success' : 'text-danger'}>
                          {summary.wholePacks}
                        </strong>
                      </span>
                      <span className="text-text-secondary">·</span>
                      <span className="font-semibold text-text-secondary">
                        В разбитых:{' '}
                        <strong className={summary.totalBrokenPieces > 0 ? 'text-warning' : 'text-text-primary'}>
                          {summary.totalBrokenPieces} шт.
                        </strong>
                        {leftoverParts ? ` (${leftoverParts})` : ''}
                      </span>
                      {mark && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg neu-tone-warning text-[11px] font-extrabold">
                          <PackageOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>
                            Вскрыта {formatOrderDate(new Date(mark.openedAt))}
                            {mark.openedBy ? ` · ${mark.openedBy}` : ''}
                          </span>
                        </span>
                      )}
                      {(hasAnyPieces || mark) && (
                        <button
                          type="button"
                          disabled={busyKey === docId}
                          onClick={() => void handleToggleMark(pack.id, color, Boolean(mark))}
                          className="min-h-8 px-2.5 py-1 rounded-xl neu-button text-[11px] font-bold text-text-secondary hover:text-accent cursor-pointer"
                        >
                          {mark ? 'Снять пометку' : 'Отметить вскрытой'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 pt-0.5">
              <span className="text-[11px] font-semibold text-text-secondary">Этикетки:</span>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={`Этикетки ростовки: ${title}`}>
                {colors.map((color) => {
                  const key = packLabelKey(product.id, pack.id, color);
                  return (
                    <li key={color} className="flex items-center gap-2 min-w-0">
                      <SelectCheckbox
                        checked={selectedKeys.has(key)}
                        onToggle={() => onSelect([key], !selectedKeys.has(key))}
                        label={`Этикетка ростовки: ${title}, ${color}`}
                      />
                      <span className="text-[11px] font-bold text-text-primary break-words min-w-0">{color}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** One line under «Списком»: the packs are shown in the models of the other views */
export const InventoryPacksFlatNote: React.FC<{ products: Product[] }> = ({ products }) =>
  products.some((p) => productSizePacks(p).length > 0) ? (
    <p className="text-xs font-semibold text-text-secondary leading-snug">
      Ростовки и их этикетки — в группировке «По категориям» или «По моделям», в модели.
    </p>
  ) : null;

/**
 * Label targets of the ticked rows: the variations (in the order of the matrix), then the ticked pack colours.
 * A key of a pack that is gone (deleted, colour taken off) is ignored.
 */
export function selectedLabelTargets(
  rows: { product: Product; sku: ProductSKU }[],
  products: Product[],
  selectedKeys: Set<string>
): LabelTarget[] {
  const targets: LabelTarget[] = rows
    .filter(({ product, sku }) => selectedKeys.has(skuKey(product.id, sku.id)))
    .map(({ product, sku }) => ({ productId: product.id, skuId: sku.id }));
  for (const product of products)
    for (const pack of productSizePacks(product))
      for (const color of sizePackColors(product, pack))
        if (selectedKeys.has(packLabelKey(product.id, pack.id, color))) targets.push({ productId: product.id, packId: pack.id, color });
  return targets;
}
