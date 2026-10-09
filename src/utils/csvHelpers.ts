import { Product, Order } from '../types';
import { extractColorName, getProductTotalStock } from './inventory';
import { adminStatusLabel } from './orderFlow';
import { colorHexForName, normalizeColorName, readColorCode, splitColorEntry, UNKNOWN_COLOR_HEX } from './colorCode';
import { parseDecimal, readPurchase, type ProductPurchase, type PurchaseCurrency } from './currencyPricing';

/**
 * One CSV cell: quoted with doubled quotes. Text starting with = + - @ would run as a formula in Excel
 * (customer names and addresses come from the storefront), so it gets a leading apostrophe.
 */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Downloads rows as a CSV file with a UTF-8 BOM (Cyrillic opens correctly in Excel) */
export function downloadCSV(filename: string, rows: unknown[][], separator = ','): void {
  const content = rows.map((row) => row.map(csvCell).join(separator)).join('\r\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const PRODUCT_CSV_HEADERS = [
  'ID',
  'Название',
  'Категория',
  'Цена (₽)',
  'Старая цена (₽)',
  'В наличии',
  'Общий остаток (шт)',
  'Размеры',
  'Цвета',
  'Ссылка на изображение',
  'Описание',
  // purchase in a currency (admin audit 09.10, finding 5): «Курсы и наценка» recalculate the price from it
  'Валюта закупки',
  'Закупка',
  'Своя наценка (%)',
];

/** «USD», «$», «доллар» — dollars; «CNY», «¥», «юань», «RMB» — yuan */
function purchaseCurrencyOf(cell: string): PurchaseCurrency | null {
  const t = cell.trim().toLowerCase();
  if (['usd', '$', 'доллар', 'долл', 'дол'].includes(t) || t.startsWith('доллар')) return 'USD';
  if (['cny', 'rmb', '¥', 'юань', 'юани', 'юаней'].includes(t)) return 'CNY';
  return null;
}

/** «₽», «RUB», «нет», «-»: the product is bought in roubles, its purchase in a currency is removed */
const NO_PURCHASE_CELLS = ['₽', 'rub', 'руб', 'рубль', 'рубли', 'нет', '-', '—'];

/**
 * The purchase from the three cells: `undefined` — the cells are empty, the product keeps its own; `null` — remove it;
 * `'invalid'` — not a currency, or not an amount above zero (the row is imported without the purchase).
 */
export function purchaseFromCells(
  currencyCell = '',
  amountCell = '',
  markupCell = ''
): ProductPurchase | null | undefined | 'invalid' {
  const cur = currencyCell.trim();
  if (!cur && !amountCell.trim() && !markupCell.trim()) return undefined;
  if (NO_PURCHASE_CELLS.includes(cur.toLowerCase())) return null;
  const currency = purchaseCurrencyOf(cur);
  const amount = parseDecimal(amountCell);
  const markup = markupCell.trim() === '' ? undefined : parseDecimal(markupCell.replace('%', ''));
  // a markup out of 0…1000 % would be dropped silently and the product priced with the common one
  if (!currency || (markup !== undefined && !(markup >= 0 && markup <= 1000))) return 'invalid';
  return readPurchase({ currency, amount, ...(markup !== undefined ? { markupPercent: markup } : {}) }) ?? 'invalid';
}

/**
 * Export catalog products to CSV (the same columns the import reads)
 */
export function exportProductsToCSV(products: Product[]): void {
  const rows = products.map((p) => [
    p.id,
    p.title || '',
    p.category || '',
    p.price,
    p.originalPrice ?? '',
    p.inStock !== false ? 'Да' : 'Нет',
    getProductTotalStock(p),
    (p.sizes || []).join('; '),
    // «Хаки #556B2F»: the code goes with the name, so a re-imported file keeps the shade
    (p.colors || [])
      .map((c) => {
        const name = extractColorName(c);
        const hex = typeof c === 'object' && c ? readColorCode(String(c.hex ?? ''), { bare: true }) : null;
        return hex ? `${name} ${hex}` : name;
      })
      .join('; '),
    p.images?.[0] || '',
    p.description || '',
    p.purchase?.currency ?? '',
    p.purchase?.amount ?? '',
    p.purchase?.markupPercent ?? '',
  ]);
  downloadCSV(`catalog_${new Date().toISOString().slice(0, 10)}.csv`, [PRODUCT_CSV_HEADERS, ...rows]);
}

/** Splits one CSV line; quotes may hold separators and doubled quotes */
function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') {
      if (inQuotes && line[c + 1] === '"') {
        cur += '"';
        c++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  cells.push(cur.trim());
  // the apostrophe csvCell adds in front of formula-like text
  return cells.map((cell) => (/^'[=+\-@]/.test(cell) ? cell.slice(1) : cell));
}

const listCells = (value: string) =>
  value
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Parse CSV text into partial Products. Only what the file has: a row without a name, a price or a photo
 * is skipped (nothing is invented); an empty sizes or colours cell is left out, so an existing product keeps its own.
 */
export function parseProductsFromCSV(
  csvText: string,
  /** the catalog: a colour of an existing product written without a code keeps its shade */
  catalog: Pick<Product, 'id' | 'colors'>[] = []
): { products: Partial<Product>[]; skipped: number; badPurchase: number } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { products: [], skipped: 0, badPurchase: 0 };
  // files saved by Excel in the Russian locale use «;»
  const separator = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  const products: Partial<Product>[] = [];
  let skipped = 0;
  let badPurchase = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, separator);
    const [id, title, category, priceCell, oldPriceCell, inStockCell, , sizesCell, colorsCell, image, description, currencyCell, amountCell, markupCell] = cells;
    const price = Number(String(priceCell ?? '').replace(/\s/g, '').replace(',', '.'));
    // an existing product may come without a photo: its previews live in product_previews (catalog-scale-plan, stage 6),
    // and the export leaves the cell empty
    const known = id ? catalog.find((p) => p.id === id) : undefined;
    if (!title || !(price > 0) || (!image && !known)) {
      skipped++;
      continue;
    }
    const originalPrice = Number(String(oldPriceCell ?? '').replace(/\s/g, '').replace(',', '.'));
    const inStockText = (inStockCell || '').toLowerCase();
    const sizes = listCells(sizesCell || '');
    // «Хаки #556B2F», «Navy (1F2A44)» or just «Хаки»: the code from the file, otherwise the shade the product already
    // has for this colour, otherwise a shade by the name
    const knownColors = known?.colors ?? [];
    const colors = listCells(colorsCell || '').map((cell) => {
      const { name, hex } = splitColorEntry(cell);
      const colorName = name || hex || cell;
      const known = knownColors.find((c) => normalizeColorName(extractColorName(c)) === normalizeColorName(colorName));
      const knownHex = known && typeof known === 'object' ? readColorCode(String(known.hex ?? ''), { bare: true }) : null;
      // the product's own spelling stays: its variations are written with it («Тёмно-синий», not «темно-синий»)
      return {
        name: known ? extractColorName(known) : colorName,
        hex: hex ?? knownHex ?? colorHexForName(colorName) ?? UNKNOWN_COLOR_HEX,
      };
    });
    const purchase = purchaseFromCells(currencyCell, amountCell, markupCell);
    if (purchase === 'invalid') badPurchase++;
    products.push({
      ...(id ? { id } : {}),
      title,
      category: category || '',
      price,
      ...(originalPrice > price ? { originalPrice } : {}),
      inStock: inStockText !== 'нет' && inStockText !== 'false',
      // an empty cell leaves the sizes and colours of an existing product as they are
      ...(sizes.length ? { sizes } : {}),
      ...(colors.length ? { colors } : {}),
      ...(image ? { images: [image] } : {}),
      description: description || '',
      // empty cells keep the product's purchase; «₽» removes it (the key with undefined replaces the old one)
      ...(purchase === null ? { purchase: undefined } : purchase && purchase !== 'invalid' ? { purchase } : {}),
    });
  }
  return { products, skipped, badPurchase };
}

/**
 * Export orders to CSV
 */
export function exportOrdersToCSV(orders: Order[]): void {
  const headers = [
    'Номер заказа',
    'Дата',
    'Статус',
    'Сумма (₽)',
    'Покупатель (ФИО)',
    'Фамилия',
    'Имя',
    'Отчество',
    'Телефон',
    'E-mail',
    'Способ доставки',
    'Адрес доставки',
    'Способ оплаты',
    'Трек-номер',
    'Количество позиций',
    'Состав заказа',
  ];
  const rows = orders.map((ord) => [
    ord.id,
    ord.date,
    ord.isCancelled ? 'Отменен' : adminStatusLabel(ord),
    ord.totalPrice,
    ord.customerName || '',
    ord.customerLastName || '',
    ord.customerFirstName || '',
    ord.customerMiddleName || '',
    ord.customerPhone || '',
    ord.customerEmail || '',
    ord.deliveryMethod || '',
    ord.deliveryAddress || '',
    ord.paymentMethod || '',
    ord.trackingNumber || '',
    (ord.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0),
    (ord.items || [])
      .map((it) => `${it.product?.title || 'Товар'} (${[it.selectedColor, it.selectedSize].filter(Boolean).join(', ')}) x${it.quantity}`)
      .join('; '),
  ]);
  downloadCSV(`orders_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
}
