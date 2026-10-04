import { Trash2, X } from 'lucide-react';
import { Product } from '../../../types';
import { ModalPortal } from '../../ModalPortal';
import { useDialogA11y } from '../../../utils/useDialogA11y';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductList } from './useProductList';

/** Deleting one product and the bulk discount of the selected ones */
export function ProductListDialogs({ list, products, onUpdateProducts, onShowToast }: {
  list: ProductList;
  products: Product[];
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'];
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const {
    selectedProductIds,
    setSelectedProductIds,
    isBulkDiscountModalOpen,
    setIsBulkDiscountModalOpen,
    bulkDiscountPercent,
    setBulkDiscountPercent,
    productToDelete,
    setProductToDelete,
    productToInspect,
    setProductToInspect,
    handleBulkApplyDiscount,
  } = list;
  const deleteProductDialog = useDialogA11y(Boolean(productToDelete), () => setProductToDelete(null));
  const bulkDiscountDialog = useDialogA11y(isBulkDiscountModalOpen, () => setIsBulkDiscountModalOpen(false));

  return (
    <>
      {/* ================= MODAL: DELETE PRODUCT CONFIRMATION ================= */}
      {productToDelete && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={deleteProductDialog.ref} {...deleteProductDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-3.5 text-[#2D3A4E] border border-white/80 my-auto text-center">
            <div className="w-12 h-12 rounded-2xl neu-inset mx-auto flex items-center justify-center text-danger">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 id={deleteProductDialog.titleId} className="text-sm sm:text-base font-extrabold text-[#2D3A4E]">Удалить товар?</h3>
              <p className="text-xs text-[#4E5C70] leading-relaxed">
                Вы действительно хотите безвозвратно удалить{' '}
                <strong className="text-[#2D3A4E]">«{productToDelete.title}»</strong> из каталога?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  if (productToInspect?.id === productToDelete.id) {
                    setProductToInspect(null);
                  }
                  onUpdateProducts(products.filter((p) => p.id !== productToDelete.id));
                  setSelectedProductIds((prev) => prev.filter((id) => id !== productToDelete.id));
                  onShowToast(`Товар «${productToDelete.title}» удален`, 'info');
                  setProductToDelete(null);
                }}
                className="flex-1 py-2.5 neu-button-danger rounded-xl text-xs font-extrabold transition-all cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {/* Bulk Discount Modal */}
      {isBulkDiscountModalOpen && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div ref={bulkDiscountDialog.ref} {...bulkDiscountDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-6 max-w-sm w-full space-y-4 text-[#2D3A4E] border border-white/80 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <h3 id={bulkDiscountDialog.titleId} className="text-sm font-extrabold uppercase text-[#2D3A4E]">Скидка на товары</h3>
              <button
                onClick={() => setIsBulkDiscountModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4E5C70] font-bold">
              Применить процент скидки к <strong className="text-accent">{selectedProductIds.length}</strong> товарам:
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[10, 15, 20, 25, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setBulkDiscountPercent(pct)}
                  className={`py-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 cursor-pointer ${
                    bulkDiscountPercent === pct
                      ? 'neu-pill-active'
                      : 'neu-button text-[#2D3A4E] hover:text-accent'
                  }`}
                >
                  -{pct}%
                </button>
              ))}
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setIsBulkDiscountModalOpen(false)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleBulkApplyDiscount}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-extrabold text-white transition-all"
              >
                Применить
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </>
  );
}
