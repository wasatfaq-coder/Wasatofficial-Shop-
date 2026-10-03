import { Product, ProductSKU, CartItem, StockMovementLog, StorefrontSettings } from '../types';
import { collectBarcodes, generateInternalEan13 } from '../shared/barcode';
import { formatOrderDate } from '../shared/orderDate';

// Everything a customer reads (texts, contacts, legal details) is empty until the owner fills it
// in Admin → «Витрина»; customer screens hide or mark as «Не настроено» what is not filled in.
// Only numeric policies keep defaults: pricing and delivery rules need a value.
export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  storeName: 'Wasat Shop',
  storeSlogan: '',
  storeBannerText: '',
  isStoreBannerVisible: false,
  bannerBadgeText: '',
  phone: '',
  email: '',
  telegram: '',
  whatsapp: '',
  pickupAddress: '',
  workingHours: '',
  isStoreOnline: true,
  isExpressEnabled: true,
  isPreorderMode: false,
  lowStockThreshold: 3,
  legalEntityName: '',
  inn: '',
  kpp: '',
  ogrn: '',
  bankName: '',
  bik: '',
  checkingAccount: '',
  corrAccount: '',
  legalAddress: '',
  edo: '',
  ceo: '',

  conciergeDescription: '',
  conciergeService1Title: '',
  conciergeService1Desc: '',
  conciergeService2Title: '',
  conciergeService2Desc: '',
  conciergeService3Title: '',
  conciergeService3Desc: '',

  brandPhilosophyTitle: '',
  brandPhilosophyText: '',
  brandMaterialsTitle: '',
  brandMaterialsText: '',
  brandCraftsmanshipTitle: '',
  brandCraftsmanshipText: '',
  brandGuaranteesTitle: '',
  brandGuaranteesList: [],
};

const STOREFRONT_STORAGE_KEY = 'manstyle_storefront_settings';

export function loadStorefrontSettings(): StorefrontSettings {
  try {
    const saved = localStorage.getItem(STOREFRONT_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_STOREFRONT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.warn('Error loading storefront settings:', err);
  }
  return DEFAULT_STOREFRONT_SETTINGS;
}

export function saveStorefrontSettings(settings: StorefrontSettings): void {
  try {
    localStorage.setItem(STOREFRONT_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('manstyle_storefront_settings_updated', { detail: settings }));
  } catch (err) {
    console.warn('Error saving storefront settings:', err);
  }
}

/**
 * Safely extracts string name from color (string, object with name, etc.)
 */
export function extractColorName(color: unknown): string {
  if (!color) return '';
  if (typeof color === 'string') return color;
  if (typeof color === 'object' && color !== null && 'name' in color && typeof (color as { name: unknown }).name === 'string') {
    return (color as { name: string }).name;
  }
  return String(color);
}

/**
 * Safely extracts string size (string or number)
 */
export function extractSizeName(size: unknown): string {
  if (size === undefined || size === null) return '';
  if (typeof size === 'string') return size;
  return String(size);
}

/**
 * Generate a standard SKU Code (e.g. WS-SH01-BEI-L).
 * New products get the WS prefix; codes filled in for existing SKUs keep MS, so they don't change.
 */
export function generateSkuCode(
  product: Partial<Product> & { id: string },
  color: unknown,
  size: unknown,
  prefix: 'WS' | 'MS' = 'MS'
): string {
  const catCode = product.category ? product.category.slice(0, 2).toUpperCase() : 'PR';
  const idNum = (product.id ? String(product.id) : '01').replace(/[^0-9]/g, '').slice(0, 2) || '01';
  const colorStr = extractColorName(color);
  const colorCode = colorStr
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-ZА-Я0-9]/g, 'CLR') || 'DEF';
  const sizeStr = extractSizeName(size) || 'M';
  return `${prefix}-${catCode}${idNum}-${colorCode}-${sizeStr}`.toUpperCase();
}

/**
 * New unique barcode for a SKU: an internal EAN-13 starting with «2» (src/shared/barcode.ts).
 * Pass every barcode already in the catalog; the new one is added to the set.
 */
export function generateBarcode(taken: Set<string> = new Set()): string {
  return generateInternalEan13(taken);
}

/**
 * Generate full SKU array for a product from its colors and sizes if not already present
 */
export function generateDefaultSKUs(product: Partial<Product> & { id: string }): ProductSKU[] {
  const skus: ProductSKU[] = [];
  const colors = product.colors && product.colors.length > 0 ? product.colors : [{ name: 'Основной', hex: '#2D3A4E' }];
  const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ['M', 'L'];

  colors.forEach((color) => {
    const colorName = extractColorName(color);
    sizes.forEach((size) => {
      const sizeName = extractSizeName(size);
      // Stock is unknown until the admin sets it; the barcode is issued when the SKU is saved
      // (label generator → «Выдать новые штрихкоды»), so it does not change on every render
      skus.push({
        id: `${product.id || 'P'}-${colorName}-${sizeName}`,
        color: colorName,
        size: sizeName,
        stock: 0,
        skuCode: generateSkuCode(product, colorName, sizeName),
      });
    });
  });

  return skus;
}

/**
 * Get SKU object for given product, color, and size
 */
export function getProductSKU(
  product: Product,
  colorName?: unknown,
  sizeName?: unknown
): ProductSKU | undefined {
  if (!product || !product.skus || product.skus.length === 0) {
    return undefined;
  }
  const targetColor = extractColorName(colorName) || extractColorName(product.colors?.[0]);
  const targetSize = extractSizeName(sizeName) || extractSizeName(product.sizes?.[0]);

  return product.skus.find(
    (s) =>
      extractColorName(s.color).trim().toLowerCase() === targetColor.trim().toLowerCase() &&
      extractSizeName(s.size).trim().toLowerCase() === targetSize.trim().toLowerCase()
  );
}

/**
 * Get available stock count for given product, color, and size
 */
/** Most units of one out-of-stock variant a customer can preorder at once */
const PREORDER_MAX_QTY = 10;

/**
 * Units a customer can put in the cart: the stock, or — with «Предзаказ» on in Admin → «Витрина»
 * and the variant sold out — up to PREORDER_MAX_QTY as a preorder.
 */
export function getOrderableStock(
  product: Product,
  colorName: unknown,
  sizeName: unknown,
  preorderMode: boolean
): number {
  // «Снят с витрины» in the product form: not for sale even with stock left
  if (isHiddenFromSale(product)) return 0;
  const stock = getVariantStock(product, colorName, sizeName);
  if (stock > 0) return stock;
  return preorderMode ? PREORDER_MAX_QTY : 0;
}

/**
 * inStock is both the admin's «В продаже / Снят с витрины» switch and the «sold out» flag set when stock
 * runs out. With stock still left, false can only mean the admin took the product off sale.
 */
export function isHiddenFromSale(product: Pick<Product, 'inStock' | 'skus'>): boolean {
  return product.inStock === false && (product.skus ?? []).some((s) => s.stock > 0);
}

/** A sold-out variant that can be ordered only as a preorder */
export function isPreorderVariant(product: Product, colorName: unknown, sizeName: unknown, preorderMode: boolean): boolean {
  return preorderMode && getVariantStock(product, colorName, sizeName) <= 0;
}

export function getVariantStock(
  product: Product,
  colorName?: unknown,
  sizeName?: unknown
): number {
  if (!product) return 0;
  // Without variants the stock is unknown — 0, as in placeOrder (audit 02.10, finding 15): a made-up «5» sold goods
  // the store never counted
  if (!product.skus || product.skus.length === 0) return 0;
  const sku = getProductSKU(product, colorName, sizeName);
  return sku ? Math.max(0, sku.stock) : 0;
}

/**
 * Get total stock units across all sizes and colors for a product
 */
export function getProductTotalStock(product: Product): number {
  if (!product) return 0;
  if (!product.skus || product.skus.length === 0) return 0;
  return product.skus.reduce((total, sku) => total + Math.max(0, sku.stock), 0);
}

/**
 * On sale and some size/color available (the storefront's «Только в наличии»)
 */
export function isProductInStock(product: Product): boolean {
  if (!product || product.inStock === false) return false;
  if (!product.skus || product.skus.length === 0) return true;
  return getProductTotalStock(product) > 0;
}

/**
 * Update stock for a single SKU in a product
 */
export function updateProductSkuStock(
  product: Product,
  color: unknown,
  size: unknown,
  newStock: number
): Product {
  const currentSkus = product.skus && product.skus.length > 0 ? product.skus : generateDefaultSKUs(product);
  const safeStock = Math.max(0, Math.floor(newStock));
  const colorStr = extractColorName(color);
  const sizeStr = extractSizeName(size);

  let matched = false;
  const updatedSkus = currentSkus.map((sku) => {
    if (
      extractColorName(sku.color).trim().toLowerCase() === colorStr.trim().toLowerCase() &&
      extractSizeName(sku.size).trim().toLowerCase() === sizeStr.trim().toLowerCase()
    ) {
      matched = true;
      return { ...sku, stock: safeStock };
    }
    return sku;
  });

  if (!matched) {
    updatedSkus.push({
      id: `${product.id}-${colorStr}-${sizeStr}`,
      color: colorStr,
      size: sizeStr,
      stock: safeStock,
      skuCode: generateSkuCode(product, colorStr, sizeStr),
      barcode: generateBarcode(collectBarcodes([{ id: product.id, skus: updatedSkus }])),
    });
  }

  const totalStock = updatedSkus.reduce((acc, s) => acc + s.stock, 0);

  return {
    ...product,
    skus: updatedSkus,
    // «Снят с витрины» (false with stock left) stays off sale (audit 02.10, finding 10)
    inStock: isHiddenFromSale(product) ? false : totalStock > 0,
  };
}

/** The journal used to be kept only in the browser of whoever changed the stock; the admin session moves it to the database */
export const LEGACY_STOCK_LOGS_STORAGE_KEY = 'manstyle_stock_movement_logs';

/** Article code of the ordered variant, for the journal entry of an order line */
export function skuCodeForLine(products: Product[], line: CartItem): string {
  const product = products.find((p) => p.id === line.product.id) ?? line.product;
  const color = extractColorName(line.selectedColor).trim().toLowerCase();
  const size = extractSizeName(line.selectedSize).trim().toLowerCase();
  const sku = (product.skus ?? []).find(
    (s) => extractColorName(s.color).trim().toLowerCase() === color && extractSizeName(s.size).trim().toLowerCase() === size
  );
  return sku?.skuCode || generateSkuCode(product, line.selectedColor, line.selectedSize);
}

/** Id of a new journal entry (the variant id may hold «/», which a document id cannot) */
export function stockMovementId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Common internal engine for modifying SKU stock and creating journal entries.
 * Nothing is written here: the admin screens save `generatedLogs` with `saveStockMovements`.
 */
function applyStockChangeWithLogs(
  products: Product[],
  items: CartItem[],
  mode: 'deduct' | 'return',
  orderId: string,
  reason: string,
  operator: string
): { updatedProducts: Product[]; generatedLogs: StockMovementLog[] } {
  const generatedLogs: StockMovementLog[] = [];
  const now = new Date();

  const updatedProducts = products.map((prod) => {
    // Preorder lines were never taken from stock, so they are neither deducted nor returned
    const relevantItems = items.filter((it) => it.product.id === prod.id && !it.isPreorder);
    if (relevantItems.length === 0) return prod;

    const currentSkus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);

    const updatedSkus = currentSkus.map((sku) => {
      // Several cart lines of the same variant add up
      const matchedQuantity = relevantItems
        .filter(
          (it) =>
            extractColorName(it.selectedColor).trim().toLowerCase() === extractColorName(sku.color).trim().toLowerCase() &&
            extractSizeName(it.selectedSize).trim().toLowerCase() === extractSizeName(sku.size).trim().toLowerCase()
        )
        .reduce((sum, it) => sum + it.quantity, 0);

      if (matchedQuantity > 0) {
        const oldStock = sku.stock;
        const newStock = mode === 'deduct'
          ? Math.max(0, sku.stock - matchedQuantity)
          : oldStock + matchedQuantity;
        const diff = newStock - oldStock;

        generatedLogs.push({
          id: stockMovementId(),
          createdAt: now.toISOString(),
          date: formatOrderDate(now),
          type: mode === 'deduct' ? 'order' : 'return',
          orderId,
          productId: prod.id,
          productTitle: prod.title,
          skuCode: sku.skuCode || generateSkuCode(prod, sku.color, sku.size),
          color: sku.color,
          size: sku.size,
          changeQuantity: diff,
          previousStock: oldStock,
          newStock: newStock,
          reason,
          operator,
        });

        return { ...sku, stock: newStock };
      }
      return sku;
    });

    const totalStock = updatedSkus.reduce((acc, s) => acc + s.stock, 0);

    return {
      ...prod,
      skus: updatedSkus,
      // «Снят с витрины» (false with stock left) stays off sale (audit 02.10, finding 10); otherwise in stock = something is left
      inStock: isHiddenFromSale(prod) ? false : totalStock > 0,
    };
  });

  return { updatedProducts, generatedLogs };
}

/**
 * Automatically deduct SKU stock when order is placed and write structured movement logs
 */
export function deductStockWithLogs(
  products: Product[],
  items: CartItem[],
  orderId: string,
  operator = 'Система оформления'
): { updatedProducts: Product[]; generatedLogs: StockMovementLog[] } {
  return applyStockChangeWithLogs(
    products,
    items,
    'deduct',
    orderId,
    `Автоматическое списание по заказу #${orderId}`,
    operator
  );
}

export interface StockShortage {
  productTitle: string;
  color: string;
  size: string;
  needed: number;
  inStock: number;
}

/**
 * Variants that do not have enough stock for the given lines (preorder lines are not taken from stock).
 * Deducting them anyway would cut the stock to zero and sell what is already gone.
 */
export function stockShortages(products: Product[], items: CartItem[]): StockShortage[] {
  const shortages: StockShortage[] = [];
  const norm = (v: string) => v.trim().toLowerCase();
  for (const prod of products) {
    const lines = items.filter((it) => it.product.id === prod.id && !it.isPreorder);
    if (lines.length === 0) continue;
    const skus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);
    for (const sku of skus) {
      const needed = lines
        .filter(
          (it) =>
            norm(extractColorName(it.selectedColor)) === norm(extractColorName(sku.color)) &&
            norm(extractSizeName(it.selectedSize)) === norm(extractSizeName(sku.size))
        )
        .reduce((sum, it) => sum + it.quantity, 0);
      if (needed > sku.stock) {
        shortages.push({ productTitle: prod.title, color: sku.color, size: sku.size, needed, inStock: sku.stock });
      }
    }
  }
  return shortages;
}

/** A cart line the store cannot sell now: not enough stock, taken off sale or removed from the catalog */
export interface OrderStockProblem {
  productId: string;
  title: string;
  color: string;
  size: string;
  /** In the order (all lines of this variant together) */
  wanted: number;
  /** What can be ordered now (`getOrderableStock`) */
  available: number;
  reason: 'short' | 'hidden' | 'removed';
}

/**
 * Checkout checks the stock before the order is written (audit 02.10, finding 4): the cart stopped a buyer with too
 * many items, the checkout did not — the order went through and the stock silently stopped at 0. The product is taken
 * from the live catalog (`products`); lines of one variant count together.
 */
export function orderStockProblems(items: CartItem[], products: Product[], preorderMode: boolean): OrderStockProblem[] {
  const groups = new Map<string, { item: CartItem; wanted: number }>();
  for (const item of items) {
    const key = [
      item.product.id,
      extractColorName(item.selectedColor).trim().toLowerCase(),
      extractSizeName(item.selectedSize).trim().toLowerCase(),
    ].join('|');
    const group = groups.get(key);
    if (group) group.wanted += item.quantity;
    else groups.set(key, { item, wanted: item.quantity });
  }
  const problems: OrderStockProblem[] = [];
  for (const { item, wanted } of groups.values()) {
    const product = products.find((p) => p.id === item.product.id);
    const base = {
      productId: item.product.id,
      title: product?.title || item.product.title || 'Товар',
      color: extractColorName(item.selectedColor),
      size: extractSizeName(item.selectedSize),
      wanted,
    };
    if (!product) {
      problems.push({ ...base, available: 0, reason: 'removed' });
      continue;
    }
    const available = getOrderableStock(product, item.selectedColor, item.selectedSize, preorderMode);
    if (wanted > available) problems.push({ ...base, available, reason: isHiddenFromSale(product) ? 'hidden' : 'short' });
  }
  return problems;
}

/** One line for the buyer: «Рубашка (Белый, M) — снята с продажи» / «… — в наличии 1 из 3» */
export function stockProblemText(problem: OrderStockProblem): string {
  const variant = [problem.color, problem.size].filter(Boolean).join(', ');
  const name = variant ? `${problem.title} (${variant})` : problem.title;
  if (problem.reason === 'removed') return `${name} — больше нет в каталоге`;
  if (problem.reason === 'hidden') return `${name} — снят с продажи`;
  return problem.available > 0 ? `${name} — в наличии ${problem.available} из ${problem.wanted}` : `${name} — закончился`;
}

/** What the product form saves as the stock of each variant, and what it changed */
export interface FormStockMerge {
  skus: ProductSKU[];
  /** Variants whose stock the admin changed in the form: from the live stock to the form's value */
  changes: { sku: ProductSKU; before: number; after: number }[];
}

const sameVariant = (a: Pick<ProductSKU, 'id' | 'color' | 'size'>, b: Pick<ProductSKU, 'id' | 'color' | 'size'>) =>
  (Boolean(a.id) && a.id === b.id) ||
  (a.color.trim().toLowerCase() === b.color.trim().toLowerCase() && a.size.trim().toLowerCase() === b.size.trim().toLowerCase());

/**
 * The product form keeps a copy of the variants from the moment it opened. A stock the admin did not touch in the form
 * is saved as it is in the database now — otherwise an order placed meanwhile came back as stock (audit 02.10,
 * finding 5: 5 → sold → 0 → «Сохранить» → 5 again). A stock changed in the form is saved as typed and goes to the journal.
 */
export function mergeFormStock(formSkus: ProductSKU[], openedSkus: ProductSKU[], liveSkus: ProductSKU[]): FormStockMerge {
  const changes: FormStockMerge['changes'] = [];
  const skus = formSkus.map((sku) => {
    const opened = openedSkus.find((o) => sameVariant(o, sku));
    const live = liveSkus.find((l) => sameVariant(l, sku));
    const liveStock = live ? Number(live.stock) || 0 : 0;
    const formStock = Math.max(0, Math.floor(Number(sku.stock) || 0));
    if (opened && formStock === (Number(opened.stock) || 0)) return { ...sku, stock: liveStock };
    if (formStock !== liveStock) changes.push({ sku, before: liveStock, after: formStock });
    return { ...sku, stock: formStock };
  });
  return { skus, changes };
}

/**
 * Return SKU stock when order items are cancelled, adjusted, or returned
 */
export function returnStockWithLogs(
  products: Product[],
  items: CartItem[],
  orderId: string,
  reason = 'Возврат товара / Корректировка заказа',
  operator = 'Администратор'
): { updatedProducts: Product[]; generatedLogs: StockMovementLog[] } {
  return applyStockChangeWithLogs(
    products,
    items,
    'return',
    orderId,
    `Возврат остатка по заказу #${orderId} (${reason})`,
    operator
  );
}
