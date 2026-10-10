import { useState, useMemo } from 'react';
import { Tag } from 'lucide-react';
import { Product } from '../../../types';
import { isHiddenFromSale } from '../../../utils/inventory';
import type { BulkTab } from '../AdminBulkOperationsModal';

import type { AdminProductsTabProps, ProductCategoryOption } from '../AdminProductsTab';

/**
 * The admin's product list: search, filters, selection and bulk actions (on sale or not, the bulk window on one of its
 * tabs, delete), and which product the quick view, the quick price or stock edit or the delete confirmation shows.
 * Writes go through `onUpdateProducts`.
 */
export function useProductList(
  products: Product[],
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'],
  onShowToast: AdminProductsTabProps['onShowToast'],
  CATEGORY_OPTIONS: ProductCategoryOption[]
) {
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  // Selection & Bulk
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkOperationsModalOpen, setIsBulkOperationsModalOpen] = useState(false);
  /** The tab the bulk window opens on: the «Ещё» item of the selection bar */
  const [bulkTab, setBulkTab] = useState<BulkTab>('discounts');
  /** «Снять с продажи» / «В продажу» on its way: a second press would write twice */
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToInspect, setProductToInspect] = useState<Product | null>(null);
  /** The quick price and stock edits of one row (finding 28): the id, the product itself is taken fresh from the list */
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [stockEditId, setStockEditId] = useState<string | null>(null);
  const [isCSVImportModalOpen, setIsCSVImportModalOpen] = useState(false);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.skus?.some((s) => s.skuCode?.toLowerCase().includes(q) || s.barcode?.includes(q));

      const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
      const matchesStock =
        stockFilter === 'all'
          ? true
          : stockFilter === 'in_stock'
          ? !isHiddenFromSale(p)
          : isHiddenFromSale(p);

      return matchesSearch && matchesCat && matchesStock;
    });
  }, [products, searchQuery, categoryFilter, stockFilter]);

  const isAllFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.includes(p.id));

  // Category select options with counts for Neumorphic dropdown
  const categorySelectOptions = useMemo(() => {
    const knownIds = new Set(CATEGORY_OPTIONS.map((c) => c.id));
    const extraCategories: { id: string; name: string }[] = [];
    products.forEach((p) => {
      if (p.category && !knownIds.has(p.category)) {
        knownIds.add(p.category);
        extraCategories.push({
          id: p.category,
          name: p.categoryLabel || p.category,
        });
      }
    });

    const allOptions = [...CATEGORY_OPTIONS, ...extraCategories];

    return allOptions.map((cat) => {
      const count =
        cat.id === 'all'
          ? products.length
          : products.filter((p) => p.category === cat.id).length;

      return {
        value: cat.id,
        label: cat.name,
        badge: `${count}`,
        icon: <Tag className="w-3.5 h-3.5 text-accent" />,
      };
    });
  }, [products]);

  // Selection Handlers
  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const remaining = selectedProductIds.filter(
        (id) => !filteredProducts.some((p) => p.id === id)
      );
      setSelectedProductIds(remaining);
    } else {
      const combined = Array.from(
        new Set([...selectedProductIds, ...filteredProducts.map((p) => p.id)])
      );
      setSelectedProductIds(combined);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk Operations: the toast and the cleared selection only after the database answered — on a refusal `persist`
  // shows «Не сохранено», and the selection stays for another try (audit 09.10, finding 3)
  const saveProducts = async (updated: Product[]) => (await onUpdateProducts(updated)) !== false;

  const handleBulkToggleStock = async (inStock: boolean) => {
    if (isBulkSaving) return;
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id) ? { ...p, inStock, hiddenFromSale: !inStock } : p
    );
    const count = selectedProductIds.length;
    setIsBulkSaving(true);
    const saved = await saveProducts(updated);
    setIsBulkSaving(false);
    if (!saved) return;
    onShowToast(
      inStock
        ? `Товары (${count}) возвращены в продажу`
        : `Товары (${count}) сняты с продажи`,
      'info'
    );
    setSelectedProductIds([]);
  };

  const openBulkOperations = (tab: BulkTab) => {
    setBulkTab(tab);
    setIsBulkOperationsModalOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    const count = selectedProductIds.length;
    const updated = products.filter((p) => !selectedProductIds.includes(p.id));
    if (productToInspect && selectedProductIds.includes(productToInspect.id)) {
      setProductToInspect(null);
    }
    if (!(await saveProducts(updated))) return;
    onShowToast(`Удалено товаров: ${count}`, 'info');
    setSelectedProductIds([]);
  };

  return {
    searchQuery,
    setSearchQuery,
    isBulkDeleteConfirmOpen,
    setIsBulkDeleteConfirmOpen,
    categoryFilter,
    setCategoryFilter,
    stockFilter,
    setStockFilter,
    selectedProductIds,
    setSelectedProductIds,
    isBulkOperationsModalOpen,
    setIsBulkOperationsModalOpen,
    bulkTab,
    openBulkOperations,
    isBulkSaving,
    productToDelete,
    setProductToDelete,
    productToInspect,
    setProductToInspect,
    priceEditId,
    setPriceEditId,
    stockEditId,
    setStockEditId,
    isCSVImportModalOpen,
    setIsCSVImportModalOpen,
    filteredProducts,
    isAllFilteredSelected,
    categorySelectOptions,
    handleToggleSelectAll,
    handleToggleSelectOne,
    handleBulkToggleStock,
    handleBulkDelete,
  };
}

export type ProductList = ReturnType<typeof useProductList>;
