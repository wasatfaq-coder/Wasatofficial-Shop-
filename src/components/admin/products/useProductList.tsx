import { useState, useMemo } from 'react';
import { Tag } from 'lucide-react';
import { Product } from '../../../types';
import { isHiddenFromSale } from '../../../utils/inventory';

import type { AdminProductsTabProps, ProductCategoryOption } from '../AdminProductsTab';

/**
 * The admin's product list: search, filters, selection and bulk actions (stock, category, discount, delete), and which
 * product the quick view or the delete confirmation shows. Writes go through `onUpdateProducts`.
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
  const [isBulkDiscountModalOpen, setIsBulkDiscountModalOpen] = useState(false);
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number>(15);
  const [isBulkCategoryDropdownOpen, setIsBulkCategoryDropdownOpen] = useState(false);

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToInspect, setProductToInspect] = useState<Product | null>(null);
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
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id) ? { ...p, inStock, hiddenFromSale: !inStock } : p
    );
    const count = selectedProductIds.length;
    if (!(await saveProducts(updated))) return;
    onShowToast(
      inStock
        ? `Товары (${count}) возвращены в продажу`
        : `Товары (${count}) сняты с продажи`,
      'info'
    );
    setSelectedProductIds([]);
  };

  const handleBulkChangeCategory = async (newCat: string) => {
    const catObj = CATEGORY_OPTIONS.find((c) => c.id === newCat);
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id)
        ? { ...p, category: newCat, categoryLabel: catObj?.name || p.categoryLabel || newCat }
        : p
    );
    const count = selectedProductIds.length;
    setIsBulkCategoryDropdownOpen(false);
    if (!(await saveProducts(updated))) return;
    onShowToast(`Категория обновлена для ${count} товаров на "${catObj?.name || newCat}"`, 'success');
    setSelectedProductIds([]);
  };

  const handleBulkApplyDiscount = async () => {
    if (!bulkDiscountPercent || bulkDiscountPercent <= 0) return;
    const factor = (100 - bulkDiscountPercent) / 100;
    const updated = products.map((p) => {
      if (!selectedProductIds.includes(p.id)) return p;
      const orig = p.originalPrice || p.price;
      const newPrice = Math.round(orig * factor);
      return {
        ...p,
        originalPrice: orig,
        price: newPrice,
        badge: `-${bulkDiscountPercent}%`,
      };
    });
    const count = selectedProductIds.length;
    if (!(await saveProducts(updated))) return;
    onShowToast(`Скидка ${bulkDiscountPercent}% применена к ${count} товарам`, 'success');
    setIsBulkDiscountModalOpen(false);
    setSelectedProductIds([]);
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
    isBulkDiscountModalOpen,
    setIsBulkDiscountModalOpen,
    bulkDiscountPercent,
    setBulkDiscountPercent,
    isBulkCategoryDropdownOpen,
    setIsBulkCategoryDropdownOpen,
    productToDelete,
    setProductToDelete,
    productToInspect,
    setProductToInspect,
    isCSVImportModalOpen,
    setIsCSVImportModalOpen,
    filteredProducts,
    isAllFilteredSelected,
    categorySelectOptions,
    handleToggleSelectAll,
    handleToggleSelectOne,
    handleBulkToggleStock,
    handleBulkChangeCategory,
    handleBulkApplyDiscount,
    handleBulkDelete,
  };
}

export type ProductList = ReturnType<typeof useProductList>;
