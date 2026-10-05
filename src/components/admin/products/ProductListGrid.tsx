import { Trash2, Edit2, Eye, Copy } from 'lucide-react';
import { Product } from '../../../types';
import { SelectCheckbox } from '../SelectCheckbox';
import { getProductTotalStock, isHiddenFromSale } from '../../../utils/inventory';
import { NotConfigured } from '../../NotConfigured';
import type { StoreCategory } from '../../../types';
import { productImage } from '../../../utils/productImage';

import type { ProductList } from './useProductList';

/** The filtered products: photo, price, stock, quick view, copy, delete and «Редактировать» */
export function ProductListGrid({ list, products, categories, duplicatingId, handleDuplicateProduct, handleOpenEditProduct }: {
  list: ProductList;
  products: Product[];
  categories: StoreCategory[];
  duplicatingId: string | null;
  handleDuplicateProduct: (prod: Product) => Promise<void>;
  handleOpenEditProduct: (prod: Product) => void;
}) {
  const {
    selectedProductIds,
    setProductToDelete,
    setProductToInspect,
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
          <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-[#4E5C70]">
            <p className="text-xs font-bold text-[#2D3A4E]">Товары не найдены</p>
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
                className={`neu-inset rounded-2xl p-3 sm:p-3.5 transition-all border ${
                  isSelected ? 'border-accent ring-1 ring-accent/40' : 'border-transparent'
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
                    <img
                      src={productImage(prod)}
                      alt={prod.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Main Product Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] leading-snug line-clamp-1 sm:truncate"
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
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-inset text-danger shrink-0 border border-danger/25 whitespace-nowrap">
                          Снят с витрины
                        </span>
                      ) : prod.inStock === false ? (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-inset text-[#4E5C70] shrink-0 whitespace-nowrap">
                          Распродан
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-semibold flex-wrap">
                      <span className="font-mono text-accent font-bold text-[11px] bg-[#D8DFE8] px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        {primarySku}
                      </span>
                      <span className="font-extrabold text-[#2D3A4E] text-xs shrink-0 whitespace-nowrap">
                        {prod.price.toLocaleString('ru-RU')} ₽
                      </span>
                      {prod.originalPrice && (
                        <span className="line-through text-[#4E5C70] text-[11px] shrink-0 whitespace-nowrap">
                          {prod.originalPrice.toLocaleString('ru-RU')} ₽
                        </span>
                      )}
                      <span
                        className={`font-extrabold text-[11px] px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap ${
                          totalStock === 0
                            ? 'text-danger bg-danger-soft border border-danger/25'
                            : totalStock < 3
                            ? 'text-warning bg-warning-soft border border-warning/25'
                            : 'text-success bg-success-soft border border-success/25'
                        }`}
                      >
                        Остаток: {totalStock} шт.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Toolbar with Clear Visual Hierarchy */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-[#BAC5D5]/30 sm:border-t-0">
                  {/* Secondary & Destructive Tools */}
                  <div className="flex items-center gap-1.5">
                    {/* Secondary: Preview */}
                    <button
                      onClick={() => setProductToInspect(prod)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-accent transition-all cursor-pointer shrink-0"
                      title="Быстрый просмотр карточки"
                      aria-label="Быстрый просмотр карточки"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Secondary: Duplicate */}
                    <button
                      onClick={() => void handleDuplicateProduct(prod)}
                      disabled={duplicatingId !== null}
                      aria-busy={duplicatingId === prod.id}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-[#4E5C70] transition-all shrink-0 ${
                        duplicatingId === null ? 'neu-button hover:text-success cursor-pointer' : 'neu-button-disabled'
                      }`}
                      title="Дублировать товар (копировать)"
                      aria-label="Дублировать товар (копировать)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Danger / Destructive: Delete */}
                    <button
                      onClick={() => setProductToDelete(prod)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center transition-all cursor-pointer shrink-0"
                      title="Удалить товар"
                      aria-label="Удалить товар"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Primary Action: Edit */}
                  <button
                    onClick={() => handleOpenEditProduct(prod)}
                    className="h-8 px-3.5 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    title="Редактировать товар"
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
