import { Product, Order } from '../types';
import { extractColorName, getProductTotalStock } from './inventory';
import { ORDER_STATUS_LABELS } from './deliveryStages';

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
];

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
    (p.colors || []).map((c) => extractColorName(c)).join('; '),
    p.images?.[0] || '',
    p.description || '',
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
 * is skipped (nothing is invented), missing sizes and colours stay empty.
 */
export function parseProductsFromCSV(csvText: string): { products: Partial<Product>[]; skipped: number } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { products: [], skipped: 0 };
  // files saved by Excel in the Russian locale use «;»
  const separator = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  const products: Partial<Product>[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, separator);
    const [id, title, category, priceCell, oldPriceCell, inStockCell, , sizesCell, colorsCell, image, description] = cells;
    const price = Number(String(priceCell ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!title || !(price > 0) || !image) {
      skipped++;
      continue;
    }
    const originalPrice = Number(String(oldPriceCell ?? '').replace(/\s/g, '').replace(',', '.'));
    const inStockText = (inStockCell || '').toLowerCase();
    products.push({
      ...(id ? { id } : {}),
      title,
      category: category || '',
      price,
      ...(originalPrice > price ? { originalPrice } : {}),
      inStock: inStockText !== 'нет' && inStockText !== 'false',
      sizes: listCells(sizesCell || ''),
      colors: listCells(colorsCell || '').map((name) => ({
        name,
        hex: name.toLowerCase().includes('черн') ? '#0F172A' : name.toLowerCase().includes('син') ? '#1E293B' : '#D4C3B3',
      })),
      images: [image],
      description: description || '',
    });
  }
  return { products, skipped };
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
    ord.isCancelled ? 'Отменен' : ORDER_STATUS_LABELS[ord.status] || ord.status,
    ord.totalPrice,
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
