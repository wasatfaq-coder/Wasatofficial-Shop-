import React, { useState, useMemo } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { pluralRu } from '../../utils/pluralize';
import { X } from 'lucide-react';
import { Product, ProductSKU } from '../../types';
import { deleteProductPhotos, loadProductPhotos, productWithPreviews, saveProductPhotos } from '../../utils/firebaseSync';
import { previewsMoved } from '../../utils/productPreviews';
import { generateBarcode, withMissingSkus } from '../../utils/inventory';
import { copyProductPhotos } from '../../utils/productPhotos';
import { collectBarcodes } from '../../shared/barcode';
import { AdminBulkOperationsModal } from './AdminBulkOperationsModal';
import { ModalPortal } from '../ModalPortal';
import { TextEditModal } from './TextEditModal';
import type { StoreCategory } from '../../types';
import { DiscardChangesDialog } from '../DiscardChangesDialog';
import { useProductList } from './products/useProductList';
import { ProductListToolbar } from './products/ProductListToolbar';
import { ProductListGrid } from './products/ProductListGrid';
import { ProductCsvImportModal } from './products/ProductCsvImportModal';
import { ProductInspectModal } from './products/ProductInspectModal';
import { ProductListDialogs } from './products/ProductListDialogs';
import { useProductForm } from './products/useProductForm';
import { ProductFormModal } from './products/ProductFormModal';

export interface AdminProductsTabProps {
  /** Admin → «Категории»: the only category list for products */
  categories?: StoreCategory[];
  products: Product[];
  /** Resolves to false when the database refused the write (the error toast is already shown) */
  onUpdateProducts: (updated: Product[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}


/** «Все категории» and the categories from Admin → «Категории» */
export type ProductCategoryOption = { id: string; name: string };

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  categories = [],
  products,
  onUpdateProducts,
  onShowToast,
}) => {
  // «Все категории» for the filter + the categories from Admin → «Категории»
  const CATEGORY_OPTIONS = useMemo(() => [{ id: 'all', name: 'Все категории' }, ...categories], [categories]);
  const list = useProductList(products, onUpdateProducts, onShowToast, CATEGORY_OPTIONS);
  const {
    isBulkDeleteConfirmOpen,
    setIsBulkDeleteConfirmOpen,
    selectedProductIds,
    setSelectedProductIds,
    isBulkOperationsModalOpen,
    setIsBulkOperationsModalOpen,
    handleBulkDelete,
  } = list;

  const form = useProductForm({ categories, products, onUpdateProducts, onShowToast, CATEGORY_OPTIONS });
  const {
    formCategory,
    formCategoryOptions,
    previewZoomImage,
    setPreviewZoomImage,
    zoomDialog,
    textEditModal,
    setTextEditModal,
    setFormDescription,
    pendingRemoval,
    setPendingRemoval,
    productFormGuard,
    handleOpenAddProduct,
    handleOpenEditProduct,
  } = form;
  /** The product whose copy is being made (its photos are read and written first) */
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Duplicate Product Handler
  const handleDuplicateProduct = async (prod: Product) => {
    const newId = `prod-${Date.now()}`;
    const baseSkus = withMissingSkus(prod);
    const taken = collectBarcodes(products);
    const colorCodes = new Map<string, string>();
    const clonedSkus: ProductSKU[] = baseSkus.map((s, idx) => {
      // A copy is a different product: its own barcode per colour
      const color = s.color.trim().toLowerCase();
      if (!colorCodes.has(color)) colorCodes.set(color, generateBarcode(taken));
      return {
        ...s,
        id: `${newId}-${s.color}-${s.size}-${idx}`,
        skuCode: s.skuCode ? `${s.skuCode}-CPY` : `WS-CPY-${newId.slice(-4)}-${s.size}`,
        barcode: colorCodes.get(color),
      };
    });

    // The copy gets its own photo documents: with shared ones, removing a photo from the copy deleted the original's
    let photos: ReturnType<typeof copyProductPhotos>;
    setDuplicatingId(prod.id);
    // the copy gets its own previews too (product_previews, stage 6 of docs/catalog-scale-plan.md)
    let images = prod.images;
    try {
      const withPreviews = await productWithPreviews(prod);
      if (previewsMoved(withPreviews)) throw new Error(`Previews of product ${prod.id} were not read`);
      images = withPreviews.images;
      photos = copyProductPhotos(newId, prod.photoIds, await loadProductPhotos(prod.photoIds ?? []));
      await saveProductPhotos(photos.newPhotos);
    } catch (err) {
      console.error('Photos of the copy were not saved:', err);
      onShowToast(`Копия «${prod.title}» не создана: база не приняла фото. Проверьте соединение`, 'error');
      setDuplicatingId(null);
      return;
    }

    const cloned: Product = {
      ...prod,
      id: newId,
      title: `${prod.title} (Копия)`,
      skus: clonedSkus,
      images,
      photoIds: photos.photoIds,
      previewKey: undefined,
      isNew: true,
      badge: prod.badge || 'NEW',
    };

    const saved = await onUpdateProducts([cloned, ...products]);
    setDuplicatingId(null);
    if (saved === false) {
      deleteProductPhotos(photos.newPhotos.map((p) => p.id)).catch((err) => console.error('Photos of the copy were not removed:', err));
      return;
    }
    onShowToast(`Создана копия товара "${prod.title}"`, 'success');
  };

  return (
    <div className="space-y-3.5">
      <ProductListToolbar
        list={list}
        products={products}
        categories={categories}
        CATEGORY_OPTIONS={CATEGORY_OPTIONS}
        handleOpenAddProduct={handleOpenAddProduct}
        setTextEditModal={setTextEditModal}
      />

      <ProductListGrid
        list={list}
        products={products}
        categories={categories}
        duplicatingId={duplicatingId}
        handleDuplicateProduct={handleDuplicateProduct}
        handleOpenEditProduct={handleOpenEditProduct}
      />

      {/* ================= MODAL: CREATE / EDIT PRODUCT ================= */}
      <ProductFormModal form={form} categories={categories} products={products} onShowToast={onShowToast} />

      {/* ================= MODAL: CSV IMPORT ================= */}
      <ProductCsvImportModal
        list={list}
        products={products}
        categories={categories}
        onUpdateProducts={onUpdateProducts}
        onShowToast={onShowToast}
      />

      {/* ================= MODAL: QUICK PRODUCT INSPECT ================= */}
      <ProductInspectModal list={list} handleOpenEditProduct={handleOpenEditProduct} />

      {/* ================= MODAL: DELETE PRODUCT CONFIRMATION, BULK DISCOUNT ================= */}
      <ProductListDialogs list={list} products={products} onUpdateProducts={onUpdateProducts} onShowToast={onShowToast} />

      {/* Photo Zoom Modal */}
      {previewZoomImage && (
        <ModalPortal><div
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            ref={zoomDialog.ref}
            {...zoomDialog.props}
            className="relative max-w-2xl max-h-[85vh] neu-flat rounded-3xl overflow-hidden p-2 border border-white/60 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewZoomImage(null)}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition-colors shadow-[var(--neu-on-photo)]"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewZoomImage}
              alt="Увеличенный просмотр"
              className="max-h-[80vh] w-auto object-contain rounded-2xl mx-auto"
              referrerPolicy="no-referrer"
            />
          </div>
        </div></ModalPortal>
      )}

      {/* Advanced Bulk Operations Modal */}
      <AdminBulkOperationsModal
        isOpen={isBulkOperationsModalOpen}
        onClose={() => setIsBulkOperationsModalOpen(false)}
        categories={categories}
        selectedProducts={products.filter((p) => selectedProductIds.includes(p.id))}
        onApplyBulkChanges={(updatedList, summary) => {
          const map = new Map(updatedList.map((p) => [p.id, p]));
          const merged = products.map((p) => (map.has(p.id) ? map.get(p.id)! : p));
          setIsBulkOperationsModalOpen(false);
          setSelectedProductIds([]);
          // «applied» only after the database answered; a failure already showed «Не сохранено: …»
          void Promise.resolve(onUpdateProducts(merged)).then((saved) => {
            if (saved !== false) onShowToast(summary || 'Изменения применены', 'success');
          });
        }}
      />

      <DiscardChangesDialog {...productFormGuard.dialogProps} what="Изменения товара" />

      {/* Removal confirmation for photos, colors, sizes and stock (above the product form) */}
      <ConfirmDialog
        isOpen={Boolean(pendingRemoval)}
        title={pendingRemoval?.title ?? ''}
        message={pendingRemoval?.message ?? ''}
        preview={pendingRemoval?.preview}
        confirmLabel={pendingRemoval?.confirmLabel}
        cancelLabel="Оставить"
        onConfirm={() => pendingRemoval?.run()}
        onClose={() => setPendingRemoval(null)}
      />

      {/* Dedicated Text Edit Modal for the description with synchronized quick phrases and accents */}
      {textEditModal && textEditModal.isOpen && (
        <TextEditModal
          isOpen={textEditModal.isOpen}
          category={textEditModal.category || formCategory}
          categories={categories}
          categoryLabel={formCategoryOptions.find((o) => o.value === (textEditModal.category || formCategory))?.label}
          title={textEditModal.title}
          subtitle={textEditModal.subtitle}
          initialValue={textEditModal.value}
          onClose={() => setTextEditModal(null)}
          onSave={(newValue) => {
            setFormDescription(newValue);
            onShowToast('Описание товара успешно обновлено', 'success');
            setTextEditModal(null);
          }}
          onShowToast={onShowToast}
        />
      )}

      <ConfirmDialog
        isOpen={isBulkDeleteConfirmOpen}
        title="Удалить выбранные товары?"
        message={`Из каталога будут удалены ${selectedProductIds.length} ${pluralRu(selectedProductIds.length, ['товар', 'товара', 'товаров'])}. Это действие нельзя отменить.`}
        onConfirm={handleBulkDelete}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
      />
    </div>
  );
};
