import { Search, Plus, Check, Download, Upload, Sparkles } from 'lucide-react';
import { Product } from '../../../types';
import { exportProductsToCSV } from '../../../utils/csvHelpers';
import { isHiddenFromSale } from '../../../utils/inventory';
import { NeumorphicSelect } from '../../NeumorphicSelect';
import type { StoreCategory } from '../../../types';

import { AdminHint } from '../AdminHint';
import type { ProductList } from './useProductList';

/** Search, CSV, quick phrases and «Добавить товар»; the stock and category filters; «Выбрать все» (the actions — `ProductSelectionBar`) */
export function ProductListToolbar({ list, products, categories, handleOpenAddProduct, setTextEditModal }: {
  list: ProductList;
  products: Product[];
  categories: StoreCategory[];
  handleOpenAddProduct: () => void;
  setTextEditModal: (modal: { isOpen: boolean; category?: string; title: string; subtitle: string; value: string } | null) => void;
}) {
  const {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    stockFilter,
    setStockFilter,
    selectedProductIds,
    setIsCSVImportModalOpen,
    isAllFilteredSelected,
    categorySelectOptions,
    handleToggleSelectAll,
  } = list;

  return (
    <>
      {/* Top Search & Actions Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
          <input
            type="text"
            aria-label="Поиск товаров"
            placeholder="Название, артикул или штрихкод"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            onClick={() => exportProductsToCSV(products)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
            title="Экспортировать весь каталог в файл CSV для Excel"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Экспорт CSV</span>
          </button>
          <AdminHint label="Экспорт CSV">Скачать весь каталог таблицей, чтобы править в Excel.</AdminHint>

          <button
            onClick={() => setIsCSVImportModalOpen(true)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
            title="Импортировать товары из CSV"
          >
            <Upload className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Импорт</span>
          </button>
          <AdminHint label="Импорт CSV">Загрузить таблицу: новые товары добавятся, у старых поменяются цены и данные.</AdminHint>

          <button
            onClick={() =>
              setTextEditModal({
                isOpen: true,
                category: categoryFilter !== 'all' ? categoryFilter : 'global',
                title: 'Быстрые фразы и акценты',
                subtitle: 'Управление фразами и синхронизация для всех категорий одежды',
                value: '',
              })
            }
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
            title="Управление быстрыми фразами и акцентами для всех категорий одежды"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Быстрые фразы</span>
          </button>
          <AdminHint label="Быстрые фразы">Готовые фразы для описаний: вставляете их в товар одним нажатием.</AdminHint>

          <button
            onClick={handleOpenAddProduct}
            disabled={categories.length === 0}
            title={categories.length === 0 ? 'Сначала добавьте категории в разделе «Категории»' : undefined}
            className="py-2 px-3.5 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Добавить товар</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar: Stock Filter & Neumorphic Category Dropdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Stock Filter Segmented Control */}
        <div className="neu-flat-sm rounded-xl p-1 flex gap-1 items-center h-10">
          {[
            { id: 'all', label: `Все (${products.length})` },
            {
              id: 'in_stock',
              label: `В продаже (${products.filter((p) => !isHiddenFromSale(p)).length})`,
            },
            {
              id: 'out_of_stock',
              label: `Сняты (${products.filter((p) => isHiddenFromSale(p)).length})`,
            },
          ].map((sf) => (
            <button
              key={sf.id}
              onClick={() => setStockFilter(sf.id as any)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] transition-all cursor-pointer text-center ${
                stockFilter === sf.id
                  ? 'neu-pill-active font-extrabold'
                  : 'text-[#4E5C70] font-bold hover:text-[#2D3A4E]'
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>

        {/* Category Neumorphic Dropdown */}
        <div className="relative">
          <NeumorphicSelect
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            variant="inset"
            triggerClassName="rounded-2xl"
            prefix="Категория:"
            options={categorySelectOptions}
            placeholder="Выберите категорию..."
          />
        </div>
      </div>

      {/* Selection & Bulk Actions Toolbar (nothing to select in an empty catalog) */}
      {products.length > 0 && (
      <div className="neu-inset rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            role="checkbox"
            aria-checked={isAllFilteredSelected}
            onClick={handleToggleSelectAll}
            className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none group rounded-xl"
          >
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                isAllFilteredSelected
                  ? 'neu-pill-active text-accent'
                  : 'neu-button text-transparent group-hover:text-accent/40'
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </span>
            <span className="text-xs font-extrabold text-[#2D3A4E] group-hover:text-accent transition-colors">
              {isAllFilteredSelected ? 'Снять выделение со всех' : 'Выбрать все отфильтрованные'}
            </span>
          </button>

          {selectedProductIds.length === 0 && (
            <span className="text-xs text-[#4E5C70] text-right">Действия с отмеченными — внизу списка</span>
          )}
        </div>
      </div>
      )}
    </>
  );
}
