import React, { useState, useMemo, useRef } from 'react';
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
  Sparkles,
  Eye,
  Copy,
  ChevronDown,
  Boxes,
  FileSpreadsheet,
  Image as ImageIcon,
  ImagePlus,
  DollarSign,
  Minus,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Loader2,
  Palette,
  Ruler,
} from 'lucide-react';
import { Product, ProductSKU, StockMovementLog } from '../../types';
import { deleteProductPhotos, saveProductPhotos, saveStockMovements } from '../../utils/firebaseSync';
import { formatOrderDate } from '../../shared/orderDate';
import { SelectCheckbox } from './SelectCheckbox';
import { exportProductsToCSV, parseProductsFromCSV } from '../../utils/csvHelpers';
import { processImageFiles } from '../../utils/imageUpload';
import {
  generateDefaultSKUs,
  generateSkuCode,
  generateBarcode,
  getProductTotalStock,
  isHiddenFromSale,
  mergeFormStock,
  stockMovementId,
  withMissingSkus,
} from '../../utils/inventory';
import { colorHexForName, normalizeColorName, normalizeProductColors, readColorCode, splitColorEntry } from '../../utils/colorCode';
import { droppedPhotoIds, splitProductPhotos, storedImagesEstimate } from '../../utils/productPhotos';
import { articleGroupKey, collectBarcodes, unifyArticleBarcodes } from '../../shared/barcode';
import { AdminBulkOperationsModal } from './AdminBulkOperationsModal';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { ModalPortal } from '../ModalPortal';
import { TextEditModal } from './TextEditModal';
import { NotConfigured } from '../NotConfigured';
import {
  AdminProductCardStructure,
  EMPTY_CARD_STRUCTURE,
  ProductCardStructure,
  cardStructureFromProduct,
  cardStructureToProduct,
} from './AdminProductCardStructure';
import { categoryIcon } from '../../utils/categories';
import type { StoreCategory } from '../../types';
import { productImage } from '../../utils/productImage';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { useChangedSince, useUnsavedChanges } from '../../utils/unsavedChanges';
import { docSizeBytes, formatMegabytes, PRODUCT_SIZE_BUDGET_BYTES } from '../../utils/productSize';
import { DiscardChangesDialog, useDiscardGuard } from '../DiscardChangesDialog';

interface AdminProductsTabProps {
  /** Admin → «Категории»: the only category list for products */
  categories?: StoreCategory[];
  products: Product[];
  /** Resolves to false when the database refused the write (the error toast is already shown) */
  onUpdateProducts: (updated: Product[]) => Promise<boolean> | void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}


const PRESET_BADGES = ['ХИТ', 'NEW', 'SALE', '-20%', 'PREMIUM', 'LIMITED', 'ECO', 'EXCLUSIVE'];

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '46', '48', '50', '52', '54'];

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  categories = [],
  products,
  onUpdateProducts,
  onShowToast,
}) => {
  // «Все категории» for the filter + the categories from Admin → «Категории»
  const CATEGORY_OPTIONS = useMemo(() => [{ id: 'all', name: 'Все категории' }, ...categories], [categories]);
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  // Selection & Bulk
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkOperationsModalOpen, setIsBulkOperationsModalOpen] = useState(false);
  const [isBulkDiscountModalOpen, setIsBulkDiscountModalOpen] = useState(false);
  const bulkDiscountDialog = useDialogA11y(isBulkDiscountModalOpen, () => setIsBulkDiscountModalOpen(false));
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState<number>(15);
  const [isBulkCategoryDropdownOpen, setIsBulkCategoryDropdownOpen] = useState(false);

  // Modals
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  /** Problems found on «Сохранить»: listed next to the button instead of a pile of error toasts */
  const [showFormErrors, setShowFormErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const formErrorsRef = useRef<HTMLDivElement>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const deleteProductDialog = useDialogA11y(Boolean(productToDelete), () => setProductToDelete(null));
  const [productToInspect, setProductToInspect] = useState<Product | null>(null);
  const inspectDialog = useDialogA11y(Boolean(productToInspect), () => setProductToInspect(null));
  const [isCSVImportModalOpen, setIsCSVImportModalOpen] = useState(false);
  const csvDialog = useDialogA11y(isCSVImportModalOpen, () => setIsCSVImportModalOpen(false));
  const [csvInputText, setCsvInputText] = useState('');

  // Product Form Fields State
  const [formTitle, setFormTitle] = useState('');
  // No category is picked for the admin: a preselected first one was easy to save by mistake (UX audit 03.10, finding 16)
  const [formCategory, setFormCategory] = useState('');
  // Categories from Admin → «Категории»; a product's category missing there is still shown (and kept on save)
  const categoryIsListed = categories.some((c) => c.id === formCategory);
  const formCategoryOptions = useMemo(() => {
    const option = (category: Pick<StoreCategory, 'id' | 'name' | 'icon'>, sublabel?: string) => {
      const Icon = categoryIcon(category);
      return {
        value: category.id,
        label: category.name,
        sublabel,
        icon: <Icon className="w-3.5 h-3.5 text-accent" />,
      };
    };
    const options = categories.map((c) => option(c));
    if (formCategory && !categories.some((c) => c.id === formCategory)) {
      const label = editingProduct?.category === formCategory ? editingProduct.categoryLabel : undefined;
      options.unshift(option({ id: formCategory, name: label || formCategory }, 'Текущая категория товара'));
    }
    return options;
  }, [categories, formCategory, editingProduct]);
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formCostPrice, setFormCostPrice] = useState<number | undefined>(undefined);
  const [formOldPrice, setFormOldPrice] = useState<number | undefined>(undefined);
  const [formBadge, setFormBadge] = useState<string>('');
  const [formInStock, setFormInStock] = useState<boolean>(true);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState('');
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  /** A photo that could not be read goes to the form's error list, not to a toast (UX audit 03.10, finding 17) */
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDraggingOverGallery, setIsDraggingOverGallery] = useState(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);
  const zoomDialog = useDialogA11y(Boolean(previewZoomImage), () => setPreviewZoomImage(null), { label: 'Просмотр фото' });
  const [textEditModal, setTextEditModal] = useState<{
    isOpen: boolean;
    category?: string;
    title: string;
    subtitle: string;
    value: string;
  } | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [formSizes, setFormSizes] = useState<string[]>([]);
  const [formColors, setFormColors] = useState<{ name: string; hex: string }[]>([]);
  const [formSkus, setFormSkus] = useState<ProductSKU[]>([]);
  /** The variants as the form opened them: a stock not changed in the form is saved as it is in the database now */
  const [formSkusOpened, setFormSkusOpened] = useState<ProductSKU[]>([]);
  // Card sections (description highlights, composition, characteristics, care)
  const [formCard, setFormCard] = useState<ProductCardStructure>(EMPTY_CARD_STRUCTURE);
  // What the product will take in the database: photos (data: URIs) are almost all of it
  const formSizeBytes = useMemo(
    () =>
      isProductFormOpen
        ? docSizeBytes({
            title: formTitle,
            description: formDescription,
            // a heavy photo is stored apart: the product keeps its preview (stage 6)
            images: storedImagesEstimate(formImages),
            colors: formColors,
            sizes: formSizes,
            skus: formSkus,
            ...cardStructureToProduct(formCard),
          })
        : 0,
    [isProductFormOpen, formTitle, formDescription, formImages, formColors, formSizes, formSkus, formCard]
  );

  // Checked on «Сохранить» and then live, so a fixed field drops out of the list at once
  const validationErrors = useMemo(() => {
    const numPrice = Number(formPrice);
    const fibers = formCard.composition.filter((c) => c.fiber.trim() && Number(c.percentage) > 0);
    const fiberTotal = fibers.reduce((sum, c) => sum + Number(c.percentage), 0);
    return [

      !formTitle.trim() && 'Введите название товара',
      !formCategory && 'Выберите категорию',
      (!numPrice || numPrice <= 0) && 'Укажите цену больше нуля',
      formColors.length === 0 && 'Добавьте хотя бы один цвет',
      formSizes.length === 0 && 'Выберите хотя бы один размер',
      formImages.length === 0 && 'Добавьте хотя бы одно фото',
      formOldPrice && Number(formOldPrice) <= numPrice &&
        'Старая цена должна быть больше текущей — иначе скидки нет. Очистите поле или исправьте цену',
      fibers.length > 0 && fiberTotal !== 100 &&
        `Сумма состава ткани — ${fiberTotal}%, а должна быть 100% («Структура карточки»)`,
      formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES &&
        `Товар занимает ${formatMegabytes(formSizeBytes)} из ${formatMegabytes(PRODUCT_SIZE_BUDGET_BYTES)}: база его не примет. Уберите часть фото`,
    ].filter((m): m is string => Boolean(m));

  }, [formTitle, formCategory, formPrice, formColors, formSizes, formImages, formOldPrice, formCard, formSizeBytes]);
  const formErrors = [
    ...(showFormErrors ? validationErrors : []),
    ...(photoError ? [photoError] : []),
    ...(saveError ? [saveError] : []),
  ];
  // Removal waiting for confirmation (photo, color, size, stock reset), as in the cart
  const [pendingRemoval, setPendingRemoval] = useState<{
    title: string;
    message: string;
    preview?: React.ReactNode;
    confirmLabel?: string;
    run: () => void;
  } | null>(null);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [customColorName, setCustomColorName] = useState('');
  // What is typed or pasted into the code field («#1E2B37», «1e2b37», «rgb(30, 43, 55)»); read by readColorCode
  const [customColorHex, setCustomColorHex] = useState('#2D3A4E');
  // The admin chose the shade (typed a code or tapped the palette): the name no longer picks it
  const [customColorHexChosen, setCustomColorHexChosen] = useState(false);

  // Unsaved edits: Escape, «×» and «Отмена» ask before the form closes; the admin panel asks too
  const isProductFormDirty = useChangedSince(isProductFormOpen ? editingProduct?.id ?? 'new' : null, [
    formTitle,
    formCategory,
    formPrice,
    formCostPrice,
    formOldPrice,
    formBadge,
    formInStock,
    formImages,
    newImageUrlInput,
    formDescription,
    formSizes,
    formColors,
    formSkus,
    formCard,
    customSizeInput,
    customColorName,
  ]);
  useUnsavedChanges(isProductFormDirty, 'Форма товара');
  const productFormGuard = useDiscardGuard(isProductFormDirty, () => setIsProductFormOpen(false));
  const productFormDialog = useDialogA11y(isProductFormOpen, productFormGuard.requestClose);

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

  // SKU Uniqueness checker across catalog
  const skuConflictInfo = useMemo(() => {
    if (!isProductFormOpen) return { hasConflicts: false, duplicateCodes: [] };

    const otherSkusMap = new Map<string, string>(); // skuCode -> productTitle
    const otherBarcodes = new Map<string, string>(); // barcode -> productTitle
    products.forEach((p) => {
      if (editingProduct && p.id === editingProduct.id) return;
      const skus = p.skus || generateDefaultSKUs(p);
      skus.forEach((s) => {
        if (s.skuCode) otherSkusMap.set(s.skuCode.toUpperCase(), p.title);
        if (s.barcode?.trim()) otherBarcodes.set(s.barcode.trim(), p.title);
      });
    });

    const duplicates: { code: string; conflictingProduct: string; kind: 'sku' | 'barcode' }[] = [];
    // sizes of one colour share a barcode; another colour or product must not have it
    const formBarcodes = new Map<string, string>(); // barcode -> colour
    const reported = new Set<string>();
    formSkus.forEach((s) => {
      if (s.skuCode && otherSkusMap.has(s.skuCode.toUpperCase())) {
        duplicates.push({
          code: s.skuCode,
          conflictingProduct: otherSkusMap.get(s.skuCode.toUpperCase()) || 'Другой товар',
          kind: 'sku',
        });
      }
      const barcode = s.barcode?.trim();
      if (!barcode) return;
      const color = s.color.trim().toLowerCase();
      const otherColor = formBarcodes.has(barcode) && formBarcodes.get(barcode) !== color;
      if ((otherBarcodes.has(barcode) || otherColor) && !reported.has(barcode)) {
        reported.add(barcode);
        duplicates.push({
          code: barcode,
          conflictingProduct: otherBarcodes.get(barcode) || 'другим цветом этого товара',
          kind: 'barcode',
        });
      }
      if (!formBarcodes.has(barcode)) formBarcodes.set(barcode, color);
    });

    return {
      hasConflicts: duplicates.length > 0,
      duplicateCodes: duplicates,
    };
  }, [isProductFormOpen, formSkus, products, editingProduct]);

  // Every barcode in the catalog and in the form: new variations get codes that are not among them
  const takenBarcodes = () => collectBarcodes([...products, { id: 'form', skus: formSkus }]);
  /** One barcode per article (product + colour): an existing colour keeps its code, a new colour gets a new one */
  const barcodeForColor = (color: string, taken: Set<string>, skus: ProductSKU[] = formSkus) =>
    skus.find((s) => s.color.trim().toLowerCase() === color.trim().toLowerCase() && s.barcode?.trim())?.barcode ??
    generateBarcode(taken);

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
      selectedProductIds.includes(p.id) ? { ...p, inStock, hiddenFromSale: !inStock } : p
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
    const updated = products.map((p) =>
      selectedProductIds.includes(p.id)
        ? { ...p, category: newCat, categoryLabel: catObj?.name || p.categoryLabel || newCat }
        : p
    );
    onUpdateProducts(updated);
    onShowToast(`Категория обновлена для ${selectedProductIds.length} товаров на "${catObj?.name || newCat}"`, 'success');
    setSelectedProductIds([]);
    setIsBulkCategoryDropdownOpen(false);
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
    // A new product starts empty: no made-up price, photo, texts, colors, sizes or stock
    setEditingProduct(null);
    setFormTitle('');
    setFormCategory('');
    setFormPrice(0);
    setFormCostPrice(undefined);
    setFormOldPrice(undefined);
    setFormBadge('');
    setFormInStock(true);
    setFormImages([]);
    setNewImageUrlInput('');
    setFormDescription('');
    setFormSizes([]);
    setFormColors([]);
    setFormSkus([]);
    setFormSkusOpened([]);
    setFormCard(EMPTY_CARD_STRUCTURE);
    setShowFormErrors(false);
    setPhotoError(null);
    setSaveError(null);
    setIsProductFormOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormTitle(prod.title);
    // a product without a category does not get the first one silently: «Выберите категорию» on save
    setFormCategory(prod.category || '');
    setFormPrice(prod.price);
    setFormCostPrice(prod.costPrice);
    setFormOldPrice(prod.originalPrice);
    setFormBadge(prod.badge || '');
    setFormInStock(!isHiddenFromSale(prod));
    setFormImages([...(prod.images ?? [])]);
    setNewImageUrlInput('');
    setFormDescription(prod.description || '');
    setFormSizes([...(prod.sizes ?? [])]);
    // an old colour saved as a string («Черный») becomes { name, hex } here, as the form expects
    setFormColors(normalizeProductColors(prod.colors));
    // Every colour × size has its variation: one without a saved variation (a colour added by an old CSV import)
    // starts at 0 for the admin to fill in, and is written with the product
    const openedSkus = withMissingSkus(prod);
    setFormSkus(openedSkus);
    setFormSkusOpened(openedSkus);
    setFormCard(cardStructureFromProduct(prod));
    setShowFormErrors(false);
    setPhotoError(null);
    setSaveError(null);
    setIsProductFormOpen(true);
  };

  // «Enter» in a field never submits the whole form: in an add-a-value row (link to a photo, colour, size)
  // it presses that row's «+» button
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const el = e.target as HTMLElement;
    if (e.key !== 'Enter' || el.tagName !== 'INPUT') return;
    e.preventDefault();
    el.closest('[data-enter-adds]')?.querySelector<HTMLButtonElement>('button:not([disabled])')?.click();
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct) return;
    const numPrice = Number(formPrice);
    setShowFormErrors(true);
    setPhotoError(null);
    setSaveError(null);
    if (validationErrors.length > 0) {
      requestAnimationFrame(() => formErrorsRef.current?.focus());
      return;
    }

    // A category missing from Admin → «Категории» keeps the product's current name
    const catObj = CATEGORY_OPTIONS.find((c) => c.id === formCategory);
    const catLabel =
      catObj?.name ||
      (editingProduct?.category === formCategory ? editingProduct.categoryLabel : undefined) ||
      formCategory;
    const cardFields = cardStructureToProduct(formCard);
    // Full photos go to their own documents, the product keeps previews (stage 6, finding 18). A photo that stayed keeps
    // its document; the photos are written before the product, so the product never points at a missing photo
    const productId = editingProduct?.id ?? `prod-${Date.now()}`;
    const storedProduct = editingProduct ? products.find((p) => p.id === editingProduct.id) ?? editingProduct : undefined;
    const known = new Map<string, string>();
    for (const source of [editingProduct, storedProduct]) {
      (source?.images ?? []).forEach((src, i) => {
        const id = source?.photoIds?.[i];
        if (id) known.set(src, id);
      });
    }
    setIsSavingProduct(true);
    let photos: Awaited<ReturnType<typeof splitProductPhotos>>;
    try {
      photos = await splitProductPhotos(productId, formImages, known);
      await saveProductPhotos(photos.newPhotos);
    } catch (err) {
      console.error('Product photos were not saved:', err);
      setSaveError('База не приняла фото товара. Введённое осталось в форме: проверьте соединение и нажмите ещё раз');
      setIsSavingProduct(false);
      return;
    }
    setIsSavingProduct(false);
    const finalImages = photos.images;
    const photoFields = { images: finalImages, photoIds: photos.photoIds };
    // Variations without a barcode get a unique one on save
    // One barcode per colour for the whole size range; missing ones are issued
    const savedId = editingProduct?.id ?? 'form';
    const [savedDraft] = unifyArticleBarcodes(
      [{ id: savedId, skus: formSkus }, ...products.filter((p) => p.id !== savedId)],
      new Set(formSkus.map((s) => articleGroupKey(savedId, s.color)))
    );
    // Stocks the form did not change come from the database now; changed ones go to the journal (findings 5 and 9)
    const live = editingProduct ? products.find((p) => p.id === editingProduct.id) : undefined;
    const { skus: savedSkus, changes: stockChanges } = mergeFormStock(
      savedDraft.skus ?? formSkus,
      editingProduct ? formSkusOpened : [],
      live?.skus ?? []
    );
    const journal = (productId: string, title: string): StockMovementLog[] => {
      const at = new Date();
      return stockChanges.map(({ sku, before, after }) => ({
        id: stockMovementId(),
        createdAt: at.toISOString(),
        date: formatOrderDate(at),
        type: after > before ? 'receipt' : 'writeoff',
        productId,
        productTitle: title,
        skuCode: sku.skuCode ?? '',
        color: sku.color,
        size: sku.size,
        changeQuantity: after - before,
        previousStock: before,
        newStock: after,
        reason: editingProduct ? 'Правка остатка в форме товара' : 'Остаток при создании товара',
        operator: 'Администратор',
      }));
    };

    if (editingProduct) {
      const updated: Product = {
        ...editingProduct,
        title: formTitle.trim(),
        category: formCategory,
        categoryLabel: catLabel,
        price: numPrice,
        costPrice: formCostPrice ? Number(formCostPrice) : undefined,
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        badge: formBadge.trim() || undefined,
        description: formDescription.trim(),
        ...photoFields,
        sizes: formSizes,
        colors: formColors,
        skus: savedSkus,
        inStock: formInStock && (savedSkus.length === 0 || savedSkus.some((s) => s.stock > 0)),
        // «Снят с витрины» apart from «sold out»: a hidden sold-out product is not preordered (finding 12)
        hiddenFromSale: !formInStock,
        ...cardFields,
      };

      const saved = await finishSave(
        products.map((p) => (p.id === editingProduct.id ? updated : p)),
        `Товар «${formTitle.trim()}» сохранен`,
        journal(updated.id, updated.title)
      );
      // photos the product no longer shows: their documents go after the product was saved
      const dropped = droppedPhotoIds(storedProduct, photos.photoIds);
      if (saved && dropped.length > 0) {
        deleteProductPhotos(dropped).catch((err) => console.error('Old product photos were not removed:', err));
      }
    } else {
      const newProd: Product = {
        id: productId,
        title: formTitle.trim(),
        category: formCategory,
        categoryLabel: catLabel,
        price: numPrice,
        costPrice: formCostPrice ? Number(formCostPrice) : undefined,
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        badge: formBadge.trim() || undefined,
        description: formDescription.trim(),
        ...photoFields,
        sizes: formSizes,
        colors: formColors,
        skus: savedSkus,
        inStock: formInStock && (savedSkus.length === 0 || savedSkus.some((s) => s.stock > 0)),
        // «Снят с витрины» apart from «sold out»: a hidden sold-out product is not preordered (finding 12)
        hiddenFromSale: !formInStock,
        ...cardFields,
        rating: 0,
        reviewsCount: 0,
        isNew: true,
      };

      await finishSave([newProd, ...products], `Товар «${formTitle.trim()}» добавлен в каталог`, journal(newProd.id, newProd.title));
    }
  };

  /** The form closes and says «сохранен» only after the database accepted the product; otherwise the input stays */
  const finishSave = async (next: Product[], successText: string, movements: StockMovementLog[] = []): Promise<boolean> => {
    setIsSavingProduct(true);
    try {
      if ((await onUpdateProducts(next)) === false) {
        setSaveError('База не приняла товар. Введённое осталось в форме: проверьте соединение и нажмите ещё раз');
        return false;
      }
      // every stock change is a journal entry («Склад и SKU» → «Журнал движений»)
      if (movements.length > 0) {
        saveStockMovements(movements).catch((err) => {
          console.error('Stock journal was not written:', err);
          onShowToast('Не сохранено: запись в журнале склада. Остатки изменены, проверьте соединение.', 'error');
        });
      }
      onShowToast(successText, 'success');
      setIsProductFormOpen(false);
      return true;
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Gallery file upload and drag-and-drop handlers
  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await addPhotoFiles(files);
  };

  /**
   * Photos from the device or a drop: the gallery shows them, so no «Загружено» toast; a file that could not be read
   * is named in the form's error list (form messages go without toasts — UX audit 03.10, finding 17)
   */
  const addPhotoFiles = async (files: FileList) => {
    try {
      setIsUploadingImage(true);
      const loadedImages = await processImageFiles(files);
      if (loadedImages.length > 0) setFormImages((prev) => [...prev, ...loadedImages]);
      const skipped = files.length - loadedImages.length;
      setPhotoError(
        skipped <= 0
          ? null
          : loadedImages.length === 0
          ? 'Не удалось загрузить фото. Поддерживаются форматы JPG, PNG, WEBP'
          : `Не загружено ${skipped} из ${files.length} фото: поддерживаются форматы JPG, PNG, WEBP`
      );
    } catch (err) {
      console.error('Error processing gallery files:', err);
      setPhotoError('Не удалось прочитать фото. Попробуйте выбрать его ещё раз');
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
    await addPhotoFiles(files);
  };

  const photoPreview = (src: string, label: string) => (
    <>
      <img src={src} alt="" className="w-12 h-12 rounded-xl object-cover neu-flat shrink-0" referrerPolicy="no-referrer" />
      <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">{label}</p>
    </>
  );

  const handleDeleteImage = (indexToDelete: number) => {
    const src = formImages[indexToDelete];
    setPendingRemoval({
      title: 'Удалить фото?',
      message:
        indexToDelete === 0
          ? 'Это обложка товара. Обложкой станет следующее фото.'
          : 'Фото исчезнет из галереи товара после сохранения.',
      preview: src ? photoPreview(src, indexToDelete === 0 ? 'Обложка' : `Фото ${indexToDelete + 1}`) : undefined,
      run: () => {
        setFormImages((prev) => prev.filter((_, idx) => idx !== indexToDelete));
        onShowToast('Фото удалено из галереи', 'info');
      },
    });
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
    setPendingRemoval({
      title: 'Удалить все фото?',
      message: `Будут удалены все фото (${formImages.length}). Без фото товар нельзя сохранить.`,
      preview: formImages[0] ? photoPreview(formImages[0], `Фото в галерее: ${formImages.length}`) : undefined,
      confirmLabel: 'Удалить все',
      run: () => {
        setFormImages([]);
        onShowToast('Все фото товара удалены', 'info');
      },
    });
  };

  // Color management with SKU synchronization
  // A code inside the name («Хаки #556B2F» pasted from a supplier's table) wins over the code field
  const pendingColor = splitColorEntry(customColorName);
  const pendingColorHex = pendingColor.hex ?? readColorCode(customColorHex, { bare: true });
  const customColorHexUnreadable =
    !pendingColor.hex && customColorHex.trim() !== '' && !readColorCode(customColorHex, { bare: true });

  const handleCustomColorNameChange = (value: string) => {
    // a whole code pasted with the name goes to the code field («#55» while typing is not a code yet)
    const entry = splitColorEntry(value, 6);
    if (entry.hex) {
      setCustomColorName(entry.name);
      setCustomColorHex(entry.hex);
      setCustomColorHexChosen(true);
      return;
    }
    setCustomColorName(value);
    const byName = customColorHexChosen ? null : colorHexForName(value);
    if (byName) setCustomColorHex(byName);
  };

  const handleAddCustomColor = () => {
    const cleanName = pendingColor.name.trim();
    const hex = pendingColorHex;
    if (!cleanName || !hex) return;
    if (formColors.some((c) => normalizeColorName(c.name) === normalizeColorName(cleanName))) {
      onShowToast(`Цвет «${cleanName}» уже добавлен`, 'error');
      return;
    }
    const newColors = [...formColors, { name: cleanName, hex }];
    setFormColors(newColors);
    setCustomColorName('');
    setCustomColorHex(hex);
    setCustomColorHexChosen(false);

    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const colorBarcode = generateBarcode(takenBarcodes());
    const newSkus: ProductSKU[] = formSizes.map((size) => ({
      id: `${prodId}-${cleanName}-${size}`,
      color: cleanName,
      size,
      stock: 0,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, cleanName, size, 'WS'),
      barcode: colorBarcode,
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
  };

  const handleRemoveColor = (colorName: string) => {
    if (formColors.length <= 1) {
      onShowToast('У товара должен быть хотя бы один цвет', 'error');
      return;
    }
    const color = formColors.find((c) => c.name === colorName);
    const variants = formSkus.filter((s) => s.color === colorName);
    const stock = variants.reduce((sum, s) => sum + (s.stock || 0), 0);
    setPendingRemoval({
      title: 'Удалить цвет?',
      message: `Вместе с цветом удалятся его вариации (${variants.length}) и их остаток: ${stock} шт.`,
      preview: (
        <>
          <span
            className="w-8 h-8 rounded-full border border-black/15 shrink-0"
            style={{ backgroundColor: color?.hex || '#94A3B8' }}
          />
          <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">{colorName}</p>
        </>
      ),
      run: () => {
        setFormColors((prev) => prev.filter((c) => c.name !== colorName));
        setFormSkus((prev) => prev.filter((s) => s.color !== colorName));
      },
    });
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
    const taken = takenBarcodes();
    const newSkus: ProductSKU[] = formColors.map((c) => ({
      id: `${prodId}-${c.name}-${size}`,
      color: c.name,
      size,
      stock: 0,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size, 'WS'),
      barcode: barcodeForColor(c.name, taken),
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
  };

  const handleTogglePresetSize = (size: string) => {
    if (formSizes.includes(size)) {
      handleRemoveSize(size);
    } else {
      const newSizes = [...formSizes, size];
      setFormSizes(newSizes);

      const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
      const taken = takenBarcodes();
      const newSkus: ProductSKU[] = formColors.map((c) => ({
        id: `${prodId}-${c.name}-${size}`,
        color: c.name,
        size,
        stock: 0,
        skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size, 'WS'),
        barcode: barcodeForColor(c.name, taken),
      }));

      setFormSkus((prev) => [...prev, ...newSkus]);
    }
  };

  const handleRemoveSize = (sizeToRemove: string) => {
    if (formSizes.length <= 1) {
      onShowToast('У товара должен быть хотя бы один размер', 'error');
      return;
    }
    const variants = formSkus.filter((s) => s.size === sizeToRemove);
    const stock = variants.reduce((sum, s) => sum + (s.stock || 0), 0);
    setPendingRemoval({
      title: 'Удалить размер?',
      message: `Вместе с размером удалятся его вариации (${variants.length}) и их остаток: ${stock} шт.`,
      preview: (
        <>
          <span className="h-8 min-w-8 px-2 rounded-xl neu-flat flex items-center justify-center text-xs font-extrabold text-accent shrink-0">
            {sizeToRemove}
          </span>
          <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">Размер {sizeToRemove}</p>
        </>
      ),
      run: () => {
        setFormSizes((prev) => prev.filter((s) => s !== sizeToRemove));
        setFormSkus((prev) => prev.filter((s) => s.size !== sizeToRemove));
      },
    });
  };

  const handleResetAllSkuStock = () => {
    setPendingRemoval({
      title: 'Обнулить остатки?',
      message: `Остаток всех вариаций (${formSkus.length}) станет 0 шт. Сейчас на складе: ${formSkus.reduce(
        (sum, s) => sum + (s.stock || 0),
        0
      )} шт.`,
      confirmLabel: 'Обнулить',
      run: () => {
        setFormSkus((prev) => prev.map((s) => ({ ...s, stock: 0 })));
        onShowToast('Остатки всех вариаций SKU обнулены', 'info');
      },
    });
  };

  const handleRegenerateMissingCodes = () => {
    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const taken = takenBarcodes();
    setFormSkus((prev) => {
      const next: ProductSKU[] = [];
      for (const s of prev) {
        next.push({
          ...s,
          skuCode: s.skuCode || generateSkuCode({ id: prodId, category: formCategory }, s.color, s.size, 'WS'),
          barcode: s.barcode?.trim() ? s.barcode : barcodeForColor(s.color, taken, [...prev, ...next]),
        });
      }
      return next;
    });
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
  const handleExecuteCSVImport = async () => {
    if (!csvInputText.trim()) {
      onShowToast('Вставьте текст CSV или загрузите файл', 'error');
      return;
    }

    try {
      const { products: parsed, skipped } = parseProductsFromCSV(csvInputText, products);
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
    <div className="space-y-3.5">
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

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => exportProductsToCSV(products)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
            title="Экспортировать весь каталог в файл CSV для Excel"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Экспорт CSV</span>
          </button>

          <button
            onClick={() => setIsCSVImportModalOpen(true)}
            className="py-2 px-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
            title="Импортировать товары из CSV"
          >
            <Upload className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Импорт</span>
          </button>

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

          <span className="text-xs font-bold text-[#4E5C70]">
            Выбрано: <strong className="text-accent">{selectedProductIds.length}</strong>
          </span>
        </div>

        {selectedProductIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1.5 animate-in fade-in duration-150">
            <button
              onClick={() => setIsBulkOperationsModalOpen(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-extrabold text-accent flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Массовые операции
            </button>

            <button
              onClick={() => setIsBulkDiscountModalOpen(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-extrabold text-[#4E5C70] hover:text-accent flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
            >
              <Tag className="w-3.5 h-3.5 text-accent" />
              Скидка
            </button>

            <div className="relative">
              <button
                onClick={() => setIsBulkCategoryDropdownOpen(!isBulkCategoryDropdownOpen)}
                className="h-8 px-3 neu-button rounded-xl text-[11px] font-extrabold text-[#4E5C70] hover:text-[#2D3A4E] flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
              >
                <Layers className="w-3.5 h-3.5 text-accent" />
                Сменить категорию
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isBulkCategoryDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 neu-dropdown rounded-2xl p-1.5 space-y-1 min-w-[160px] animate-in fade-in border border-white/80">
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
              onClick={() => handleBulkToggleStock(false)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-extrabold text-[#4E5C70] hover:text-warning flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
            >
              <X className="w-3.5 h-3.5 text-warning" />
              Снять с продажи
            </button>

            <button
              onClick={() => handleBulkToggleStock(true)}
              className="h-8 px-3 neu-button rounded-xl text-[11px] font-extrabold text-[#4E5C70] hover:text-success flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
            >
              <Check className="w-3.5 h-3.5 text-success" />
              В продажу
            </button>

            <button
              onClick={() => setIsBulkDeleteConfirmOpen(true)}
              className="h-8 px-3 neu-button-danger rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить
            </button>
          </div>
        )}
      </div>
      )}

      {/* Products List Grid */}
      <div className="space-y-2">
        {products.length === 0 ? (
          <NotConfigured
            title="Каталог"
            hint={
              categories.length === 0
                ? 'Сначала добавьте категории во вкладке «Категории», затем — первый товар. Покупатели пока видят «Каталог: не настроено».'
                : 'Добавьте первый товар кнопкой «Добавить товар». Покупатели пока видят «Каталог: не настроено».'
            }
          />
        ) : filteredProducts.length === 0 ? (
          <div className="neu-inset rounded-2xl p-8 text-center space-y-1 text-[#4E5C70]">
            <p className="text-xs font-bold text-[#2D3A4E]">Товары не найдены</p>
            <p className="text-xs">Попробуйте изменить поисковый запрос или фильтры</p>
          </div>
        ) : (
          filteredProducts.map((prod, pIdx) => {
            const isSelected = selectedProductIds.includes(prod.id);
            const totalStock = getProductTotalStock(prod);
            const primarySku = prod.skus?.[0]?.skuCode || `WS-CAT-${prod.id.slice(-4)}`;

            return (
              <div
                key={`admin-product-${prod.id}-${pIdx}`}
                className={`neu-inset rounded-2xl p-3 sm:p-3.5 transition-all border ${
                  isSelected ? 'border-accent ring-1 ring-accent/40' : 'border-transparent'
                } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
              >
                {/* Product Main Content */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  {/* Selection Checkbox */}
                  <SelectCheckbox
                    checked={isSelected}
                    onToggle={() => handleToggleSelectOne(prod.id)}
                    label={`Выбрать товар «${prod.title}»`}
                    className="mt-1 sm:mt-0"
                  />

                  {/* Product Thumbnail */}
                  <div className="relative w-12 h-14 sm:w-14 sm:h-14 rounded-xl overflow-hidden neu-inset shrink-0">
                    <img
                      src={productImage(prod)}
                      alt={prod.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Main Product Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] leading-snug line-clamp-1 sm:truncate"
                        title={prod.title}
                      >
                        {prod.title}
                      </h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg neu-flat-sm text-accent shrink-0 whitespace-nowrap">
                        {prod.categoryLabel || prod.category}
                      </span>
                      {prod.badge && (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-fill-accent text-white shrink-0 leading-tight whitespace-nowrap">
                          {prod.badge}
                        </span>
                      )}
                      {isHiddenFromSale(prod) ? (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-inset text-danger shrink-0 border border-danger/25 whitespace-nowrap">
                          Снят с витрины
                        </span>
                      ) : prod.inStock === false ? (
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md neu-inset text-[#4E5C70] shrink-0 whitespace-nowrap">
                          Распродан
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#4E5C70] font-semibold flex-wrap">
                      <span className="font-mono text-accent font-bold text-[11px] bg-[#D8DFE8] px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        {primarySku}
                      </span>
                      <span className="font-extrabold text-[#2D3A4E] text-xs shrink-0 whitespace-nowrap">
                        {prod.price.toLocaleString('ru-RU')} ₽
                      </span>
                      {prod.originalPrice && (
                        <span className="line-through text-[#4E5C70] text-[11px] shrink-0 whitespace-nowrap">
                          {prod.originalPrice.toLocaleString('ru-RU')} ₽
                        </span>
                      )}
                      <span
                        className={`font-extrabold text-[11px] px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap ${
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
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-accent transition-all cursor-pointer shrink-0"
                      title="Быстрый просмотр карточки"
                      aria-label="Быстрый просмотр карточки"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Secondary: Duplicate */}
                    <button
                      onClick={() => handleDuplicateProduct(prod)}
                      className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-success transition-all cursor-pointer shrink-0"
                      title="Дублировать товар (копировать)"
                      aria-label="Дублировать товар (копировать)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Danger / Destructive: Delete */}
                    <button
                      onClick={() => setProductToDelete(prod)}
                      className="w-8 h-8 rounded-xl neu-button-danger flex items-center justify-center transition-all cursor-pointer shrink-0"
                      title="Удалить товар"
                      aria-label="Удалить товар"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Primary Action: Edit */}
                  <button
                    onClick={() => handleOpenEditProduct(prod)}
                    className="h-8 px-3.5 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
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
        <ModalPortal><div className="admin-no-glow fixed inset-0 z-[70] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div ref={productFormDialog.ref} {...productFormDialog.props} className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-4 sm:p-6 max-w-4xl w-full space-y-4 text-[#2D3A4E] border border-white/80 max-h-[92vh] overflow-y-auto my-auto">
            {/* Header: title on the left, status and close on the right (status wraps under the title on phones) */}
            <div className="flex flex-wrap items-start justify-between pb-3 border-b border-[#BAC5D5]/50 gap-x-3 gap-y-2.5">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 id={productFormDialog.titleId} className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-[#2D3A4E]">
                      {editingProduct ? 'Редактирование товара' : 'Новый товар каталога'}
                    </h3>
                    {editingProduct && (
                      <span className="neu-inset px-2 py-0.5 rounded-lg text-[11px] font-mono font-extrabold text-accent">
                        {editingProduct.id}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4E5C70] font-medium mt-0.5 leading-snug">
                    Параметры, цены, себестоимость и остатки SKU
                  </p>
                </div>
              </div>

              {/* Close: always in the top-right corner */}
              <button
                type="button"
                onClick={productFormGuard.requestClose}
                className="order-2 sm:order-3 w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer shrink-0"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Status switch: a raised track with the selected option pressed in */}
              <div
                className="order-3 sm:order-2 w-full sm:w-auto grid grid-cols-2 neu-flat-sm p-1 rounded-xl gap-1 shrink-0"
                role="group"
                aria-label="Статус товара"
              >
                <button
                  type="button"
                  onClick={() => setFormInStock(true)}
                  aria-pressed={formInStock}
                  className={`h-8 px-3 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                    formInStock ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  <span className={formInStock ? 'text-success' : ''}>В продаже</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormInStock(false)}
                  aria-pressed={!formInStock}
                  className={`h-8 px-3 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                    !formInStock ? 'neu-pill-active' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  <span className={!formInStock ? 'text-danger' : ''}>Снят с витрины</span>
                </button>
              </div>
            </div>

            {/* Card structure: every section of the customer's card, right under the status switch */}
            <AdminProductCardStructure
              value={formCard}
              onChange={setFormCard}
              hasDescription={Boolean(formDescription.trim())}
              onShowToast={onShowToast}
            />

            {/* SKU Uniqueness & Integrity Banner */}
            {skuConflictInfo.hasConflicts ? (
              <div className="neu-inset rounded-2xl p-3 border border-danger/25 text-danger text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-extrabold">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span>Повторяются артикулы или штрихкоды</span>
                </div>
                <div className="text-[11px] text-danger space-y-0.5 pl-6">
                  {skuConflictInfo.duplicateCodes.map((d, i) => (
                    <div key={i}>
                      {d.kind === 'sku' ? 'Артикул' : 'Штрихкод'} <strong className="font-mono">{d.code}</strong> уже
                      занят {d.conflictingProduct.startsWith('другой') ? d.conflictingProduct : `товаром «${d.conflictingProduct}»`}
                    </div>
                  ))}
                </div>
              </div>
            ) : null /* no «всё уникально» banner: it showed even for an empty new product */}

            <form onSubmit={handleSaveProduct} onKeyDown={handleFormKeyDown} noValidate className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column: Basic Info, Category, Pricing, Photos, Description */}
                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label htmlFor="product-form-title" className="text-[11px] font-bold text-[#4E5C70] block mb-1">
                      Название товара *
                    </label>
                    <input
                      id="product-form-title"
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="например, Рубашка льняная Slim Fit"
                      className="w-full px-3.5 py-2 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                      required
                    />
                  </div>

                  {/* Marketing Badge Selector - Unified Inset Container */}
                  <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-2.5">
                    <div className="flex items-start justify-between gap-2 pb-1 border-b border-[#BAC5D5]/30">
                      <label className="min-w-0 text-[11px] font-extrabold text-[#2D3A4E] flex items-start gap-1.5 uppercase tracking-wider leading-snug">
                        <Tag className="w-3.5 h-3.5 text-accent shrink-0 mt-px" />
                        <span>Маркетинговый ярлык (Бейдж)</span>
                      </label>
                      {formBadge ? (
                        <button
                          type="button"
                          onClick={() => setFormBadge('')}
                          className="shrink-0 whitespace-nowrap text-[11px] font-bold text-danger hover:text-danger hover:underline cursor-pointer"
                        >
                          Снять ярлык
                        </button>
                      ) : (
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-[#4E5C70]">Опционально</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {PRESET_BADGES.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setFormBadge(formBadge.trim().toUpperCase() === b ? '' : b)}
                          aria-pressed={formBadge.trim().toUpperCase() === b}
                          className={`h-7 px-2.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-all active:scale-95 flex items-center justify-center border ${
                            formBadge.trim().toUpperCase() === b
                              ? 'neu-pill-active border-transparent'
                              : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E] border-white/60'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      aria-label="Свой текст ярлыка"
                      value={formBadge}
                      onChange={(e) => setFormBadge(e.target.value)}
                      placeholder="Или свой текст (например: -30% или ХИТ СЕЗОНА)"
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs font-bold text-accent placeholder:text-[#56647A]"
                    />
                  </div>

                  {/* Category (the fabric is set in «Структура карточки» → «Состав ткани») */}
                  <div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1 min-h-5">
                        <label htmlFor="product-form-category" className="text-[11px] font-bold text-[#4E5C70]">
                          Категория *
                        </label>
                        {!categoryIsListed && formCategory && (
                          <span className="text-[11px] font-bold text-warning whitespace-nowrap">Нет в «Категориях»</span>
                        )}
                      </div>
                      <NeumorphicSelect
                        id="product-form-category"
                        ariaLabel="Категория"
                        value={formCategory}
                        onChange={(val) => setFormCategory(val)}
                        options={formCategoryOptions}
                        placeholder={categories.length === 0 ? 'Категории не настроены' : 'Выберите категорию'}
                        emptyText="Категории не настроены: добавьте их в разделе «Категории»"
                        triggerClassName="h-10 px-3 rounded-xl"
                        variant="inset"
                      />
                    </div>

                  </div>

                  {/* Description Section - directly below Category */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1 min-h-5">
                      <label htmlFor="product-form-description" className="text-[11px] font-bold text-[#4E5C70]">
                        Описание товара
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTextEditModal({
                            isOpen: true,
                            category: formCategory,
                            title: 'Описание товара',
                            subtitle: 'Подробное описание фасона, преимуществ, кроя и ухода',
                            value: formDescription,
                          })
                        }
                        className="shrink-0 min-h-6 text-[11px] font-bold text-accent hover:text-accent-strong flex items-center gap-1 cursor-pointer"
                        title="Открыть окно редактирования описания"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Развернуть редактор</span>
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        id="product-form-description"
                        rows={2}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Краткое описание преимуществ ткани и кроя..."
                        className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] resize-y leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Pricing Matrix: Price, CostPrice & OldPrice */}
                  <div className="p-3 neu-inset rounded-2xl space-y-2.5 border border-white/60">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-[#2D3A4E] flex-wrap gap-1">
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-accent" />
                        Ценообразование и маржинальность
                      </span>
                      {formPrice > 0 && formCostPrice !== undefined && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-extrabold border ${
                            formPrice >= formCostPrice
                              ? 'bg-success-soft text-success border-success/25'
                              : 'bg-danger-soft text-danger border-danger/25'
                          }`}
                        >
                          Маржа: {Math.round(((formPrice - formCostPrice) / formPrice) * 100)}% (
                          {formPrice >= formCostPrice ? '+' : '−'}
                          {Math.abs(formPrice - formCostPrice).toLocaleString('ru-RU')} ₽)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="min-w-0">
                        <label htmlFor="product-form-price" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                          Цена, ₽ *
                        </label>
                        <input
                          id="product-form-price"
                          type="number"
                          value={formPrice || ''}
                          onChange={(e) => setFormPrice(Number(e.target.value))}
                          placeholder="напр. 2 990"
                          min="1"
                          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-extrabold text-accent"
                          required
                        />
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="product-form-cost" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight" title="Себестоимость закупки">
                          Закупка, ₽
                        </label>
                        <input
                          id="product-form-cost"
                          type="number"
                          value={formCostPrice ?? ''}
                          onChange={(e) =>
                            setFormCostPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="напр. 1 400"
                          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                        />
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="product-form-old-price" className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                          Старая цена, ₽
                        </label>
                        <input
                          id="product-form-old-price"
                          type="number"
                          value={formOldPrice ?? ''}
                          onChange={(e) =>
                            setFormOldPrice(e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="если есть"
                          className={`w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#4E5C70] placeholder:text-[#56647A] ${
                            formOldPrice ? 'line-through' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multi-Photo Gallery Manager */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md neu-inset flex items-center justify-center text-accent">
                          <ImageIcon className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-extrabold text-[#2D3A4E]">Галерея фото</span>
                        <span className="text-[11px] font-extrabold px-1.5 py-0.2 rounded-md neu-inset text-accent">
                          {formImages.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[#4E5C70]">Первое фото — обложка</span>
                        {formImages.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearAllImages}
                            className="h-6 px-2.5 rounded-lg neu-button-danger text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
                            title="Удалить все фото"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Очистить все</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Photos live inside the product document (up to 1 MiB): show how much space is left */}
                    {formImages.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-[#4E5C70]">Место под фото и описание</span>
                          <span className={formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES ? 'text-danger' : formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES * 0.8 ? 'text-warning' : 'text-[#2D3A4E]'}>
                            {formatMegabytes(formSizeBytes)} из {formatMegabytes(PRODUCT_SIZE_BUDGET_BYTES)}
                          </span>
                        </div>
                        <div
                          className="h-1.5 rounded-full neu-inset overflow-hidden"
                          role="meter"
                          aria-label="Место под фото и описание"
                          aria-valuemin={0}
                          aria-valuemax={PRODUCT_SIZE_BUDGET_BYTES}
                          aria-valuenow={Math.min(formSizeBytes, PRODUCT_SIZE_BUDGET_BYTES)}
                        >
                          <div
                            className={`h-full rounded-full ${formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES ? 'bg-danger' : formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES * 0.8 ? 'bg-warning' : 'bg-accent'}`}
                            style={{ width: `${Math.min(100, (formSizeBytes / PRODUCT_SIZE_BUDGET_BYTES) * 100)}%` }}
                          />
                        </div>
                        {formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES && (
                          <p className="text-xs font-bold text-danger">Не поместится в базу: уберите часть фото.</p>
                        )}
                      </div>
                    )}

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
                          ? 'border-2 border-dashed border-accent bg-accent/5'
                          : 'border border-white/60 bg-[#E3E8EF]'
                      }`}
                    >
                      {/* Top Action Bar: Upload from Device + Loading state */}
                      <button
                        type="button"
                        onClick={() => galleryFileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="w-full py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-accent" />
                            <span>Обработка изображений...</span>
                          </>
                        ) : (
                          <>
                            <ImagePlus className="w-4 h-4 text-accent" />
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
                          <p className="text-xs text-[#4E5C70]">
                            Добавьте хотя бы одно фото — без него товар не сохранить
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                          {formImages.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className={`relative rounded-xl overflow-hidden neu-flat border-2 group transition-all aspect-[3/4] flex flex-col justify-between ${
                                idx === 0 ? 'border-accent' : 'border-white/80'
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
                                <div className="absolute top-1.5 left-1.5 bg-accent text-white text-[11px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm">
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
                                      className="text-[11px] font-extrabold bg-accent hover:bg-accent text-white px-1.5 py-0.5 rounded cursor-pointer"
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
                      <div data-enter-adds className="flex gap-1.5 pt-1">
                        <input
                          type="url"
                          aria-label="Ссылка на фото"
                          value={newImageUrlInput}
                          onChange={(e) => setNewImageUrlInput(e.target.value)}
                          placeholder="Ссылка на фото (https://…)"
                          className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            // the photo appears in the gallery above: no toast
                            if (newImageUrlInput.trim()) {
                              setFormImages([...formImages, newImageUrlInput.trim()]);
                              setNewImageUrlInput('');
                              setPhotoError(null);
                            }
                          }}
                          disabled={!newImageUrlInput.trim()}
                          className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 whitespace-nowrap"
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
                  <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
                      <label className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
                        <Palette className="w-3.5 h-3.5 text-accent" />
                        <span>Цвета товара ({formColors.length})</span>
                      </label>
                      <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 цвет</span>
                    </div>

                    {/* Active Colors Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {formColors.map((c) => (
                        <div
                          key={c.name}
                          className="neu-flat-sm px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-bold text-[#2D3A4E] border border-white/60"
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
                              className="-my-1 -mr-1.5 ml-0.5 w-6 h-6 inline-flex items-center justify-center rounded-lg text-[#4E5C70] hover:text-danger cursor-pointer"
                              title={`Удалить цвет «${c.name}»`}
                              aria-label={`Удалить цвет «${c.name}»`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add Custom Color */}
                    <div className="flex flex-col gap-2.5">
                      <div data-enter-adds className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_auto] gap-2">
                        <input
                          type="text"
                          value={customColorName}
                          onChange={(e) => handleCustomColorNameChange(e.target.value)}
                          placeholder="Новый цвет, напр. Хаки"
                          aria-label="Название нового цвета"
                          className="col-span-2 sm:col-span-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
                        />
                        <div className="relative min-w-0">
                          <input
                            type="text"
                            value={customColorHex}
                            onChange={(e) => {
                              setCustomColorHex(e.target.value);
                              setCustomColorHexChosen(true);
                            }}
                            // the field shows the code it read: « 1e2b37 », «rgb(30, 43, 55)» → «#1E2B37»
                            onBlur={() => {
                              const code = readColorCode(customColorHex, { bare: true });
                              if (code) setCustomColorHex(code);
                            }}
                            placeholder="#HEX"
                            maxLength={40}
                            className="w-full h-9 pl-8 pr-2 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase font-mono"
                            aria-label="Код цвета: HEX или rgb"
                            aria-invalid={customColorHexUnreadable || undefined}
                            aria-describedby={customColorHexUnreadable ? 'product-color-code-error' : undefined}
                          />
                          <div
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-black/15 shadow-inner"
                            style={{ backgroundColor: pendingColorHex ?? 'transparent' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCustomColor}
                          disabled={!pendingColor.name.trim() || !pendingColorHex}
                          className="h-9 px-3 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                        >
                          + Цвет
                        </button>
                      </div>
                      {customColorHexUnreadable && (
                        <p id="product-color-code-error" className="text-xs font-semibold text-danger">
                          Код цвета не читается. Подойдёт HEX (#1E2B37 или 1E2B37) или rgb(30, 43, 55) — либо выберите
                          оттенок ниже.
                        </p>
                      )}

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
                            onClick={() => {
                              setCustomColorHex(hex);
                              setCustomColorHexChosen(true);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center p-1 transition-all cursor-pointer ${
                              pendingColorHex === hex ? 'neu-pill-active' : 'neu-button'
                            }`}
                            title={hex}
                            aria-label={`Цвет ${hex}`}
                            aria-pressed={pendingColorHex === hex}
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
                  <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
                      <label className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
                        <Ruler className="w-3.5 h-3.5 text-accent" />
                        <span>Размеры товара ({formSizes.length})</span>
                      </label>
                      <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 размер</span>
                    </div>

                    {/* Active Sizes */}
                    <div className="flex flex-wrap gap-1.5">
                      {formSizes.map((s) => (
                        <div
                          key={s}
                          className="neu-flat-sm px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-extrabold text-accent border border-white/60"
                        >
                          <span>{s}</span>
                          {formSizes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSize(s)}
                              className="-my-1 -mr-1.5 ml-0.5 w-6 h-6 inline-flex items-center justify-center rounded-lg text-[#4E5C70] hover:text-danger cursor-pointer"
                              title={`Удалить размер ${s}`}
                              aria-label={`Удалить размер ${s}`}
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
                            className={`h-6 min-w-6 px-2 rounded-lg text-[11px] font-extrabold transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
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
                    <div data-enter-adds className="flex items-center gap-2 pt-0.5">
                      <input
                        type="text"
                        aria-label="Свой размер"
                        value={customSizeInput}
                        onChange={(e) => setCustomSizeInput(e.target.value)}
                        placeholder="Свой размер, напр. 56"
                        className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase placeholder:normal-case placeholder:text-[#56647A]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomSize}
                        disabled={!customSizeInput.trim()}
                        className="h-9 px-3 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        + Размер
                      </button>
                    </div>
                  </div>

                  {/* SKU Stock Matrix */}
                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-x-2 gap-y-1.5">
                      <label className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-accent" />
                        <span>Остатки SKU ({formSkus.length})</span>
                      </label>

                      {/* Bulk Adjustments */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleResetAllSkuStock}
                          className="h-7 px-2.5 rounded-lg neu-button text-[11px] font-bold text-danger transition-all cursor-pointer whitespace-nowrap"
                          title="Обнулить остатки всех вариаций"
                        >
                          Обнулить
                        </button>
                        <button
                          type="button"
                          onClick={handleRegenerateMissingCodes}
                          className="h-7 px-2.5 rounded-lg neu-button text-[11px] font-bold text-[#4E5C70] hover:text-accent transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          title="Заполнить пропущенные артикулы и штрихкоды"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Коды</span>
                        </button>
                      </div>
                    </div>

                    <div className="neu-inset rounded-2xl p-2 max-h-72 overflow-y-auto space-y-2 text-xs">
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
                              className="flex flex-wrap items-center justify-between py-2 px-2.5 neu-flat rounded-xl gap-x-2 gap-y-2 border border-white/40"
                            >
                              <div className="min-w-0 flex-1 basis-full sm:basis-0 flex items-start gap-2">
                                <span
                                  className="w-3 h-3 mt-0.5 rounded-full border border-black/15 shrink-0"
                                  style={{ backgroundColor: matchingColor?.hex || '#94A3B8' }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-extrabold text-[#2D3A4E] text-xs truncate">
                                      {sku.color}
                                    </span>
                                    <span className="font-extrabold text-accent text-xs whitespace-nowrap shrink-0">
                                      {sku.size}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#4E5C70] font-mono">
                                    <span className="whitespace-nowrap">{sku.skuCode}</span>
                                    {sku.barcode && <span className="whitespace-nowrap">{sku.barcode}</span>}
                                  </div>
                                </div>
                              </div>

                              {/* Stepper controls */}
                              <div className="flex items-center gap-1 shrink-0 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormSkus((prev) =>
                                      prev.map((it, idx) =>
                                        idx === sIdx ? { ...it, stock: Math.max(0, (it.stock || 0) - 1) } : it
                                      )
                                    );
                                  }}
                                  className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer font-bold text-xs"
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
                                  className="w-12 h-7 text-center neu-inset rounded-lg font-extrabold text-xs text-accent"
                                  aria-label={`Остаток ${sku.color}, ${sku.size}`}
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
                                  className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all cursor-pointer font-bold text-xs"
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
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Остаток</span>
                    <span className="text-xs sm:text-sm font-extrabold text-accent whitespace-nowrap">
                      {totalFormStock} <span className="text-[11px] font-bold">шт.</span>
                    </span>
                  </div>

                  <div className="p-2 sm:p-2.5 neu-inset rounded-xl flex flex-col justify-center text-center">
                    <span className="text-[11px] font-bold text-[#4E5C70] leading-tight mb-0.5">Стоимость</span>
                    <span className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] whitespace-nowrap">
                      {totalFormInventoryValue.toLocaleString('ru-RU')} <span className="text-[11px] font-bold">₽</span>
                    </span>
                  </div>

                </div>

                {/* «В продаже» with zero stock is saved as out of stock: say so before saving */}
                {formInStock && totalFormStock === 0 && formSkus.length > 0 && (
                  <p className="neu-inset rounded-2xl p-3 text-xs font-bold text-warning leading-snug">
                    Остаток 0 шт.: покупатели увидят «Нет в наличии» (если в «Витрине» не включен предзаказ).
                  </p>
                )}

              </div>
              {/* Always in reach (the form is ~2 000 px long): sticks to the bottom of the window */}
              <div className="sticky bottom-0 z-10 neu-flat rounded-2xl p-2.5 space-y-2 w-full">
                {formErrors.length > 0 && (
                  <div
                    ref={formErrorsRef}
                    tabIndex={-1}
                    role="alert"
                    className="bg-danger-soft border border-danger/40 rounded-xl p-2.5 text-xs font-bold text-danger space-y-1"
                  >
                    {formErrors.map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={productFormGuard.requestClose}
                  className="h-11 shrink-0 px-5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="h-11 flex-1 sm:flex-initial min-w-0 px-6 neu-button-accent rounded-xl text-xs font-extrabold text-white whitespace-nowrap cursor-pointer transition-all flex items-center justify-center gap-2 disabled:cursor-wait"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingProduct ? 'Сохранение…' : editingProduct ? 'Сохранить изменения' : 'Создать товар'}</span>
                </button>
                </div>
              </div>
            </form>
          </div>
        </div></ModalPortal>
      )}

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
