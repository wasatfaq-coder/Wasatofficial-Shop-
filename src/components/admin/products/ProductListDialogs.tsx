import { Trash2 } from 'lucide-react';
import { Product } from '../../../types';
import { ModalPortal } from '../../ModalPortal';
import { useDialogA11y } from '../../../utils/useDialogA11y';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductList } from './useProductList';

/** Deleting one product */
export function ProductListDialogs({ list, products, onUpdateProducts, onShowToast }: {
  list: ProductList;
  products: Product[];
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'];
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const {
    setSelectedProductIds,
    productToDelete,
    setProductToDelete,
    productToInspect,
    setProductToInspect,
  } = list;
  const deleteProductDialog = useDialogA11y(Boolean(productToDelete), () => setProductToDelete(null));

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
                onClick={async () => {
                  const removed = productToDelete;
                  setProductToDelete(null);
                  // «удален» only after the database answered; a refusal already showed its toast
                  if ((await onUpdateProducts(products.filter((p) => p.id !== removed.id))) === false) return;
                  if (productToInspect?.id === removed.id) setProductToInspect(null);
                  setSelectedProductIds((prev) => prev.filter((id) => id !== removed.id));
                  onShowToast(`Товар «${removed.title}» удален`, 'info');
                }}
                className="flex-1 py-2.5 neu-button-danger rounded-xl text-xs font-extrabold transition-all cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

    </>
  );
}
