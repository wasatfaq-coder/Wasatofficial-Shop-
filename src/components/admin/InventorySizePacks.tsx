import React from 'react';
import type { Product, ProductSKU } from '../../types';
import { sizePackBarcodeKey, skuKey } from '../../shared/barcode';
import {
  productSizePacks,
  sizePackColors,
  sizePackCompositionText,
  sizePackPieces,
  sizePacksAvailable,
  sizePackTitle,
} from '../../shared/sizePacks';
import { AdminHint } from './AdminHint';
import { SelectCheckbox } from './SelectCheckbox';
import type { LabelTarget } from './AdminLabelGenerator';

/**
 * «Склад и SKU» → «Остатки»: the size packs («ростовки») of one model (stage 18 of docs/admin-wholesale-plan.md).
 * For each pack one line — how many whole packs the stock makes per colour — and a checkbox per pack colour for labels.
 * Counted from the stock of the product in the database (`sizePacksAvailable`), so it follows every stock change.
 * Shown inside the model of the grouped views («По категориям», «По моделям»); «Списком» has no model level.
 */

/** Key of a pack colour in the set of ticked rows (the same set as the variations' `skuKey`) */
export const packLabelKey = sizePackBarcodeKey;

interface InventorySizePacksProps {
  product: Product;
  selectedKeys: Set<string>;
  onSelect: (keys: string[], selected: boolean) => void;
}

export const InventorySizePacks: React.FC<InventorySizePacksProps> = ({ product, selectedKeys, onSelect }) => {
  const packs = productSizePacks(product)
    .map((pack) => ({ pack, colors: sizePackColors(product, pack) }))
    // a product without colours has no variations to make a pack from
    .filter((entry) => entry.colors.length > 0);
  if (packs.length === 0) return null;

  return (
    <div className="space-y-1.5" role="group" aria-label={`Ростовки: ${product.title}`}>
      {packs.map(({ pack, colors }, index) => {
        const title = sizePackTitle(pack);
        return (
          <div key={pack.id} className="neu-flat-sm rounded-xl p-2 sm:p-2.5 space-y-1.5">
            <div className="flex items-start gap-1 min-w-0">
              <p className="text-[11px] font-semibold text-[#2D3A4E] leading-snug break-words min-w-0">
                <span className="font-extrabold">
                  {title} ({sizePackPieces(pack)} шт.)
                </span>
                : можно собрать —{' '}
                {colors.map((color, i) => {
                  const available = sizePacksAvailable(product, pack, color);
                  return (
                    <React.Fragment key={color}>
                      {i > 0 && ', '}
                      <span className={`font-extrabold whitespace-nowrap ${available > 0 ? 'text-success' : 'text-danger'}`}>
                        {color} {available}
                      </span>
                    </React.Fragment>
                  );
                })}
              </p>
              {index === 0 && (
                <AdminHint label="Ростовка">
                  Набор размеров одного цвета. «Можно собрать» считается по остаткам вариантов.
                </AdminHint>
              )}
            </div>
            <p className="text-[11px] font-semibold text-[#4E5C70]">{sizePackCompositionText(pack)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1">
              <span className="text-[11px] font-semibold text-[#4E5C70]">Этикетки:</span>
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
                      <span className="text-[11px] font-bold text-[#2D3A4E] break-words min-w-0">{color}</span>
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
    <p className="text-xs font-semibold text-[#4E5C70] leading-snug">
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
