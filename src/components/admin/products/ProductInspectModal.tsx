import { Edit2, X, Eye, Copy } from 'lucide-react';
import { ProductThumbImage } from '../../ProductThumbImage';
import { Product } from '../../../types';
import { getProductTotalStock } from '../../../utils/inventory';
import { ModalPortal } from '../../ModalPortal';
import { useDialogA11y } from '../../../utils/useDialogA11y';

import type { ProductList } from './useProductList';

/** «Карточка товара»: a quick look at a product with its variations; «Редактировать товар» opens the form */
export function ProductInspectModal({
  list,
  handleOpenEditProduct,
  handleOpenDuplicateProduct,
}: {
  list: ProductList;
  handleOpenEditProduct: (prod: Product) => void;
  handleOpenDuplicateProduct?: (prod: Product) => void;
}) {
  const {
    productToInspect,
    setProductToInspect,
  } = list;
  const inspectDialog = useDialogA11y(Boolean(productToInspect), () => setProductToInspect(null));

  return (
    <>
      {/* ================= MODAL: QUICK PRODUCT INSPECT ================= */}
      {productToInspect && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[80] bg-text-primary/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={inspectDialog.ref} {...inspectDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 text-text-primary max-h-[90vh] overflow-y-auto my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 neu-divider-b">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 id={inspectDialog.titleId} className="text-sm font-extrabold uppercase text-text-primary">
                    Карточка товара
                  </h3>
                  <span className="text-[11px] font-mono text-text-secondary">{productToInspect.id}</span>
                </div>
              </div>
              <button
                onClick={() => setProductToInspect(null)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gallery Thumbnail */}
            <div className="aspect-[16/9] rounded-2xl overflow-hidden neu-inset relative">
              <ProductThumbImage
                product={productToInspect}
                alt={productToInspect.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {productToInspect.badge && (
                <span className="absolute top-2.5 left-2.5 neu-fill-accent text-white text-[11px] font-extrabold px-2 py-0.5 rounded-lg">
                  {productToInspect.badge}
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-baseline gap-2">
                <h4 className="text-base font-extrabold text-text-primary leading-tight">
                  {productToInspect.title}
                </h4>
                <div className="text-right shrink-0">
                  <div className="text-base font-extrabold text-accent">
                    {productToInspect.price.toLocaleString('ru-RU')} ₽
                  </div>
                  {productToInspect.originalPrice && (
                    <div className="text-[11px] text-text-secondary line-through">
                      {productToInspect.originalPrice.toLocaleString('ru-RU')} ₽
                    </div>
                  )}
                </div>
              </div>

              {productToInspect.description && (
                <p className="text-text-secondary text-xs leading-relaxed">
                  {productToInspect.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="neu-inset rounded-xl p-2.5">
                  <span className="text-text-secondary block">Категория:</span>
                  <strong className="text-text-primary">
                    {productToInspect.categoryLabel || productToInspect.category}
                  </strong>
                </div>
                {productToInspect.material?.trim() && (
                  <div className="neu-inset rounded-xl p-2.5">
                    <span className="text-text-secondary block">Состав:</span>
                    <strong className="text-text-primary">{productToInspect.material}</strong>
                  </div>
                )}
              </div>

              {/* SKU Breakdown in inspect modal */}
              {productToInspect.skus && productToInspect.skus.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-text-secondary">
                    <span>Вариации SKU ({productToInspect.skus.length})</span>
                    <span className="text-accent font-extrabold">
                      Всего: {getProductTotalStock(productToInspect)} шт.
                    </span>
                  </div>
                  <div className="neu-inset rounded-xl p-2 max-h-36 overflow-y-auto space-y-1 text-[11px]">
                    {productToInspect.skus.map((sku, sIdx) => (
                      <div
                        key={`inspect-sku-${sku.color}-${sku.size}-${sku.id || sIdx}-${sIdx}`}
                        className="flex items-center justify-between py-1 px-2 neu-flat rounded-lg"
                      >
                        <span className="font-bold text-text-primary">
                          {sku.color} • {sku.size}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary">
                          <span>{sku.skuCode}</span>
                          <span className="font-extrabold text-accent">{sku.stock} шт.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inspect Actions */}
            <div className="flex flex-wrap gap-2 pt-2 neu-divider-t">
              <button
                type="button"
                onClick={() => setProductToInspect(null)}
                className="py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                Закрыть
              </button>
              {handleOpenDuplicateProduct && (
                <button
                  type="button"
                  onClick={() => {
                    const targetProd = productToInspect;
                    setProductToInspect(null);
                    handleOpenDuplicateProduct(targetProd);
                  }}
                  className="flex-1 py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong cursor-pointer transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                  title="Открыть форму создания нового товара с характеристиками и ценой этого товара"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>По образцу (в форму)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const targetProd = productToInspect;
                  setProductToInspect(null);
                  handleOpenEditProduct(targetProd);
                }}
                className="flex-1 py-2.5 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white cursor-pointer transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Редактировать товар</span>
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </>
  );
}
