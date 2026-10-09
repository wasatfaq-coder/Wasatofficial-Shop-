import React, { useState, useMemo, useRef } from 'react';
import { Product, ProductSKU, StockMovementLog } from '../../../types';
import { deleteProductPhotos, productWithPreviews, saveProductPhotos, saveStockMovements } from '../../../utils/firebaseSync';
import { previewsMoved } from '../../../utils/productPreviews';
import { formatOrderDate } from '../../../shared/orderDate';
import {
  generateDefaultSKUs,
  generateBarcode,
  isHiddenFromSale,
  mergeFormStock,
  stockMovementId,
  withMissingSkus,
} from '../../../utils/inventory';
import { normalizeProductColors } from '../../../utils/colorCode';
import {
  droppedPhotoIds,
  splitProductPhotos,
  storedImagesEstimate,
  unusedPhotoIds,
} from '../../../utils/productPhotos';
import { articleGroupKey, collectBarcodes, unifyArticleBarcodes } from '../../../shared/barcode';
import {
  EMPTY_CARD_STRUCTURE,
  ProductCardStructure,
  cardStructureFromProduct,
  cardStructureToProduct,
} from '../AdminProductCardStructure';
import { categoryIcon } from '../../../utils/categories';
import type { StoreCategory } from '../../../types';
import { useDialogA11y } from '../../../utils/useDialogA11y';
import { useChangedSince, useUnsavedChanges } from '../../../utils/unsavedChanges';
import { docSizeBytes, formatMegabytes, PRODUCT_SIZE_BUDGET_BYTES } from '../../../utils/productSize';
import { useDiscardGuard } from '../../DiscardChangesDialog';
import { parseDecimal as decimal, type ProductPurchase, type PurchaseCurrency } from '../../../utils/currencyPricing';
import { normalizeSizeChart } from '../../../utils/sizeChart';
import { EMPTY_SIZE_CHART, sizeChartErrors, sizeChartForForm } from '../../../utils/sizeChartEditing';
import type { ProductSizeChart } from '../../../types';

import type { AdminProductsTabProps, ProductCategoryOption } from '../AdminProductsTab';
import { SUPPLIER_MAX_LENGTH, SUPPLIER_SKU_MAX_LENGTH, supplierText } from '../../../utils/productCosts';
import { EDITED_PRODUCT_OPEN_BLOCKS, PRODUCT_FORM_BLOCKS, type ProductFormBlockId } from './ProductFormBlock';

type ProductFormOptions = {
  categories: StoreCategory[];
  products: Product[];
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'];
  onShowToast: AdminProductsTabProps['onShowToast'];
  CATEGORY_OPTIONS: ProductCategoryOption[];
};

/**
 * The product form: its fields, the check on «Сохранить», unsaved edits, the article and barcode checks across the
 * catalog, opening a new or an existing product and saving it (photos first, then the product and the stock journal).
 */
export function useProductForm({ categories, products, onUpdateProducts, onShowToast, CATEGORY_OPTIONS }: ProductFormOptions) {
  // Modals
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  /** Problems found on «Сохранить»: listed next to the button instead of a pile of error toasts */
  const [showFormErrors, setShowFormErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const formErrorsRef = useRef<HTMLDivElement>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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
  // The discount «Подставить» keeps, percent: written with the product, so the next «Применить» keeps the same one
  // (rounding up to 10 ₽ would make a percent read from the prices smaller at every press)
  const [formDiscountPercent, setFormDiscountPercent] = useState<number | undefined>(undefined);
  // The price a new product took from the rate: while the price is still that one, a new rate moves it
  const autoPriceRef = useRef<number | null>(null);
  // Purchase in dollars or yuan: «Курсы и наценка» recalculates the price from it (src/utils/currencyPricing.ts)
  const [formPurchaseCurrency, setFormPurchaseCurrency] = useState<PurchaseCurrency | ''>('');
  const [formPurchaseAmount, setFormPurchaseAmount] = useState('');
  const [formPurchaseMarkup, setFormPurchaseMarkup] = useState('');
  // Where the product is bought (stage 11): kept in product_costs with the cost, the customer never sees it
  const [formSupplier, setFormSupplier] = useState('');
  const [formSupplierSku, setFormSupplierSku] = useState('');
  const [formBadge, setFormBadge] = useState<string>('');
  // Open blocks of the form: a new product — all, an existing one — «Основное» and «Цены» (stage 4, variant A)
  const [openFormBlocks, setOpenFormBlocks] = useState<ReadonlySet<ProductFormBlockId>>(new Set());
  const toggleFormBlock = (id: ProductFormBlockId) =>
    setOpenFormBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  // «Размерная сетка»: measurements in cm per size (wholesale plan, stage 14); saved without empty ones
  const [formSizeChart, setFormSizeChart] = useState<ProductSizeChart>(EMPTY_SIZE_CHART);
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
            sizeChart: normalizeSizeChart(formSizeChart, formSizes),
          })
        : 0,
    [isProductFormOpen, formTitle, formDescription, formImages, formColors, formSizes, formSkus, formCard, formSizeChart]
  );

  const formPurchase = (): ProductPurchase | undefined => {
    const amount = decimal(formPurchaseAmount);
    if (!formPurchaseCurrency || !(amount > 0)) return undefined;
    const markup = decimal(formPurchaseMarkup);
    return {
      currency: formPurchaseCurrency,
      amount,
      ...(formPurchaseMarkup.trim() !== '' && markup >= 0 ? { markupPercent: markup } : {}),
    };
  };

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
      formPurchaseCurrency && !(decimal(formPurchaseAmount) > 0) && 'Укажите закупку в валюте больше нуля или выберите «Нет»',
      formPurchaseMarkup.trim() !== '' && !(decimal(formPurchaseMarkup) >= 0 && decimal(formPurchaseMarkup) <= 1000) &&
        'Своя наценка — от 0 до 1000 %; пустое поле — наценка для всех товаров',
      formOldPrice && Number(formOldPrice) <= numPrice &&
        'Старая цена должна быть больше текущей — иначе скидки нет. Очистите поле или исправьте цену',
      fibers.length > 0 && fiberTotal !== 100 &&
        `Сумма состава ткани — ${fiberTotal}%, а должна быть 100% («Структура карточки»)`,
      ...sizeChartErrors(formSizeChart, formSizes),
      formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES &&
        `Товар занимает ${formatMegabytes(formSizeBytes)} из ${formatMegabytes(PRODUCT_SIZE_BUDGET_BYTES)}: база его не примет. Уберите часть фото`,
    ].filter((m): m is string => Boolean(m));

  }, [formTitle, formCategory, formPrice, formColors, formSizes, formImages, formOldPrice, formCard, formSizeChart, formSizeBytes, formPurchaseCurrency, formPurchaseAmount, formPurchaseMarkup]);
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
    formPurchaseCurrency,
    formPurchaseAmount,
    formPurchaseMarkup,
    formSupplier,
    formSupplierSku,
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
    formSizeChart,
    customSizeInput,
    customColorName,
  ]);
  useUnsavedChanges(isProductFormDirty, 'Форма товара');
  const productFormGuard = useDiscardGuard(isProductFormDirty, () => setIsProductFormOpen(false));
  const productFormDialog = useDialogA11y(isProductFormOpen, productFormGuard.requestClose);

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

  // Open Form
  const handleOpenAddProduct = () => {
    // A new product starts empty: no made-up price, photo, texts, colors, sizes or stock
    setEditingProduct(null);
    setFormTitle('');
    setFormCategory('');
    setFormPrice(0);
    setFormCostPrice(undefined);
    setFormPurchaseCurrency('');
    setFormPurchaseAmount('');
    setFormPurchaseMarkup('');
    setFormSupplier('');
    setFormSupplierSku('');
    setFormOldPrice(undefined);
    setFormDiscountPercent(undefined);
    autoPriceRef.current = null;
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
    setFormSizeChart(EMPTY_SIZE_CHART);
    setShowFormErrors(false);
    setPhotoError(null);
    setSaveError(null);
    setOpenFormBlocks(new Set(PRODUCT_FORM_BLOCKS));
    setIsProductFormOpen(true);
  };

  // the form edits the previews: a product keeps them in product_previews (docs/catalog-scale-plan.md, stage 6) and is
  // opened once they are read — a save without them would lose the photos that were not read
  const handleOpenEditProduct = (product: Product) => {
    if (!previewsMoved(product)) return openEditProduct(product);
    void productWithPreviews(product).then((prod) => {
      if (previewsMoved(prod)) {
        onShowToast(`Фото товара «${product.title}» не загрузились. Проверьте соединение и откройте товар ещё раз`, 'error');
        return;
      }
      openEditProduct(prod);
    });
  };

  const openEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormTitle(prod.title);
    // a product without a category does not get the first one silently: «Выберите категорию» on save
    setFormCategory(prod.category || '');
    setFormPrice(prod.price);
    setFormCostPrice(prod.costPrice);
    setFormPurchaseCurrency(prod.purchase?.currency ?? '');
    setFormPurchaseAmount(prod.purchase ? String(prod.purchase.amount).replace('.', ',') : '');
    setFormPurchaseMarkup(prod.purchase?.markupPercent !== undefined ? String(prod.purchase.markupPercent).replace('.', ',') : '');
    setFormSupplier(prod.supplier ?? '');
    setFormSupplierSku(prod.supplierSku ?? '');
    setFormOldPrice(prod.originalPrice);
    setFormDiscountPercent(prod.discountPercent);
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
    setFormSizeChart(sizeChartForForm(prod));
    setShowFormErrors(false);
    setPhotoError(null);
    setSaveError(null);
    setOpenFormBlocks(new Set(EDITED_PRODUCT_OPEN_BLOCKS));
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
      // every field the list names is on the screen: a closed block would hide it
      setOpenFormBlocks(new Set(PRODUCT_FORM_BLOCKS));
      requestAnimationFrame(() => formErrorsRef.current?.focus());
      return;
    }

    // A category missing from Admin → «Категории» keeps the product's current name
    const catObj = CATEGORY_OPTIONS.find((c) => c.id === formCategory);
    const catLabel =
      catObj?.name ||
      (editingProduct?.category === formCategory ? editingProduct.categoryLabel : undefined) ||
      formCategory;
    // an emptied chart clears the field: the product is written whole, without `undefined` keys
    const cardFields = { ...cardStructureToProduct(formCard), sizeChart: normalizeSizeChart(formSizeChart, formSizes) };
    // Full photos go to their own documents, the product keeps previews (stage 6, finding 18). A photo that stayed keeps
    // its document; the photos are written before the product, so the product never points at a missing photo
    const productId = editingProduct?.id ?? `prod-${Date.now()}`;
    const storedProduct = editingProduct ? products.find((p) => p.id === editingProduct.id) ?? editingProduct : undefined;
    const known = new Map<string, string>();
    for (const source of [editingProduct, storedProduct]) {
      (source?.images ?? []).forEach((src, i) => {
        const id = source?.photoIds?.[i];
        if (id && src) known.set(src, id);
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
        purchase: formPurchase(),
        supplier: supplierText(formSupplier, SUPPLIER_MAX_LENGTH),
        supplierSku: supplierText(formSupplierSku, SUPPLIER_SKU_MAX_LENGTH),
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        // no old price — no discount to keep
        discountPercent: formOldPrice && formDiscountPercent ? formDiscountPercent : undefined,
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
      // a copy made before 04.10.2026 shares documents with its original: those stay
      const dropped = unusedPhotoIds(
        droppedPhotoIds(storedProduct, photos.photoIds),
        products.filter((p) => p.id !== editingProduct.id)
      );
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
        purchase: formPurchase(),
        supplier: supplierText(formSupplier, SUPPLIER_MAX_LENGTH),
        supplierSku: supplierText(formSupplierSku, SUPPLIER_SKU_MAX_LENGTH),
        originalPrice: formOldPrice ? Number(formOldPrice) : undefined,
        // no old price — no discount to keep
        discountPercent: formOldPrice && formDiscountPercent ? formDiscountPercent : undefined,
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

  // Form Computed Totals
  const totalFormStock = useMemo(() => {
    return formSkus.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
  }, [formSkus]);

  const totalFormInventoryValue = useMemo(() => {
    return totalFormStock * (Number(formPrice) || 0);
  }, [totalFormStock, formPrice]);

  return {
    isProductFormOpen,
    setIsProductFormOpen,
    showFormErrors,
    setShowFormErrors,
    saveError,
    setSaveError,
    isSavingProduct,
    setIsSavingProduct,
    formErrorsRef,
    editingProduct,
    setEditingProduct,
    formTitle,
    setFormTitle,
    formCategory,
    setFormCategory,
    categoryIsListed,
    formCategoryOptions,
    formPrice,
    setFormPrice,
    formCostPrice,
    setFormCostPrice,
    formPurchaseCurrency,
    setFormPurchaseCurrency,
    formPurchaseAmount,
    setFormPurchaseAmount,
    formPurchaseMarkup,
    setFormPurchaseMarkup,
    formPurchase,
    formSupplier,
    setFormSupplier,
    formSupplierSku,
    setFormSupplierSku,
    formOldPrice,
    setFormOldPrice,
    formDiscountPercent,
    setFormDiscountPercent,
    autoPriceRef,
    formBadge,
    setFormBadge,
    openFormBlocks,
    toggleFormBlock,
    formInStock,
    setFormInStock,
    formImages,
    setFormImages,
    newImageUrlInput,
    setNewImageUrlInput,
    galleryFileInputRef,
    isUploadingImage,
    setIsUploadingImage,
    photoError,
    setPhotoError,
    isDraggingOverGallery,
    setIsDraggingOverGallery,
    previewZoomImage,
    setPreviewZoomImage,
    zoomDialog,
    textEditModal,
    setTextEditModal,
    formDescription,
    setFormDescription,
    formSizes,
    setFormSizes,
    formColors,
    setFormColors,
    formSkus,
    setFormSkus,
    formSkusOpened,
    setFormSkusOpened,
    formCard,
    setFormCard,
    formSizeChart,
    setFormSizeChart,
    formSizeBytes,
    validationErrors,
    formErrors,
    pendingRemoval,
    setPendingRemoval,
    customSizeInput,
    setCustomSizeInput,
    customColorName,
    setCustomColorName,
    customColorHex,
    setCustomColorHex,
    customColorHexChosen,
    setCustomColorHexChosen,
    isProductFormDirty,
    productFormGuard,
    productFormDialog,
    skuConflictInfo,
    takenBarcodes,
    barcodeForColor,
    handleOpenAddProduct,
    handleOpenEditProduct,
    handleFormKeyDown,
    handleSaveProduct,
    finishSave,
    totalFormStock,
    totalFormInventoryValue,
  };
}

export type ProductForm = ReturnType<typeof useProductForm>;
