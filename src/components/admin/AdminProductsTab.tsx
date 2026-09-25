import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import { pluralRu } from '../../utils/pluralize';
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Tag,
  Check,
  X,
  SlidersHorizontal,
  Download,
  Upload,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Eye,
  Copy,
  ChevronDown,
  Pencil,
  RotateCcw,
  Boxes,
  Barcode,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  DollarSign,
  Percent,
  Award,
  Minus,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Loader2,
  Palette,
  Ruler,
} from 'lucide-react';
import { Product, ProductSKU } from '../../types';
import { exportProductsToCSV, parseProductsFromCSV } from '../../utils/csvHelpers';
import { processImageFiles } from '../../utils/imageUpload';
import {
  generateDefaultSKUs,
  generateSkuCode,
  generateBarcode,
  getProductTotalStock,
  updateProductSkuStock,
} from '../../utils/inventory';
import { AdminBulkOperationsModal } from './AdminBulkOperationsModal';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { TextEditModal } from './TextEditModal';

interface AdminProductsTabProps {
  products: Product[];
  onUpdateProducts: (updated: Product[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const CATEGORY_OPTIONS = [
  { id: 'all', name: 'Все категории' },
  { id: 'linen', name: 'Лен' },
  { id: 'shirts', name: 'Рубашки' },
  { id: 'trousers', name: 'Брюки' },
  { id: 'jackets', name: 'Куртки' },
  { id: 'sweatshirts', name: 'Свитшоты' },
  { id: 'accessories', name: 'Аксессуары' },
];

const PRESET_BADGES = ['ХИТ', 'NEW', 'SALE', '-20%', 'PREMIUM', 'LIMITED', 'ECO', 'EXCLUSIVE'];

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '46', '48', '50', '52', '54'];

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  products,
  onUpdateProducts,
  onShowToast,
}) => {
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

  // Modals
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToInspect, setProductToInspect] = useState<Product | null>(null);
  const [isCSVImportModalOpen, setIsCSVImportModalOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');

  // Product Form Fields State
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('linen');
  const [formPrice, setFormPrice] = useState<number>(2990);
  const [formCostPrice, setFormCostPrice] = useState<number | undefined>(1400);
  const [formOldPrice, setFormOldPrice] = useState<number | undefined>(3490);
  const [formBadge, setFormBadge] = useState<string>('');
  const [formInStock, setFormInStock] = useState<boolean>(true);
  const [formImages, setFormImages] = useState<string[]>([
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
  ]);
  const [newImageUrlInput, setNewImageUrlInput] = useState('');
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);
  const [textEditModal, setTextEditModal] = useState<{
    isOpen: boolean;
    type: 'material' | 'description';
    category?: string;
    title: string;
    subtitle: string;
    value: string;
  } | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [formMaterial, setFormMaterial] = useState('100% натуральный лен');
  const [formSizes, setFormSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [formColors, setFormColors] = useState<{ name: string; hex: string }[]>([
    { name: 'Бежевый', hex: '#D4C3B3' },
    { name: 'Темно-синий', hex: '#1E293B' },
  ]);
  const [formSkus, setFormSkus] = useState<ProductSKU[]>([]);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#2D3A4E');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

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
          ? p.inStock !== false
          : p.inStock === false;

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
        icon: <Tag className="w-3.5 h-3.5 text-[#4B59BB]" />,
      };
    });
  }, [products]);

  // SKU Uniqueness checker across catalog
  const skuConflictInfo = useMemo(() => {
    if (!isProductFormOpen) return { hasConflicts: false, duplicateCodes: [] };

    const otherSkusMap = new Map<string, string>(); // skuCode -> productTitle
    products.forEach((p) => {
      if (editingProduct && p.id === editingProduct.id) return;
      const skus = p.skus || generateDefaultSKUs(p);
      skus.forEach((s) => {
        if (s.skuCode) otherSkusMap.set(s.skuCode.toUpperCase(), p.title);
      });
    });

    const duplicates: { code: string; conflictingProduct: string }[] = [];
    formSkus.forEach((s) => {
      if (s.skuCode && otherSkusMap.has(s.skuCode.toUpperCase())) {
        duplicates.push({
          code: s.skuCode,
          conflictingProduct: otherSkusMap.get(s.skuCode.toUpperCase()) || 'Другой товар',
        });
      }
    });

    return {
      hasConflicts: duplicates.length > 0,
      duplicateCodes: duplicates,
    };
  }, [isProductFormOpen, formSkus, products, editingProduct]);

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

  // Bulk Operations
  const handleBulkToggleStock = (inStock: boolean) => {
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id) ? { ...p, inStock } : p
    );
    onUpdateProducts(updated);
    onShowToast(
      inStock
        ? `Товары (${selectedProductIds.length}) возвращены в продажу`
        : `Товары (${selectedProductIds.length}) сняты с продажи`,
      'info'
    );
    setSelectedProductIds([]);
  };

  const handleBulkChangeCategory = (newCat: string) => {
    const catObj = CATEGORY_OPTIONS.find((c) => c.id === newCat);
    const catLabel = catObj?.name || 'Лен';
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id) ? { ...p, category: newCat, categoryLabel: catLabel } : p
    );
    onUpdateProducts(updated);
    onShowToast(`Категория обновлена для ${selectedProductIds.length} товаров на "${catLabel}"`, 'success');
    setSelectedProductIds([]);
    setIsBulkCategoryDropdownOpen(false);
  };

  const handleBulkRestock = () => {
    const updated = products.map((p) => {
      if (!selectedProductIds.includes(p.id)) return p;
      const skus = p.skus && p.skus.length > 0 ? p.skus : generateDefaultSKUs(p);
      const updatedSkus = skus.map((s) => ({ ...s, stock: s.stock + 5 }));
      return { ...p, skus: updatedSkus, inStock: true };
    });
    onUpdateProducts(updated);
    onShowToast(`Остатки пополнены (+5 шт на SKU) для ${selectedProductIds.length} товаров`, 'success');
    setSelectedProductIds([]);
  };

  const handleBulkApplyDiscount = () => {
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
    onUpdateProducts(updated);
    onShowToast(`Скидка ${bulkDiscountPercent}% применена к ${selectedProductIds.length} товарам`, 'success');
    setIsBulkDiscountModalOpen(false);
    setSelectedProductIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedProductIds.length === 0) return;
    const count = selectedProductIds.length;
    const updated = products.filter((p) => !selectedProductIds.includes(p.id));
    if (productToInspect && selectedProductIds.includes(productToInspect.id)) {
      setProductToInspect(null);
    }
    onUpdateProducts(updated);
    onShowToast(`Удалено товаров: ${count}`, 'info');
    setSelectedProductIds([]);
  };

  // Duplicate Product Handler
  const handleDuplicateProduct = (prod: Product) => {
    const newId = `prod-${Date.now()}`;
    const baseSkus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
    const clonedSkus: ProductSKU[] = baseSkus.map((s, idx) => ({
      ...s,
      id: `${newId}-${s.color}-${s.size}-${idx}`,
      skuCode: s.skuCode ? `${s.skuCode}-CPY` : `MS-CPY-${newId.slice(-4)}-${s.size}`,
      barcode: undefined,
    }));

    const cloned: Product = {
      ...prod,
      id: newId,
      title: `${prod.title} (Копия)`,
      skus: clonedSkus,
      isNew: true,
      badge: prod.badge || 'NEW',
    };

    onUpdateProducts([cloned, ...products]);
    onShowToast(`Создана копия товара "${prod.title}"`, 'success');
  };

  // Open Form
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setFormTitle('');
    setFormCategory('linen');
    setFormPrice(2990);
    setFormCostPrice(1450);
    setFormOldPrice(3490);
    setFormBadge('NEW');
    setFormInStock(true);
    setFormImages([
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
    ]);
    setNewImageUrlInput('');
    setFormDescription('Стильная мужская одежда из премиальных материалов.');
    setFormMaterial('100% натуральный лен');
    const initialSizes = ['S', 'M', 'L', 'XL'];
    const initialColors = [
      { name: 'Бежевый', hex: '#D4C3B3' },
      { name: 'Темно-синий', hex: '#1E293B' },
    ];
    setFormSizes(initialSizes);
    setFormColors(initialColors);
    const mock = {
      id: `prod-${Date.now()}`,
      title: 'Новый товар',
      category: 'linen',
      price: 2990,
      images: ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'],
      colors: initialColors,
      sizes: initialSizes,
      inStock: true,
    };
    setFormSkus(generateDefaultSKUs(mock));
    setIsProductFormOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormTitle(prod.title);
    setFormCategory(prod.category || 'linen');
    setFormPrice(prod.price);
    setFormCostPrice(prod.costPrice || Math.round(prod.price * 0.48));
    setFormOldPrice(prod.originalPrice);
    setFormBadge(prod.badge || '');
    setFormInStock(prod.inStock !== false);
    setFormImages(
      prod.images && prod.images.length > 0
        ? [...prod.images]
        : ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80']
    );
    setNewImageUrlInput('');
    setFormDescription(prod.description || '');
    setFormMaterial(prod.material || '100% хлопок');
    setFormSizes(prod.sizes || ['S', 'M', 'L', 'XL']);
    setFormColors(prod.colors || [{ name: 'Бежевый', hex: '#D4C3B3' }]);
    setFormSkus(prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod));
    setIsProductFormOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      onShowToast('Введите название товара', 'error');
      return;
    }

    const numPrice = Number(formPrice);
    if (!numPrice || numPrice <= 0) {
      onShowToast('Укажите корректную стоимость товара больше нуля', 'error');
      return;
    }

    if (!formColors || formColors.length === 0) {
      onShowToast('Добавьте хотя бы один цвет для товара', 'error');
      return;
    }

    if (!formSizes || formSizes.length === 0) {
      onShowToast('Выберите хотя бы один размер для товара', 'error');
      return;
    }

    const catObj = CATEGORY_OPTIONS.find((c) => c.id === formCategory);
    const catLabel = catObj?.name || 'Лен';
    const finalImages =
      formImages.length > 0
        ? formImages
        : ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'];

    if (editingProduct) {
      const updated: Product = {
        ...editingProduct,
        title: formTitle.trim(),
        category: formCategory,
        categoryLabel: catLabel,
        price: Number(formPrice) || 2990,
        costPrice: formCostPrice ? Number(formCostPrice) : undefined,
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        badge: formBadge.trim() || undefined,
        description: formDescription.trim(),
        material: formMaterial.trim(),
        images: finalImages,
        sizes: formSizes,
        colors: formColors,
        skus: formSkus,
        inStock: formInStock && (formSkus.length === 0 || formSkus.some((s) => s.stock > 0)),
      };

      onUpdateProducts(products.map((p) => (p.id === editingProduct.id ? updated : p)));
      onShowToast(`Товар "${formTitle}" обновлен`, 'success');
    } else {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        title: formTitle.trim(),
        category: formCategory,
        categoryLabel: catLabel,
        price: Number(formPrice) || 2990,
        costPrice: formCostPrice ? Number(formCostPrice) : undefined,
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        badge: formBadge.trim() || undefined,
        description: formDescription.trim(),
        material: formMaterial.trim(),
        images: finalImages,
        sizes: formSizes,
        colors: formColors,
        skus: formSkus,
        inStock: formInStock && (formSkus.length === 0 || formSkus.some((s) => s.stock > 0)),
        rating: 5.0,
        reviewsCount: 1,
        isNew: true,
      };

      onUpdateProducts([newProd, ...products]);
      onShowToast(`Товар "${formTitle}" успешно добавлен в каталог`, 'success');
    }

    setIsProductFormOpen(false);
  };

  // Gallery file upload and drag-and-drop handlers
  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploadingImage(true);
      const loadedImages = await processImageFiles(files);
      if (loadedImages.length > 0) {
        setFormImages((prev) => [...prev, ...loadedImages]);
        onShowToast(`Загружено фото: ${loadedImages.length} шт.`, 'success');
      } else {
        onShowToast('Не удалось загрузить фото. Поддерживаются форматы JPG, PNG, WEBP', 'error');
      }
    } catch (err) {
      console.error('Error processing gallery files:', err);
      onShowToast('Ошибка при загрузке изображений', 'error');
    } finally {
      setIsUploadingImage(false);
      if (galleryFileInputRef.current) {
        galleryFileInputRef.current.value = '';
      }
    }
  };

  const handleGalleryDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverGallery(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploadingImage(true);
      const loadedImages = await processImageFiles(files);
      if (loadedImages.length > 0) {
        setFormImages((prev) => [...prev, ...loadedImages]);
        onShowToast(`Загружено фото: ${loadedImages.length} шт.`, 'success');
      }
    } catch (err) {
      console.error('Error processing dropped gallery files:', err);
      onShowToast('Ошибка при чтении изображений', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteImage = (indexToDelete: number) => {
    setFormImages((prev) => prev.filter((_, idx) => idx !== indexToDelete));
    onShowToast('Фото удалено из галереи', 'info');
  };

  const handleSetCoverImage = (indexToCover: number) => {
    if (indexToCover === 0) return;
    setFormImages((prev) => {
      const target = prev[indexToCover];
      const rest = prev.filter((_, idx) => idx !== indexToCover);
      return [target, ...rest];
    });
    onShowToast('Фото назначено главной обложкой', 'success');
  };

  const handleMoveImage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= formImages.length) return;
    setFormImages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  const handleClearAllImages = () => {
    setFormImages([]);
    onShowToast('Все фото товара удалены', 'info');
  };

  // Color management with SKU synchronization
  const handleAddCustomColor = () => {
    if (!customColorName.trim()) return;
    const cleanName = customColorName.trim();
    if (formColors.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
      onShowToast(`Цвет «${cleanName}» уже добавлен`, 'error');
      return;
    }
    const newColors = [...formColors, { name: cleanName, hex: customColorHex }];
    setFormColors(newColors);
    setCustomColorName('');

    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const newSkus: ProductSKU[] = formSizes.map((size) => ({
      id: `${prodId}-${cleanName}-${size}`,
      color: cleanName,
      size,
      stock: 4,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, cleanName, size),
      barcode: generateBarcode({ id: prodId, category: formCategory }, cleanName, size),
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
    onShowToast(`Цвет «${cleanName}» добавлен (+${newSkus.length} вариаций)`, 'info');
  };

  const handleRemoveColor = (colorName: string) => {
    if (formColors.length <= 1) {
      onShowToast('У товара должен быть хотя бы один цвет', 'error');
      return;
    }
    setFormColors((prev) => prev.filter((c) => c.name !== colorName));
    setFormSkus((prev) => prev.filter((s) => s.color !== colorName));
    onShowToast(`Цвет «${colorName}» удален`, 'info');
  };

  // Size management with SKU synchronization
  const handleAddCustomSize = () => {
    const size = customSizeInput.trim().toUpperCase();
    if (!size) return;
    if (formSizes.includes(size)) {
      onShowToast(`Размер «${size}» уже в списке`, 'error');
      return;
    }
    const newSizes = [...formSizes, size];
    setFormSizes(newSizes);
    setCustomSizeInput('');

    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const newSkus: ProductSKU[] = formColors.map((c) => ({
      id: `${prodId}-${c.name}-${size}`,
      color: c.name,
      size,
      stock: 4,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size),
      barcode: generateBarcode({ id: prodId, category: formCategory }, c.name, size),
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
    onShowToast(`Размер «${size}» добавлен (+${newSkus.length} вариаций)`, 'info');
  };

  const handleTogglePresetSize = (size: string) => {
    if (formSizes.includes(size)) {
      handleRemoveSize(size);
    } else {
      const newSizes = [...formSizes, size];
      setFormSizes(newSizes);

      const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
      const newSkus: ProductSKU[] = formColors.map((c) => ({
        id: `${prodId}-${c.name}-${size}`,
        color: c.name,
        size,
        stock: 4,
        skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size),
        barcode: generateBarcode({ id: prodId, category: formCategory }, c.name, size),
      }));

      setFormSkus((prev) => [...prev, ...newSkus]);
      onShowToast(`Размер «${size}» добавлен`, 'info');
    }
  };

  const handleRemoveSize = (sizeToRemove: string) => {
    if (formSizes.length <= 1) {
      onShowToast('У товара должен быть хотя бы один размер', 'error');
      return;
    }
    setFormSizes((prev) => prev.filter((s) => s !== sizeToRemove));
    setFormSkus((prev) => prev.filter((s) => s.size !== sizeToRemove));
    onShowToast(`Размер «${sizeToRemove}» удален`, 'info');
  };

  // Bulk SKU stock adjustment helpers
  const handleBulkChangeAllSkuStock = (delta: number) => {
    setFormSkus((prev) =>
      prev.map((s) => ({
        ...s,
        stock: Math.max(0, (s.stock || 0) + delta),
      }))
    );
    onShowToast(`Остатки всех вариаций изменены на ${delta > 0 ? `+${delta}` : delta} шт.`, 'info');
  };

  const handleResetAllSkuStock = () => {
    setFormSkus((prev) =>
      prev.map((s) => ({
        ...s,
        stock: 0,
      }))
    );
    onShowToast('Остатки всех вариаций SKU обнулены', 'info');
  };

  const handleRegenerateMissingCodes = () => {
    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    setFormSkus((prev) =>
      prev.map((s) => ({
        ...s,
        skuCode: s.skuCode || generateSkuCode({ id: prodId, category: formCategory }, s.color, s.size),
        barcode: s.barcode || generateBarcode({ id: prodId, category: formCategory }, s.color, s.size),
      }))
    );
    onShowToast('Артикулы и штрихкоды SKU синхронизированы', 'success');
  };

  // Form Computed Totals
  const totalFormStock = useMemo(() => {
    return formSkus.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
  }, [formSkus]);

  const totalFormInventoryValue = useMemo(() => {
    return totalFormStock * (Number(formPrice) || 0);
  }, [totalFormStock, formPrice]);

  // CSV Import execution
  const handleExecuteCSVImport = () => {
    if (!csvInputText.trim()) {
      onShowToast('Вставьте текст CSV или загрузите файл', 'error');
      return;
    }

    try {
      const parsed = parseProductsFromCSV(csvInputText);
      if (parsed.length === 0) {
        onShowToast('Не удалось распознать строки CSV', 'error');
        return;
      }

      const newProducts: Product[] = parsed.map((p, idx) => {
        const prodId = p.id || `prod-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
        const colors = p.colors && p.colors.length > 0 ? p.colors : [{ name: 'Бежевый', hex: '#D4C3B3' }];
        const sizes = p.sizes && p.sizes.length > 0 ? p.sizes : ['S', 'M', 'L', 'XL'];
        const fullProd: Product = {
          id: prodId,
          title: p.title || 'Новый товар',
          category: p.category || 'linen',
          categoryLabel: p.categoryLabel || 'Лен',
          price: p.price || 2990,
          originalPrice: p.originalPrice,
          inStock: p.inStock !== false,
          description: p.description || '',
          material: p.material || '100% натуральный лен',
          images: p.images && p.images.length > 0 ? p.images : ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'],
          sizes,
          colors,
          skus: [],
          rating: 4.9,
          reviewsCount: 8,
        };
        fullProd.skus = generateDefaultSKUs(fullProd);
        return fullProd;
      });

      onUpdateProducts([...newProducts, ...products]);
      onShowToast(`Успешно импортировано товаров: ${newProducts.length}`, 'success');
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
    <div className="space-y-3.5">
      {/* Top Search & Actions Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5C70]" />
          <input
            type="text"
            placeholder="Поиск по названию, артикулу SKU или штрихкоду..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => exportProductsToCSV(products)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#4B59BB] flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
            title="Экспортировать весь каталог в файл CSV для Excel"
          >
            <Download className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span className="hidden sm:inline">Экспорт CSV</span>
          </button>

          <button
            onClick={() => setIsCSVImportModalOpen(true)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#4B59BB] flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
            title="Импортировать товары из CSV"
          >
            <Upload className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span className="hidden sm:inline">Импорт</span>
          </button>

          <button
            onClick={() =>
              setTextEditModal({
                isOpen: true,
                type: 'description',
                category: categoryFilter !== 'all' ? categoryFilter : 'global',
                title: 'Быстрые фразы и акценты',
                subtitle: 'Управление фразами и синхронизация для всех категорий одежды',
                value: '',
              })
            }
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#4B59BB] flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
            title="Управление быстрыми фразами и акцентами для всех категорий одежды"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#4B59BB]" />
            <span className="hidden sm:inline">Быстрые фразы</span>
          </button>

          <button
            onClick={handleOpenAddProduct}
            className="py-2 px-3.5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Добавить товар</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar: Stock Filter & Neumorphic Category Dropdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Stock Filter Segmented Control */}
        <div className="neu-flat-sm rounded-xl p-1 flex gap-1 bg-[#E3E8EF] items-center h-10">
          {[
            { id: 'all', label: `Все (${products.length})` },
            {
              id: 'in_stock',
              label: `В наличии (${products.filter((p) => p.inStock !== false).length})`,
            },
            {
              id: 'out_of_stock',
              label: `Сняты (${products.filter((p) => p.inStock === false).length})`,
            },
          ].map((sf) => (
            <button
              key={sf.id}
              onClick={() => setStockFilter(sf.id as any)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] transition-all cursor-pointer text-center ${
                stockFilter === sf.id
                  ? 'neu-pill-active font-black'
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

      {/* Selection & Bulk Actions Toolbar */}
      <div className="neu-inset rounded-2xl p-3 space-y-2 bg-[#E3E8EF]">
        <div className="flex items-center justify-between">
          <div
            onClick={handleToggleSelectAll}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <div
              className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                isAllFilteredSelected
                  ? 'neu-button text-[#4B59BB] bg-[#E3E8EF] scale-105'
                  : 'neu-button text-transparent bg-[#E3E8EF] group-hover:text-[#4B59BB]/30'
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <span className="text-xs font-extrabold text-[#2D3A4E] group-hover:text-[#4B59BB] transition-colors">
              {isAllFilteredSelected ? 'Снять выделение со всех' : 'Выбрать все отфильтрованные'}
            </span>
          </div>

          <span className="text-xs font-bold text-[#4E5C70]">
            Выбрано: <strong className="text-[#4B59BB]">{selectedProductIds.length}</strong>
          </span>
        </div>

        {selectedProductIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1.5 animate-in fade-in duration-150">
            <button
              onClick={() => setIsBulkOperationsModalOpen(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4B59BB] flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Массовые операции
            </button>

            <button
              onClick={() => setIsBulkDiscountModalOpen(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4E5C70] hover:text-[#4B59BB] flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
            >
              <Tag className="w-3.5 h-3.5 text-[#4B59BB]" />
              Скидка
            </button>

            <div className="relative">
              <button
                onClick={() => setIsBulkCategoryDropdownOpen(!isBulkCategoryDropdownOpen)}
                className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
              >
                <Layers className="w-3.5 h-3.5 text-[#4B59BB]" />
                Сменить категорию
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isBulkCategoryDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 neu-dropdown rounded-2xl p-1.5 bg-[#E3E8EF] space-y-1 min-w-[160px] animate-in fade-in border border-white/80">
                  {CATEGORY_OPTIONS.filter((c) => c.id !== 'all').map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleBulkChangeCategory(cat.id)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[#2D3A4E] hover:bg-white/40 cursor-pointer transition-colors"
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleBulkRestock}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4E5C70] hover:text-success flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
              title="Пополнить складские остатки всех выбранных на +5 шт"
            >
              <Boxes className="w-3.5 h-3.5 text-success" />
              +5 шт на SKU
            </button>

            <button
              onClick={() => handleBulkToggleStock(false)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4E5C70] hover:text-warning flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
            >
              <X className="w-3.5 h-3.5 text-warning" />
              Снять с продажи
            </button>

            <button
              onClick={() => handleBulkToggleStock(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-black text-[#4E5C70] hover:text-success flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
            >
              <Check className="w-3.5 h-3.5 text-success" />
              В продажу
            </button>

            <button
              onClick={() => setIsBulkDeleteConfirmOpen(true)}
              className="h-8 px-3 neu-button-danger rounded-xl text-[11px] font-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить
            </button>
          </div>
        )}
      </div>

      {/* Products List Grid */}
      <div className="space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-[#4E5C70] bg-[#E3E8EF]">
            <p className="text-xs font-bold text-[#2D3A4E]">Товары не найдены</p>
            <p className="text-[11px]">Попробуйте изменить поисковый запрос или фильтры</p>
          </div>
        ) : (
          filteredProducts.map((prod, pIdx) => {
            const isSelected = selectedProductIds.includes(prod.id);
            const totalStock = getProductTotalStock(prod);
            const primarySku = prod.skus?.[0]?.skuCode || `MS-CAT-${prod.id.slice(-4)}`;

            return (
              <div
                key={`admin-product-${prod.id}-${pIdx}`}
                className={`neu-inset rounded-2xl p-3 sm:p-3.5 transition-all bg-[#E3E8EF] border ${
                  isSelected ? 'border-[#5F6ED0] ring-1 ring-[#5F6ED0]/40' : 'border-transparent'
                } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
              >
                {/* Product Main Content */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  {/* Selection Checkbox */}
                  <div
                    onClick={() => handleToggleSelectOne(prod.id)}
                    className="cursor-pointer p-0.5 shrink-0 mt-1 sm:mt-0 group"
                    title={isSelected ? 'Снять выделение' : 'Выбрать товар'}
                  >
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                        isSelected
                          ? 'neu-button text-[#4B59BB] bg-[#E3E8EF] scale-105'
                          : 'neu-button text-transparent bg-[#E3E8EF] group-hover:text-[#4B59BB]/30'
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  </div>

                  {/* Product Thumbnail */}
                  <div className="relative w-12 h-14 sm:w-14 sm:h-14 rounded-xl overflow-hidden neu-inset shrink-0 bg-slate-200">
                    <img
                      src={prod.images?.[0] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80'}
                      alt={prod.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Main Product Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className="text-xs sm:text-sm font-black text-[#2D3A4E] leading-snug line-clamp-1 sm:truncate"
                        title={prod.title}
                      >
                        {prod.title}
                      </h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg neu-button text-[#4B59BB] shrink-0 bg-[#E3E8EF] whitespace-nowrap">
                        {prod.categoryLabel || prod.category}
                      </span>
                      {prod.badge && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md neu-fill-accent text-white shrink-0 leading-tight whitespace-nowrap">
                          {prod.badge}
                        </span>
                      )}
                      {prod.inStock === false && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md neu-inset text-danger shrink-0 bg-danger-soft border border-danger/25 whitespace-nowrap">
                          Снят с витрины
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-semibold flex-wrap">
                      <span className="font-mono text-[#4B59BB] font-bold text-[11px] neu-button px-1.5 py-0.5 rounded-md bg-[#E3E8EF] shrink-0 whitespace-nowrap">
                        {primarySku}
                      </span>
                      <span className="font-black text-[#2D3A4E] text-xs shrink-0 whitespace-nowrap">
                        {prod.price.toLocaleString('ru-RU')} ₽
                      </span>
                      {prod.originalPrice && (
                        <span className="line-through text-slate-400 text-[11px] shrink-0 whitespace-nowrap">
                          {prod.originalPrice.toLocaleString('ru-RU')} ₽
                        </span>
                      )}
                      <span className="text-[#BAC5D5] shrink-0">•</span>
                      <span
                        className={`font-black text-[11px] px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap ${
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
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#4B59BB] active:scale-95 transition-all cursor-pointer shrink-0"
                      title="Быстрый просмотр карточки"
                      aria-label="Быстрый просмотр карточки"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Secondary: Duplicate */}
                    <button
                      onClick={() => handleDuplicateProduct(prod)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-success active:scale-95 transition-all cursor-pointer shrink-0"
                      title="Дублировать товар (копировать)"
                      aria-label="Дублировать товар (копировать)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Danger / Destructive: Delete */}
                    <button
                      onClick={() => setProductToDelete(prod)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0"
                      title="Удалить товар"
                      aria-label="Удалить товар"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Primary Action: Edit */}
                  <button
                    onClick={() => handleOpenEditProduct(prod)}
                    className="h-8 px-3.5 neu-button rounded-xl text-xs font-black text-[#4B59BB] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
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

      {/* ================= MODAL: CREATE / EDIT PRODUCT ================= */}
      {isProductFormOpen && (
        <div className="admin-no-glow fixed inset-0 z-[70] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-4 sm:p-6 max-w-4xl w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[92vh] overflow-y-auto my-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#BAC5D5]/50 gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-[#4B59BB] shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#2D3A4E]">
                      {editingProduct ? 'Редактирование товара' : 'Новый товар каталога'}
                    </h3>
                    {editingProduct && (
                      <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-mono font-black text-[#4B59BB] bg-[#E3E8EF]">
                        {editingProduct.id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-medium mt-0.5 flex-wrap">
                    <span>Параметры, цены, себестоимость и остатки SKU</span>
                    <span>•</span>
                    <span
                      className={`font-black ${
                        totalFormStock === 0
                          ? 'text-danger'
                          : totalFormStock < 5
                          ? 'text-warning'
                          : 'text-success'
                      }`}
                    >
                      Остаток: {totalFormStock} шт.
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Switcher & Close */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <div className="flex items-center neu-inset p-1 rounded-xl bg-[#E3E8EF] gap-1">
                  <button
                    type="button"
                    onClick={() => setFormInStock(true)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer active:scale-95 ${
                      formInStock
                        ? 'neu-button text-success bg-[#E3E8EF]'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    В продаже
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormInStock(false)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer active:scale-95 ${
                      !formInStock
                        ? 'neu-button text-danger bg-[#E3E8EF]'
                        : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                    }`}
                  >
                    Снят с витрины
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsProductFormOpen(false)}
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* SKU Uniqueness & Integrity Banner */}
            {skuConflictInfo.hasConflicts ? (
              <div className="neu-inset rounded-2xl p-3 bg-danger-soft border border-danger/25 text-danger text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-black">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span>Внимание: Обнаружены дубликаты артикулов SKU в каталоге!</span>
                </div>
                <div className="text-[11px] text-danger space-y-0.5 pl-6">
                  {skuConflictInfo.duplicateCodes.map((d, i) => (
                    <div key={i}>
                      Артикул <strong className="font-mono">{d.code}</strong> уже занят товаром «{d.conflictingProduct}»
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="neu-inset rounded-2xl p-2.5 bg-success-soft border border-success/25 text-success text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span className="font-bold">
                  Все артикулы SKU и штрихкоды уникальны в каталоге MANSTYLE
                </span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Basic Info, Category, Pricing, Photos, Description */}
                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Название товара *
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="например, Рубашка льняная Slim Fit"
                      className="w-full px-3.5 py-2 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A]"
                      required
                    />
                  </div>

                  {/* Marketing Badge Selector - Unified Inset Container */}
                  <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5">
                    <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
                      <label className="text-[11px] font-black text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
                        <Tag className="w-3.5 h-3.5 text-[#4B59BB]" />
                        <span>Маркетинговый ярлык (Бейдж)</span>
                      </label>
                      {formBadge ? (
                        <button
                          type="button"
                          onClick={() => setFormBadge('')}
                          className="text-[11px] font-bold text-danger hover:text-danger hover:underline cursor-pointer"
                        >
                          Снять ярлык
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#4E5C70]">Опционально</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {PRESET_BADGES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFormBadge(formBadge === b ? '' : b)}
                          className={`h-7 px-2.5 rounded-xl text-[11px] font-black whitespace-nowrap cursor-pointer transition-all active:scale-95 flex items-center justify-center border ${
                            formBadge === b
                              ? 'neu-pill-active border-transparent'
                              : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E] border-white/60 bg-[#E3E8EF]'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={formBadge}
                      onChange={(e) => setFormBadge(e.target.value)}
                      placeholder="Или свой текст (например: -30% или ХИТ СЕЗОНА)"
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs font-bold text-[#4B59BB] bg-[#E3E8EF] placeholder:text-[#56647A]"
                    />
                  </div>

                  {/* Category and Material */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="text-[11px] font-bold text-[#4E5C70] block mb-1 truncate">
                        Категория
                      </label>
                      <NeumorphicSelect
                        value={formCategory}
                        onChange={(val) => setFormCategory(val)}
                        options={CATEGORY_OPTIONS.filter((c) => c.id !== 'all').map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                        variant="inset"
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-[#4E5C70] truncate">
                          Материал ткани
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setTextEditModal({
                              isOpen: true,
                              type: 'material',
                              category: formCategory,
                              title: 'Материал ткани',
                              subtitle: 'Укажите точный состав ткани и особенности полотна',
                              value: formMaterial,
                            })
                          }
                          className="text-[11px] font-bold text-[#4B59BB] hover:text-[#3F4BA6] flex items-center gap-0.5 cursor-pointer"
                          title="Редактировать в модальном окне"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>Изменить</span>
                        </button>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={formMaterial}
                          onChange={(e) => setFormMaterial(e.target.value)}
                          placeholder="100% лен"
                          className="w-full h-10 pl-3 pr-8 neu-inset rounded-xl text-xs font-semibold text-[#2D3A4E] bg-[#E3E8EF] truncate"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setTextEditModal({
                              isOpen: true,
                              type: 'material',
                              category: formCategory,
                              title: 'Материал ткани',
                              subtitle: 'Укажите точный состав ткани и особенности полотна',
                              value: formMaterial,
                            })
                          }
                          className="absolute right-2 p-1 text-[#4E5C70] hover:text-[#4B59BB] cursor-pointer"
                          title="Открыть окно редактирования материала"
                          aria-label="Открыть окно редактирования материала"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Description Section - Positioned directly below Category and Material */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-[#4E5C70]">
                        Описание товара
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTextEditModal({
                            isOpen: true,
                            type: 'description',
                            category: formCategory,
                            title: 'Описание товара',
                            subtitle: 'Подробное описание фасона, преимуществ, кроя и ухода',
                            value: formDescription,
                          })
                        }
                        className="text-[11px] font-bold text-[#4B59BB] hover:text-[#3F4BA6] flex items-center gap-0.5 cursor-pointer"
                        title="Открыть окно редактирования описания"
                      >
                        <Maximize2 className="w-2.5 h-2.5" />
                        <span>Развернуть редактор</span>
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        rows={2}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Краткое описание преимуществ ткани и кроя..."
                        className="w-full px-3 py-2 pr-8 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setTextEditModal({
                            isOpen: true,
                            type: 'description',
                            category: formCategory,
                            title: 'Описание товара',
                            subtitle: 'Подробное описание фасона, преимуществ, кроя и ухода',
                            value: formDescription,
                          })
                        }
                        className="absolute top-2 right-2 p-1 text-[#4E5C70] hover:text-[#4B59BB] cursor-pointer"
                        title="Редактировать в модальном окне"
                        aria-label="Редактировать в модальном окне"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Pricing Matrix: Price, CostPrice & OldPrice */}
                  <div className="p-3 neu-inset rounded-2xl bg-[#E3E8EF] space-y-2.5 border border-white/60">
                    <div className="flex items-center justify-between text-[11px] font-black text-[#2D3A4E] flex-wrap gap-1">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-[#4B59BB]" />
                        Ценообразование и маржинальность
                      </span>
                      {formPrice > 0 && formCostPrice !== undefined && (
                        <span className="text-[11px] px-2 py-0.5 rounded-lg neu-flat bg-[#E3E8EF] text-success font-extrabold border border-success/20">
                          Маржа: {Math.round(((formPrice - formCostPrice) / formPrice) * 100)}% (+{(formPrice - formCostPrice).toLocaleString('ru-RU')} ₽)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-[#4E5C70] block mb-1 truncate">
                          Цена продажи (₽) *
                        </label>
                        <input
                          type="number"
                          value={formPrice}
                          onChange={(e) => setFormPrice(Number(e.target.value))}
                          min="100"
                          className="w-full h-9 px-2.5 neu-flat rounded-xl text-xs font-black text-[#4B59BB] bg-[#E3E8EF] border border-white/50"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-[#4E5C70] block mb-1 truncate" title="Себестоимость закупки">
                          Себестоимость (₽)
                        </label>
                        <input
                          type="number"
                          value={formCostPrice ?? ''}
                          onChange={(e) =>
                            setFormCostPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="например 1400"
                          className="w-full h-9 px-2.5 neu-flat rounded-xl text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF] border border-white/50"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-[#4E5C70] block mb-1 truncate">
                          Старая цена (₽)
                        </label>
                        <input
                          type="number"
                          value={formOldPrice ?? ''}
                          onChange={(e) =>
                            setFormOldPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="без скидки"
                          className="w-full h-9 px-2.5 neu-flat rounded-xl text-xs text-slate-500 line-through bg-[#E3E8EF] border border-white/50 placeholder:text-[#56647A]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multi-Photo Gallery Manager */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md neu-inset flex items-center justify-center text-[#4B59BB]">
                          <ImageIcon className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-black text-[#2D3A4E]">Галерея фото</span>
                        <span className="text-[11px] font-extrabold px-1.5 py-0.2 rounded-md neu-inset text-[#4B59BB] bg-[#E3E8EF]">
                          {formImages.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[#4E5C70] px-2 py-0.5 rounded-lg neu-inset bg-[#E3E8EF]">
                          Первое фото — обложка
                        </span>
                        {formImages.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearAllImages}
                            className="h-6 px-2.5 rounded-lg neu-button-danger text-[11px] font-black active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                            title="Удалить все фото"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Очистить все</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Hidden Native File Input for Gallery / Device Upload */}
                    <input
                      ref={galleryFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryFileSelect}
                      className="hidden"
                    />

                    {/* Image Upload Actions & Drag-and-Drop Area */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingOverGallery(true);
                      }}
                      onDragLeave={() => setIsDraggingOverGallery(false)}
                      onDrop={handleGalleryDrop}
                      className={`p-3 neu-inset rounded-2xl transition-all space-y-2.5 ${
                        isDraggingOverGallery
                          ? 'border-2 border-dashed border-[#5F6ED0] bg-[#5F6ED0]/5'
                          : 'border border-white/60 bg-[#E3E8EF]'
                      }`}
                    >
                      {/* Top Action Bar: Upload from Device + Loading state */}
                      <button
                        type="button"
                        onClick={() => galleryFileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="w-full py-2.5 px-3 neu-button rounded-xl text-xs font-black text-[#4B59BB] hover:text-[#3F4BA6] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-[#4B59BB]" />
                            <span>Обработка изображений...</span>
                          </>
                        ) : (
                          <>
                            <ImagePlus className="w-4 h-4 text-[#4B59BB]" />
                            <span>Загрузить из галереи / с устройства</span>
                          </>
                        )}
                      </button>

                      {/* Image Thumbnails Strip & Controls */}
                      {formImages.length === 0 ? (
                        <div
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="py-6 px-4 rounded-xl border border-dashed border-[#BAC5D5] flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white/40 transition-colors text-center"
                        >
                          <ImagePlus className="w-6 h-6 text-[#4E5C70]" />
                          <p className="text-xs font-bold text-[#2D3A4E]">Галерея пока пуста</p>
                          <p className="text-[11px] text-[#4E5C70]">
                            Нажмите «Загрузить из галереи» или перетащите фото сюда
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 pt-1">
                          {formImages.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className={`relative rounded-xl overflow-hidden neu-flat border-2 group transition-all aspect-[3/4] flex flex-col justify-between bg-slate-900 ${
                                idx === 0 ? 'border-[#5F6ED0]' : 'border-white/80'
                              }`}
                            >
                              <img
                                src={imgUrl}
                                alt={`Фото ${idx + 1}`}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setPreviewZoomImage(imgUrl)}
                                referrerPolicy="no-referrer"
                              />

                              {/* Cover Badge */}
                              {idx === 0 && (
                                <div className="absolute top-1.5 left-1.5 bg-[#5F6ED0] text-white text-[11px] font-black px-1.5 py-0.5 rounded-md shadow-sm">
                                  <span>Главная</span>
                                </div>
                              )}

                              {/* ALWAYS VISIBLE Quick Delete Button on Top Right */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteImage(idx);
                                }}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-danger hover:bg-danger/90 text-white flex items-center justify-center shadow-[var(--neu-on-photo)] active:scale-90 transition-transform cursor-pointer z-10"
                                title="Удалить это фото"
                                aria-label="Удалить это фото"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Bottom Action Bar for Cover & Reordering */}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-1.5 flex items-center justify-between text-white">
                                <div className="flex items-center gap-1">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveImage(idx, idx - 1);
                                      }}
                                      className="p-1 rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                                      title="Переместить левее"
                                      aria-label="Переместить левее"
                                    >
                                      <ArrowLeft className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                  {idx < formImages.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveImage(idx, idx + 1);
                                      }}
                                      className="p-1 rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                                      title="Переместить правее"
                                      aria-label="Переместить правее"
                                    >
                                      <ArrowRight className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewZoomImage(imgUrl);
                                    }}
                                    className="p-1 rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                                    title="Увеличить фото"
                                    aria-label="Увеличить фото"
                                  >
                                    <Maximize2 className="w-2.5 h-2.5" />
                                  </button>
                                  {idx !== 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetCoverImage(idx);
                                      }}
                                      className="text-[11px] font-black bg-[#5F6ED0] hover:bg-[#4553B8] text-white px-1.5 py-0.5 rounded cursor-pointer"
                                      title="Сделать главной обложкой"
                                    >
                                      Обложка
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Image by URL Input */}
                      <div className="flex gap-1.5 pt-1">
                        <input
                          type="url"
                          value={newImageUrlInput}
                          onChange={(e) => setNewImageUrlInput(e.target.value)}
                          placeholder="Вставить ссылку на фото (https://...)"
                          className="flex-1 min-w-0 h-8 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newImageUrlInput.trim()) {
                              setFormImages([...formImages, newImageUrlInput.trim()]);
                              setNewImageUrlInput('');
                              onShowToast('Фото по ссылке добавлено', 'success');
                            }
                          }}
                          disabled={!newImageUrlInput.trim()}
                          className="h-8 px-3 neu-button rounded-xl text-xs font-bold text-[#4B59BB] disabled:opacity-40 active:scale-95 transition-all cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          + Ссылка
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Colors, Sizes, SKU Matrix */}
                <div className="space-y-3.5">
                  {/* Colors Section - Unified Inset Container */}
                  <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
                      <label className="text-[11px] font-black text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
                        <Palette className="w-3.5 h-3.5 text-[#4B59BB]" />
                        <span>Цвета товара ({formColors.length})</span>
                      </label>
                      <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 цвет</span>
                    </div>

                    {/* Active Colors Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {formColors.map((c) => (
                        <div
                          key={c.name}
                          className="neu-button px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF] border border-white/60"
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span>{c.name}</span>
                          {formColors.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveColor(c.name)}
                              className="text-[#4E5C70] hover:text-danger ml-1 active:scale-90 transition-transform cursor-pointer"
                              title={`Удалить цвет «${c.name}»`}
                              aria-label="Закрыть"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add Custom Color */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customColorName}
                          onChange={(e) => setCustomColorName(e.target.value)}
                          placeholder="Новый цвет (напр. Хаки)"
                          className="flex-1 min-w-0 h-8 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A]"
                        />
                        <div className="relative w-28 shrink-0">
                          <input
                            type="text"
                            value={customColorHex}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val.startsWith('#')) {
                                setCustomColorHex('#' + val.replace(/[^0-9A-Fa-f]/g, ''));
                              } else {
                                setCustomColorHex(val);
                              }
                            }}
                            placeholder="#HEX"
                            maxLength={7}
                            className="w-full h-8 pl-8 pr-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] uppercase font-mono"
                          />
                          <div
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-black/15 shadow-inner"
                            style={{
                              backgroundColor: /^#([0-9A-F]{3}){1,2}$/i.test(customColorHex)
                                ? customColorHex
                                : 'transparent',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCustomColor}
                          disabled={!customColorName.trim() || !/^#([0-9A-F]{3}){1,2}$/i.test(customColorHex)}
                          className="h-8 px-3 neu-button rounded-xl text-xs font-black text-[#4B59BB] cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          + Цвет
                        </button>
                      </div>

                      {/* Swatch Palette */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {[
                          '#FFFFFF',
                          '#F3F4F6',
                          '#D1D5DB',
                          '#9CA3AF',
                          '#4B5563',
                          '#1F2937',
                          '#000000',
                          '#EF4444',
                          '#F97316',
                          '#F59E0B',
                          '#10B981',
                          '#3B82F6',
                          '#6366F1',
                          '#8B5CF6',
                          '#EC4899',
                        ].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setCustomColorHex(hex)}
                            className="w-6 h-6 rounded-lg neu-button flex items-center justify-center p-0.5 transition-all active:scale-95 cursor-pointer"
                            title={hex}
                          >
                            <span
                              className="w-full h-full rounded-md border border-black/10"
                              style={{ backgroundColor: hex }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sizes Section - Unified Inset Container */}
                  <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
                      <label className="text-[11px] font-black text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
                        <Ruler className="w-3.5 h-3.5 text-[#4B59BB]" />
                        <span>Размеры товара ({formSizes.length})</span>
                      </label>
                      <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 размер</span>
                    </div>

                    {/* Active Sizes */}
                    <div className="flex flex-wrap gap-1.5">
                      {formSizes.map((s) => (
                        <div
                          key={s}
                          className="neu-button px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-black text-[#4B59BB] bg-[#E3E8EF] border border-white/60"
                        >
                          <span>{s}</span>
                          {formSizes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSize(s)}
                              className="text-[#4E5C70] hover:text-danger ml-1 active:scale-90 transition-transform cursor-pointer"
                              title={`Удалить размер ${s}`}
                              aria-label="Закрыть"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Preset Sizes Bar */}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[11px] text-[#4E5C70] font-semibold mr-0.5">Сетка:</span>
                      {PRESET_SIZES.map((sz) => {
                        const isSelected = formSizes.includes(sz);
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleTogglePresetSize(sz)}
                            className={`h-6 px-2 rounded-lg text-[11px] font-black transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'neu-pill-active'
                                : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                            }`}
                          >
                            {sz}
                          </button>
                        );
                      })}
                    </div>

                    {/* Add Custom Size */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <input
                        type="text"
                        value={customSizeInput}
                        onChange={(e) => setCustomSizeInput(e.target.value)}
                        placeholder="Свой размер (напр. XXL или 52)"
                        className="flex-1 min-w-0 h-8 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] uppercase placeholder:text-[#56647A]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomSize}
                        disabled={!customSizeInput.trim()}
                        className="h-8 px-3 neu-button rounded-xl text-xs font-black text-[#4B59BB] cursor-pointer shrink-0 transition-all active:scale-95 disabled:opacity-40"
                      >
                        + Размер
                      </button>
                    </div>
                  </div>

                  {/* SKU Stock Matrix */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <label className="text-[11px] font-bold text-[#4E5C70] flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-[#4B59BB]" />
                        <span>Остатки SKU ({formSkus.length} вариаций)</span>
                      </label>

                      {/* Bulk Adjustments */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleBulkChangeAllSkuStock(5)}
                          className="h-6 px-2 rounded-lg neu-button text-[11px] font-bold text-[#4B59BB] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                          title="Добавить +5 шт. ко всем вариациям"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkChangeAllSkuStock(10)}
                          className="h-6 px-2 rounded-lg neu-button text-[11px] font-bold text-[#4B59BB] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                          title="Добавить +10 шт. ко всем вариациям"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAllSkuStock}
                          className="h-6 px-2 rounded-lg neu-button text-[11px] font-bold text-danger active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                          title="Обнулить остатки всех вариаций"
                        >
                          Обнулить
                        </button>
                        <button
                          type="button"
                          onClick={handleRegenerateMissingCodes}
                          className="h-6 px-2 rounded-lg neu-button text-[11px] font-bold text-[#4E5C70] hover:text-[#4B59BB] active:scale-95 transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          title="Заполнить пропущенные артикулы и штрихкоды"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Коды</span>
                        </button>
                      </div>
                    </div>

                    <div className="neu-inset rounded-2xl p-2 max-h-56 overflow-y-auto space-y-1.5 text-xs bg-[#E3E8EF]">
                      {formSkus.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#4E5C70]">
                          Нет вариаций SKU. Добавьте цвет и размер.
                        </div>
                      ) : (
                        formSkus.map((sku, sIdx) => {
                          const matchingColor = formColors.find((c) => c.name === sku.color);
                          return (
                            <div
                              key={`form-sku-${sku.color}-${sku.size}-${sku.id || sIdx}-${sIdx}`}
                              className="flex items-center justify-between py-1.5 px-2.5 neu-flat rounded-xl bg-[#E3E8EF] gap-2 border border-white/40"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                                  style={{ backgroundColor: matchingColor?.hex || '#94A3B8' }}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-[#2D3A4E] text-xs">
                                      {sku.color}
                                    </span>
                                    <span className="text-[#BAC5D5]">•</span>
                                    <span className="font-extrabold text-[#4B59BB] text-xs">
                                      {sku.size}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-mono">
                                    <span>{sku.skuCode}</span>
                                    {sku.barcode && (
                                      <>
                                        <span className="text-[#BAC5D5]">|</span>
                                        <span className="text-[11px]">{sku.barcode}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Stepper controls */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormSkus((prev) =>
                                      prev.map((it, idx) =>
                                        idx === sIdx ? { ...it, stock: Math.max(0, (it.stock || 0) - 1) } : it
                                      )
                                    );
                                  }}
                                  className="w-6 h-6 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer font-bold text-xs"
                                  aria-label="Уменьшить остаток"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="9999"
                                  value={sku.stock}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setFormSkus((prev) =>
                                      prev.map((it, idx) => (idx === sIdx ? { ...it, stock: val } : it))
                                    );
                                  }}
                                  className="w-12 text-center py-1 neu-inset rounded-lg font-black text-xs text-[#4B59BB] bg-[#E3E8EF]"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormSkus((prev) =>
                                      prev.map((it, idx) =>
                                        idx === sIdx ? { ...it, stock: (it.stock || 0) + 1 } : it
                                      )
                                    );
                                  }}
                                  className="w-6 h-6 rounded-lg neu-button flex items-center justify-center text-[#4B59BB] hover:text-[#3F4BA6] active:scale-95 transition-all cursor-pointer font-bold text-xs"
                                  aria-label="Увеличить остаток"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <span className="text-[11px] font-bold text-[#4E5C70] ml-0.5">шт.</span>

                                {/* Stock status dot */}
                                <span
                                  className={`w-2 h-2 rounded-full ml-1 shrink-0 ${
                                    sku.stock === 0
                                      ? 'bg-danger'
                                      : sku.stock < 3
                                      ? 'bg-warning'
                                      : 'bg-success'
                                  }`}
                                  title={
                                    sku.stock === 0
                                      ? 'Нет в наличии'
                                      : sku.stock < 3
                                      ? 'Мало на складе'
                                      : 'В наличии'
                                  }
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Action Buttons & Summaries */}
              <div className="pt-3 border-t border-[#BAC5D5]/50 space-y-3">
                {/* Neumorphic Recessed Summary Columns */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl bg-[#E3E8EF] flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Общий остаток</span>
                    <span className="text-xs sm:text-sm font-black text-[#4B59BB]">
                      {totalFormStock} <span className="text-[11px] font-bold">шт.</span>
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl bg-[#E3E8EF] flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Оценка партии</span>
                    <span className="text-xs sm:text-sm font-black text-[#2D3A4E] truncate">
                      {totalFormInventoryValue.toLocaleString('ru-RU')} <span className="text-[11px] font-bold">₽</span>
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl bg-[#E3E8EF] flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Статус товара</span>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${formInStock ? 'bg-success' : 'bg-danger'}`} />
                      <span
                        className={`text-xs sm:text-sm font-black ${
                          formInStock ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {formInStock ? 'В продаже' : 'Снят'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsProductFormOpen(false)}
                    className="flex-1 sm:flex-initial py-2.5 px-5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer text-center"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 sm:flex-initial py-2.5 px-6 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>{editingProduct ? 'Сохранить изменения' : 'Создать товар'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CSV IMPORT ================= */}
      {isCSVImportModalOpen && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-xl w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex items-start sm:items-center justify-between pb-2 border-b border-[#BAC5D5]/50 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4B59BB] shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#2D3A4E] truncate">
                    Импорт каталога из CSV
                  </h3>
                  <p className="text-[11px] text-[#4E5C70] font-medium truncate sm:whitespace-normal leading-tight">
                    Загрузите файл или вставьте строки CSV для пакетного добавления
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCSVImportModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
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
                  className="w-full text-xs text-[#2D3A4E] file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-[#5F6ED0] file:text-white file:font-bold file:mr-3 file:cursor-pointer cursor-pointer neu-inset p-2 rounded-xl bg-[#E3E8EF]"
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
                  className="w-full p-3 neu-inset rounded-xl font-mono text-[11px] text-[#2D3A4E] bg-[#E3E8EF] leading-relaxed"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setIsCSVImportModalOpen(false)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExecuteCSVImport}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-all"
              >
                Импортировать в каталог
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: QUICK PRODUCT INSPECT ================= */}
      {productToInspect && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[90vh] overflow-y-auto my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4B59BB]">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-[#2D3A4E]">
                    Карточка товара
                  </h3>
                  <span className="text-[11px] font-mono text-[#4E5C70]">{productToInspect.id}</span>
                </div>
              </div>
              <button
                onClick={() => setProductToInspect(null)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gallery Thumbnail */}
            <div className="aspect-[16/9] rounded-2xl overflow-hidden neu-inset bg-slate-200 relative">
              <img
                src={productToInspect.images?.[0]}
                alt={productToInspect.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {productToInspect.badge && (
                <span className="absolute top-2.5 left-2.5 neu-fill-accent text-white text-[11px] font-black px-2 py-0.5 rounded-lg">
                  {productToInspect.badge}
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-baseline gap-2">
                <h4 className="text-base font-black text-[#2D3A4E] leading-tight">
                  {productToInspect.title}
                </h4>
                <div className="text-right shrink-0">
                  <div className="text-base font-black text-[#4B59BB]">
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
                <div className="neu-inset rounded-xl p-2.5 bg-[#E3E8EF]">
                  <span className="text-[#4E5C70] block">Категория:</span>
                  <strong className="text-[#2D3A4E]">
                    {productToInspect.categoryLabel || productToInspect.category}
                  </strong>
                </div>
                <div className="neu-inset rounded-xl p-2.5 bg-[#E3E8EF]">
                  <span className="text-[#4E5C70] block">Материал:</span>
                  <strong className="text-[#2D3A4E]">
                    {productToInspect.material || '100% лен'}
                  </strong>
                </div>
              </div>

              {/* SKU Breakdown in inspect modal */}
              {productToInspect.skus && productToInspect.skus.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#4E5C70]">
                    <span>Вариации SKU ({productToInspect.skus.length})</span>
                    <span className="text-[#4B59BB] font-black">
                      Всего: {getProductTotalStock(productToInspect)} шт.
                    </span>
                  </div>
                  <div className="neu-inset rounded-xl p-2 max-h-36 overflow-y-auto space-y-1 text-[11px] bg-[#E3E8EF]">
                    {productToInspect.skus.map((sku, sIdx) => (
                      <div
                        key={`inspect-sku-${sku.color}-${sku.size}-${sku.id || sIdx}-${sIdx}`}
                        className="flex items-center justify-between py-1 px-2 neu-flat rounded-lg bg-[#E3E8EF]"
                      >
                        <span className="font-bold text-[#2D3A4E]">
                          {sku.color} • {sku.size}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-[#4E5C70]">
                          <span>{sku.skuCode}</span>
                          <span className="font-black text-[#4B59BB]">{sku.stock} шт.</span>
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
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
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
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Редактировать товар</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE PRODUCT CONFIRMATION ================= */}
      {productToDelete && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-3.5 text-[#2D3A4E] border border-white/80 my-auto text-center">
            <div className="w-12 h-12 rounded-2xl neu-inset mx-auto flex items-center justify-center text-danger bg-[#E3E8EF]">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-black text-[#2D3A4E]">Удалить товар?</h3>
              <p className="text-xs text-[#4E5C70] leading-relaxed">
                Вы действительно хотите безвозвратно удалить{' '}
                <strong className="text-[#2D3A4E]">«{productToDelete.title}»</strong> из каталога?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
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
                className="flex-1 py-2.5 neu-button-danger rounded-xl text-xs font-black active:scale-95 transition-all cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Discount Modal */}
      {isBulkDiscountModalOpen && (
        <div className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="neu-modal rounded-3xl p-6 max-w-sm w-full space-y-4 text-[#2D3A4E] border border-white/80 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#BAC5D5]/50">
              <h3 className="text-sm font-black uppercase text-[#2D3A4E]">Скидка на товары</h3>
              <button
                onClick={() => setIsBulkDiscountModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4E5C70] font-bold">
              Применить процент скидки к <strong className="text-[#4B59BB]">{selectedProductIds.length}</strong> товарам:
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[10, 15, 20, 25, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setBulkDiscountPercent(pct)}
                  className={`py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
                    bulkDiscountPercent === pct
                      ? 'neu-pill-active'
                      : 'neu-button text-[#2D3A4E] hover:text-[#4B59BB]'
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
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleBulkApplyDiscount}
                className="flex-1 py-2.5 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 transition-all"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Zoom Modal */}
      {previewZoomImage && (
        <div
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewZoomImage(null)}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] neu-flat rounded-3xl overflow-hidden bg-[#E3E8EF] p-2 border border-white/60"
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
        </div>
      )}

      {/* Advanced Bulk Operations Modal */}
      <AdminBulkOperationsModal
        isOpen={isBulkOperationsModalOpen}
        onClose={() => setIsBulkOperationsModalOpen(false)}
        selectedProducts={products.filter((p) => selectedProductIds.includes(p.id))}
        onApplyBulkChanges={(updatedList, summary) => {
          const map = new Map(updatedList.map((p) => [p.id, p]));
          const merged = products.map((p) => (map.has(p.id) ? map.get(p.id)! : p));
          onUpdateProducts(merged);
          onShowToast(summary || 'Изменения применены', 'success');
          setIsBulkOperationsModalOpen(false);
          setSelectedProductIds([]);
        }}
        onShowToast={onShowToast}
      />

      {/* Dedicated Text Edit Modal for Material and Description with synchronized quick phrases and accents */}
      {textEditModal && textEditModal.isOpen && (
        <TextEditModal
          isOpen={textEditModal.isOpen}
          type={textEditModal.type}
          category={textEditModal.category || formCategory}
          title={textEditModal.title}
          subtitle={textEditModal.subtitle}
          initialValue={textEditModal.value}
          onClose={() => setTextEditModal(null)}
          onSave={(newValue) => {
            if (textEditModal.type === 'material') {
              setFormMaterial(newValue);
              onShowToast('Материал ткани успешно обновлен', 'success');
            } else {
              setFormDescription(newValue);
              onShowToast('Описание товара успешно обновлено', 'success');
            }
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
