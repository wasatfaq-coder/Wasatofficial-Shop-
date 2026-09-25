import { Product, ProductSKU, CartItem, StockMovementLog, StorefrontSettings } from '../types';

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
  returnPeriodDays: 14,
  freeDeliveryThreshold: 5000,
  courierDeliveryPrice: 350,
  pickupDeliveryPrice: 0,
  postDeliveryPrice: 350,
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
 * Generate a simulated EAN-13 Barcode for a SKU
 */
export function generateBarcode(product: Partial<Product> & { id: string }, color: unknown, size: unknown): string {
  let hash = 0;
  const colorStr = extractColorName(color);
  const sizeStr = extractSizeName(size);
  const str = `${product.id || 'P'}-${colorStr}-${sizeStr}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const part = String(positive).padStart(9, '0').slice(0, 9);
  return `4607${part}`;
}

/**
 * Generate full SKU array for a product from its colors and sizes if not already present
 */
export function generateDefaultSKUs(product: Partial<Product> & { id: string }): ProductSKU[] {
  const skus: ProductSKU[] = [];
  const colors = product.colors && product.colors.length > 0 ? product.colors : [{ name: 'Основной', hex: '#2D3A4E' }];
  const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ['M', 'L'];

  colors.forEach((color, cIdx) => {
    const colorName = extractColorName(color);
    sizes.forEach((size, sIdx) => {
      const sizeName = extractSizeName(size);
      // Deterministic realistic stock based on indices
      // Some SKUs will have 0 (out of stock), some 1-2 (low stock), some 3-8 (in stock)
      let stock = 4;
      const combinedIdx = (cIdx * 3 + sIdx * 2 + (product.id ? String(product.id).length : 0)) % 7;
      if (combinedIdx === 0) {
        stock = 0; // Out of stock example (e.g. М Черный - 0 шт)
      } else if (combinedIdx === 1 || combinedIdx === 4) {
        stock = (sIdx % 2 === 0) ? 1 : 2; // Low stock (e.g. L Синий - 2 шт)
      } else if (combinedIdx === 2) {
        stock = 3;
      } else {
        stock = 4 + (sIdx % 3);
      }

      skus.push({
        id: `${product.id || 'P'}-${colorName}-${sizeName}`,
        color: colorName,
        size: sizeName,
        stock,
        skuCode: generateSkuCode(product, colorName, sizeName),
        barcode: generateBarcode(product, colorName, sizeName),
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
export const PREORDER_MAX_QTY = 10;

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
  const stock = getVariantStock(product, colorName, sizeName);
  if (stock > 0) return stock;
  return preorderMode ? PREORDER_MAX_QTY : 0;
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
  if (!product.skus || product.skus.length === 0) {
    return product.inStock ? 5 : 0;
  }
  const sku = getProductSKU(product, colorName, sizeName);
  return sku ? Math.max(0, sku.stock) : 0;
}

/**
 * Get total stock units across all sizes and colors for a product
 */
export function getProductTotalStock(product: Product): number {
  if (!product) return 0;
  if (!product.skus || product.skus.length === 0) {
    return product.inStock ? 10 : 0;
  }
  return product.skus.reduce((total, sku) => total + Math.max(0, sku.stock), 0);
}

/**
 * Check if product is in stock (any size/color available)
 */
export function isProductInStock(product: Product): boolean {
  if (!product) return false;
  if (!product.skus || product.skus.length === 0) {
    return product.inStock !== false;
  }
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
      barcode: generateBarcode(product, colorStr, sizeStr),
    });
  }

  const totalStock = updatedSkus.reduce((acc, s) => acc + s.stock, 0);

  return {
    ...product,
    skus: updatedSkus,
    inStock: totalStock > 0,
  };
}

const STOCK_LOGS_STORAGE_KEY = 'manstyle_stock_movement_logs';

/**
 * Read saved stock movement logs from localStorage
 */
export function getStockMovementLogs(): StockMovementLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STOCK_LOGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Save stock movement logs to localStorage and dispatch custom event for instant sync
 */
export function saveStockMovementLogs(logs: StockMovementLog[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STOCK_LOGS_STORAGE_KEY, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent('manstyle_stock_logs_updated', { detail: logs }));
  } catch (e) {
    // storage limit error handling
  }
}

/**
 * Append one or more logs to history
 */
function recordStockMovementLogs(newLogs: StockMovementLog | StockMovementLog[]): void {
  const current = getStockMovementLogs();
  const toAdd = Array.isArray(newLogs) ? newLogs : [newLogs];
  const merged = [...toAdd, ...current].slice(0, 150); // keep recent 150 operations
  saveStockMovementLogs(merged);
}

/**
 * Common internal engine for modifying SKU stock and creating audit movement logs
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
  const nowStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const updatedProducts = products.map((prod) => {
    // Preorder lines were never taken from stock, so they are neither deducted nor returned
    const relevantItems = items.filter((it) => it.product.id === prod.id && !it.isPreorder);
    if (relevantItems.length === 0) return prod;

    const currentSkus = prod.skus && prod.skus.length > 0 ? prod.skus : generateDefaultSKUs(prod);

    const updatedSkus = currentSkus.map((sku) => {
      const matched = relevantItems.find(
        (it) =>
          extractColorName(it.selectedColor).trim().toLowerCase() === extractColorName(sku.color).trim().toLowerCase() &&
          extractSizeName(it.selectedSize).trim().toLowerCase() === extractSizeName(sku.size).trim().toLowerCase()
      );

      if (matched) {
        const oldStock = sku.stock;
        const newStock = mode === 'deduct'
          ? Math.max(0, sku.stock - matched.quantity)
          : oldStock + matched.quantity;
        const diff = newStock - oldStock;

        generatedLogs.push({
          id: `log-${mode === 'deduct' ? 'ord' : 'ret'}-${Date.now()}-${sku.id || sku.skuCode}-${Math.random().toString(36).substr(2, 4)}`,
          date: `Сегодня, ${nowStr}`,
          type: mode === 'deduct' ? 'order' : 'return',
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
      inStock: totalStock > 0,
    };
  });

  if (generatedLogs.length > 0) {
    recordStockMovementLogs(generatedLogs);
  }

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
