import { Check, Coins, Layers, Tag, Trash2, TrendingUp, X } from 'lucide-react';
import { pluralRu } from '../../../utils/pluralize';
import { AdminActionMenu } from '../AdminActionMenu';
import type { ProductList } from './useProductList';

/**
 * The bar under the product list while products are selected (stage 4 of docs/admin-wholesale-plan.md, finding 27,
 * variant А of admin audit 09.10): «Выбрано: n», the two frequent actions and «Ещё» with the rest — one entry per
 * action, the bulk window opens on its tab. Sticks to the bottom of the panel, above the phone menu.
 */
export function ProductSelectionBar({ list }: { list: ProductList }) {
  const { selectedProductIds, setSelectedProductIds, isBulkSaving, handleBulkToggleStock, openBulkOperations, setIsBulkDeleteConfirmOpen } =
    list;
  const count = selectedProductIds.length;
  if (count === 0) return null;

  const toggleButton = (inStock: boolean) => (
    <button
      type="button"
      onClick={() => void handleBulkToggleStock(inStock)}
      disabled={isBulkSaving}
      className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap ${
        isBulkSaving
          ? 'neu-button-disabled text-[#4E5C70]'
          : `neu-button text-[#2D3A4E] cursor-pointer ${inStock ? 'hover:text-success' : 'hover:text-warning'}`
      }`}
    >
      {inStock ? (
        <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" />
      ) : (
        <X className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
      )}
      {inStock ? 'В продажу' : 'Снять с продажи'}
    </button>
  );
  const moreMenu = (
    <AdminActionMenu
      of="выбранные товары"
      actions={[
        { id: 'discounts', label: 'Скидка', icon: <Tag className="w-3.5 h-3.5 text-accent" />, onSelect: () => openBulkOperations('discounts') },
        {
          id: 'pricing',
          label: 'Поднять или снизить цену',
          icon: <TrendingUp className="w-3.5 h-3.5 text-accent" />,
          onSelect: () => openBulkOperations('pricing'),
        },
        { id: 'categories', label: 'Сменить категорию', icon: <Layers className="w-3.5 h-3.5 text-accent" />, onSelect: () => openBulkOperations('categories') },
        { id: 'purchase', label: 'Закупка в $/¥', icon: <Coins className="w-3.5 h-3.5 text-accent" />, onSelect: () => openBulkOperations('purchase') },
        {
          id: 'delete',
          label: 'Удалить',
          icon: <Trash2 className="w-3.5 h-3.5" />,
          danger: true,
          separatorBefore: true,
          onSelect: () => setIsBulkDeleteConfirmOpen(true),
        },
      ]}
    />
  );

  // phone: «Выбрано» and «Ещё» on top, the two actions under them half and half; from sm — one row
  return (
    <div className="sticky bottom-0 z-20 pt-2 pb-1">
      <div
        role="region"
        aria-label="Выбранные товары"
        className="neu-flat rounded-2xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 border border-white/80"
      >
        <div className="flex items-center justify-between gap-2 sm:mr-auto">
          <p className="text-xs font-bold text-[#2D3A4E] flex items-center gap-1" aria-live="polite">
            Выбрано: <strong className="text-accent">{count}</strong>
            <span className="sr-only">{pluralRu(count, ['товар', 'товара', 'товаров'])}</span>
            <button
              type="button"
              onClick={() => setSelectedProductIds([])}
              className="w-8 h-8 -my-1 rounded-xl flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
              aria-label="Снять выбор"
              title="Снять выбор"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </p>
          <div className="sm:hidden">{moreMenu}</div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center">
          {toggleButton(false)}
          {toggleButton(true)}
          <div className="hidden sm:block">{moreMenu}</div>
        </div>
      </div>
    </div>
  );
}
