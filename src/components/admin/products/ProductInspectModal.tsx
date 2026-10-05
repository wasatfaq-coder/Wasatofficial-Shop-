import { Edit2, X, Eye } from 'lucide-react';
import { Product } from '../../../types';
import { getProductTotalStock } from '../../../utils/inventory';
import { ModalPortal } from '../../ModalPortal';
import { useDialogA11y } from '../../../utils/useDialogA11y';

import type { ProductList } from './useProductList';

/** «Карточка товара»: a quick look at a product with its variations; «Редактировать товар» opens the form */
export function ProductInspectModal({ list, handleOpenEditProduct }: { list: ProductList; handleOpenEditProduct: (prod: Product) => void }) {
  const {
    productToInspect,
    setProductToInspect,
  } = list;
  const inspectDialog = useDialogA11y(Boolean(productToInspect), () => setProductToInspect(null));

  return (
    <>
      {/* ================= MODAL: QUICK PRODUCT INSPECT ================= */}
      {productToInspect && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={inspectDialog.ref} {...inspectDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[90vh] overflow-y-auto my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 id={inspectDialog.titleId} className="text-sm font-extrabold uppercase text-[#2D3A4E]">
                    Карточка товара
                  </h3>
                  <span className="text-[11px] font-mono text-[#4E5C70]">{productToInspect.id}</span>
                </div>
              </div>
              <button
                onClick={() => setProductToInspect(null)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gallery Thumbnail */}
            <div className="aspect-[16/9] rounded-2xl overflow-hidden neu-inset relative">
              <img
                src={productToInspect.images?.[0]}
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
                <h4 className="text-base font-extrabold text-[#2D3A4E] leading-tight">
                  {productToInspect.title}
                </h4>
                <div className="text-right shrink-0">
                  <div className="text-base font-extrabold text-accent">
                    {productToInspect.price.toLocaleString('ru-RU')} ₽
                  </div>
                  {productToInspect.originalPrice && (
                    <div className="text-[11px] text-[#4E5C70] line-through">
                      {productToInspect.originalPrice.toLocaleString('ru-RU')} ₽
                    </div>
                  )}
                </div>
              </div>

              {productToInspect.description && (
                <p className="text-[#4E5C70] text-xs leading-relaxed">
                  {productToInspect.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="neu-inset rounded-xl p-2.5">
                  <span className="text-[#4E5C70] block">Категория:</span>
                  <strong className="text-[#2D3A4E]">
                    {productToInspect.categoryLabel || productToInspect.category}
                  </strong>
                </div>
                {productToInspect.material?.trim() && (
                  <div className="neu-inset rounded-xl p-2.5">
                    <span className="text-[#4E5C70] block">Состав:</span>
                    <strong className="text-[#2D3A4E]">{productToInspect.material}</strong>
                  </div>
                )}
              </div>

              {/* SKU Breakdown in inspect modal */}
              {productToInspect.skus && productToInspect.skus.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#4E5C70]">
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
                        <span className="font-bold text-[#2D3A4E]">
                          {sku.color} • {sku.size}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-[#4E5C70]">
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
            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setProductToInspect(null)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetProd = productToInspect;
                  setProductToInspect(null);
                  handleOpenEditProduct(targetProd);
                }}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-extrabold text-white cursor-pointer transition-all flex items-center justify-center gap-2"
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
