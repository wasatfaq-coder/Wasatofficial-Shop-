import { Trash2, Edit2, Eye, Copy, Pencil } from 'lucide-react';
import { ProductThumbImage } from '../../ProductThumbImage';
import { Product } from '../../../types';
import { SelectCheckbox } from '../SelectCheckbox';
import { getProductTotalStock, isHiddenFromSale, stockLevel } from '../../../utils/inventory';
import { NotConfigured } from '../../NotConfigured';
import type { StoreCategory } from '../../../types';

import { AdminHint } from '../AdminHint';
import type { ProductList } from './useProductList';

/** The filtered products: photo, price and stock (each opens its quick edit, finding 28), quick view, copy, delete and «Редактировать» */
export function ProductListGrid({ list, products, categories, duplicatingId, handleDuplicateProduct, handleOpenEditProduct, lowStockThreshold }: {
  list: ProductList;
  products: Product[];
  categories: StoreCategory[];
  duplicatingId: string | null;
  handleDuplicateProduct: (prod: Product) => Promise<void>;
  handleOpenEditProduct: (prod: Product) => void;
  lowStockThreshold: number;
}) {
  const {
    selectedProductIds,
    setProductToDelete,
    setProductToInspect,
    setPriceEditId,
    setStockEditId,
    filteredProducts,
    handleToggleSelectOne,
  } = list;

  return (
    <>
      {/* Products List Grid */}
      <div className="space-y-2">
        {products.length === 0 ? (
          <NotConfigured
            title="Каталог"
            hint={
              categories.length === 0
                ? 'Сначала добавьте категории во вкладке «Категории», затем — первый товар. Покупатели пока видят «Каталог: не настроено».'
                : 'Добавьте первый товар кнопкой «Добавить товар». Покупатели пока видят «Каталог: не настроено».'
            }
          />
        ) : filteredProducts.length === 0 ? (
          <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-text-secondary">
            <p className="text-xs font-bold text-text-primary">Товары не найдены</p>
            <p className="text-xs">Попробуйте изменить поисковый запрос или фильтры</p>
          </div>
        ) : (
          filteredProducts.map((prod, pIdx) => {
            const isSelected = selectedProductIds.includes(prod.id);
            const totalStock = getProductTotalStock(prod);
            const primarySku = prod.skus?.[0]?.skuCode || `WS-CAT-${prod.id.slice(-4)}`;

            return (
              <div
                key={`admin-product-${prod.id}-${pIdx}`}
                className={`rounded-2xl p-3 sm:p-3.5 transition-all ${
                  isSelected ? 'neu-pill-active' : 'neu-inset'
                } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
              >
                {/* Product Main Content */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  {/* Selection Checkbox */}
                  <SelectCheckbox
                    checked={isSelected}
                    onToggle={() => handleToggleSelectOne(prod.id)}
                    label={`Выбрать товар «${prod.title}»`}
                    className="mt-1 sm:mt-0"
                  />

                  {/* Product Thumbnail */}
                  <div className="relative w-12 h-14 sm:w-14 sm:h-14 rounded-xl overflow-hidden neu-inset shrink-0">
                    <ProductThumbImage
                      product={prod}
                      alt={prod.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Main Product Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className="text-xs sm:text-sm font-extrabold text-text-primary leading-snug line-clamp-1 sm:truncate"
                        title={prod.title}
                      >
                        {prod.title}
                      </h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg neu-flat-sm text-accent shrink-0 whitespace-nowrap">
                        {prod.categoryLabel || prod.category}
                      </span>
                      {prod.badge && (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-fill-accent text-white shrink-0 leading-tight whitespace-nowrap">
                          {prod.badge}
                        </span>
                      )}
                      {isHiddenFromSale(prod) ? (
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-tone-danger text-danger whitespace-nowrap">
                            Снят с витрины
                          </span>
                          <AdminHint label="Снят с витрины">Покупатели не видят товар и не могут его заказать.</AdminHint>
                        </span>
                      ) : prod.inStock === false ? (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-inset text-text-secondary shrink-0 whitespace-nowrap">
                          Распродан
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-text-secondary font-semibold flex-wrap">
                      <span className="font-mono text-accent font-bold text-[11px] neu-flat-sm px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        {primarySku}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPriceEditId(prod.id)}
                        aria-label={`${prod.price.toLocaleString('ru-RU')} ₽ — изменить цену «${prod.title}»`}
                        title="Изменить цену"
                        className="min-h-8 -mx-1 px-1 rounded-lg font-extrabold text-text-primary hover:text-accent text-xs shrink-0 whitespace-nowrap inline-flex items-center gap-1 underline decoration-dotted decoration-accent/60 underline-offset-2 cursor-pointer"
                      >
                        {prod.price.toLocaleString('ru-RU')} ₽
                        <Pencil className="w-3 h-3 text-accent" aria-hidden="true" />
                      </button>
                      {prod.originalPrice && (
                        <span className="line-through text-text-secondary text-[11px] shrink-0 whitespace-nowrap">
                          {prod.originalPrice.toLocaleString('ru-RU')} ₽
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setStockEditId(prod.id)}
                          aria-label={`Остаток: ${totalStock} шт. — изменить «${prod.title}»`}
                          title="Изменить остаток по цветам и размерам"
                          className={`min-h-8 font-extrabold text-[11px] px-2 py-0.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1 cursor-pointer hover:underline underline-offset-2 ${
                            stockLevel(totalStock, lowStockThreshold) === 'out'
                              ? 'neu-tone-danger'
                              : stockLevel(totalStock, lowStockThreshold) === 'low'
                              ? 'neu-tone-warning'
                              : 'neu-tone-success'
                          }`}
                        >
                          Остаток: {totalStock} шт.
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <AdminHint label="Остаток">Сумма по всем цветам и размерам. Нажмите, чтобы поменять остаток каждого.</AdminHint>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Toolbar with Clear Visual Hierarchy */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 neu-divider-t sm:shadow-none">
                  {/* Secondary & Destructive Tools */}
                  <div className="flex items-center gap-1.5">
                    {/* Secondary: Preview */}
                    <button
                      onClick={() => setProductToInspect(prod)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-accent transition-all cursor-pointer shrink-0"
                      title={`Быстрый просмотр карточки: «${prod.title}»`}
                      aria-label={`Быстрый просмотр карточки: «${prod.title}»`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Secondary: Duplicate */}
                    <button
                      onClick={() => void handleDuplicateProduct(prod)}
                      disabled={duplicatingId !== null}
                      aria-busy={duplicatingId === prod.id}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-text-secondary transition-all shrink-0 ${
                        duplicatingId === null ? 'neu-button hover:text-success cursor-pointer' : 'neu-button-disabled'
                      }`}
                      title={`Дублировать товар: «${prod.title}»`}
                      aria-label={`Дублировать товар: «${prod.title}»`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Danger / Destructive: Delete */}
                    <button
                      onClick={() => setProductToDelete(prod)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center transition-all cursor-pointer shrink-0"
                      title={`Удалить товар: «${prod.title}»`}
                      aria-label={`Удалить товар: «${prod.title}»`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Primary Action: Edit */}
                  <button
                    onClick={() => handleOpenEditProduct(prod)}
                    className="h-8 px-3.5 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    title={`Редактировать товар: «${prod.title}»`}
                    aria-label={`Редактировать товар: «${prod.title}»`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Редактировать</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
