import React, { useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { Product } from '../../../types';
import { parseProductsFromCSV } from '../../../utils/csvHelpers';
import { generateDefaultSKUs, withMissingSkus } from '../../../utils/inventory';
import { ModalPortal } from '../../ModalPortal';
import type { StoreCategory } from '../../../types';
import { useDialogA11y } from '../../../utils/useDialogA11y';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductList } from './useProductList';

/** «Импорт каталога из CSV»: a file or pasted rows; a row with the ID of a product updates it */
export function ProductCsvImportModal({ list, products, categories, onUpdateProducts, onShowToast }: {
  list: ProductList;
  products: Product[];
  categories: StoreCategory[];
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'];
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const {
    isCSVImportModalOpen,
    setIsCSVImportModalOpen,
  } = list;
  const csvDialog = useDialogA11y(isCSVImportModalOpen, () => setIsCSVImportModalOpen(false));
  const [csvInputText, setCsvInputText] = useState('');

  // CSV Import execution
  const handleExecuteCSVImport = async () => {
    if (!csvInputText.trim()) {
      onShowToast('Вставьте текст CSV или загрузите файл', 'error');
      return;
    }

    try {
      const { products: parsed, skipped, badPurchase } = parseProductsFromCSV(csvInputText, products);
      if (parsed.length === 0) {
        onShowToast(
          skipped > 0
            ? `Нет подходящих строк: у каждого товара нужны название, цена и ссылка на фото (пропущено ${skipped})`
            : 'Не удалось распознать строки CSV',
          'error'
        );
        return;
      }

      // A row with the ID of an existing product updates it (a re-imported export does not duplicate the catalog)
      const byId = new Map<string, Product>(products.map((p): [string, Product] => [p.id, p]));
      let updatedCount = 0;
      const newProducts: Product[] = [];
      for (const [idx, p] of parsed.entries()) {
        const existing = p.id ? byId.get(p.id) : undefined;
        if (existing) {
          const updated: Product = {
            ...existing,
            ...p,
            id: existing.id,
            categoryLabel: categories.find((c) => c.id === p.category)?.name || existing.categoryLabel,
          };
          // a colour or size new in the file gets its variations (stock 0); the existing ones keep their stock
          updated.skus = withMissingSkus(updated);
          byId.set(existing.id, updated);
          updatedCount++;
          continue;
        }
        const fullProd: Product = {
          id: p.id || `prod-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          title: p.title!,
          category: p.category || '',
          categoryLabel: categories.find((c) => c.id === p.category)?.name || p.category || '',
          price: p.price!,
          originalPrice: p.originalPrice,
          inStock: p.inStock !== false,
          description: p.description || '',
          material: '',
          images: p.images || [],
          sizes: p.sizes || [],
          colors: p.colors || [],
          skus: [],
          rating: 0,
          reviewsCount: 0,
          ...(p.purchase ? { purchase: p.purchase } : {}),
          ...(p.supplier ? { supplier: p.supplier } : {}),
          ...(p.supplierSku ? { supplierSku: p.supplierSku } : {}),
        };
        fullProd.skus = generateDefaultSKUs(fullProd);
        newProducts.push(fullProd);
      }

      // «Добавлено» only after the database answered; a failure already showed «Не сохранено: …»
      const saved = await onUpdateProducts([...newProducts, ...products.map((p) => byId.get(p.id) ?? p)]);
      if (saved === false) return;
      onShowToast(
        [
          `Добавлено: ${newProducts.length}`,
          updatedCount ? `обновлено: ${updatedCount}` : '',
          skipped ? `пропущено без названия, цены или фото: ${skipped}` : '',
          badPurchase ? `закупка не распознана и не изменена: ${badPurchase}` : '',
        ]
          .filter(Boolean)
          .join(', '),
        'success'
      );
      setIsCSVImportModalOpen(false);
      setCsvInputText('');
    } catch (err) {
      onShowToast('Ошибка обработки CSV файла', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvInputText(text);
      onShowToast(`Файл "${file.name}" загружен`, 'info');
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* ================= MODAL: CSV IMPORT ================= */}
      {isCSVImportModalOpen && (
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={csvDialog.ref} {...csvDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-xl w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-start sm:items-center justify-between pb-2 border-b border-[#BAC5D5]/50 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 id={csvDialog.titleId} className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#2D3A4E] truncate">
                    Импорт каталога из CSV
                  </h3>
                  <p className="text-xs text-[#4E5C70] font-medium truncate sm:whitespace-normal leading-tight">
                    Загрузите файл или вставьте строки CSV для пакетного добавления
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCSVImportModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  1. Выберите файл на диске (.csv)
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-[#2D3A4E] file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-accent file:text-white file:font-bold file:mr-3 file:cursor-pointer cursor-pointer neu-inset p-2 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  2. Либо вставьте текст CSV в поле ниже
                </label>
                <textarea
                  rows={6}
                  value={csvInputText}
                  onChange={(e) => setCsvInputText(e.target.value)}
                  placeholder={`ID,Название,Категория,Цена (₽),Старая цена (₽),В наличии,Остаток,Размеры,Цвета,Картинка,Описание
"prod-1","Рубашка льняная","linen",2990,3500,"Да",12,"S; M; L","Бежевый; Синий","https://images.unsplash.com/...","Премиальный лен"`}
                  className="w-full p-3 neu-inset rounded-xl font-mono text-[11px] text-[#2D3A4E] leading-relaxed"
                />
              </div>
              <p className="text-xs text-[#4E5C70] leading-snug">
                Закупка в валюте — столбцы «Валюта закупки» (USD или CNY), «Закупка» (цена одной штуки в этой валюте)
                и «Своя наценка (%)», если она не общая. Пустые ячейки оставляют закупку товара как есть, «₽» её убирает.
                Цену по курсу пересчитает «Курсы и наценка» → «Применить». Последние два столбца — «Поставщик»
                и «Артикул поставщика»: пустая ячейка их не меняет, «-» убирает. Покупатель их не видит.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setIsCSVImportModalOpen(false)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExecuteCSVImport}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-extrabold text-white cursor-pointer transition-all"
              >
                Импортировать в каталог
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </>
  );
}
