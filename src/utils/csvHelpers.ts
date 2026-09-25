import { Product, Order } from '../types';
import { extractColorName, extractSizeName, getProductTotalStock } from './inventory';
import { ORDER_STATUS_LABELS } from './deliveryStages';

/**
 * Downloads a text content as a file with UTF-8 BOM for full Russian/Cyrillic support in MS Excel
 */
function downloadCSV(filename: string, content: string): void {
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

/**
 * Export catalog products to CSV
 */
export function exportProductsToCSV(products: Product[]): void {
  const headers = [
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

  const rows = products.map((p) => {
    const totalStock = getProductTotalStock(p);
    const sizes = (p.sizes || []).join('; ');
    const colors = (p.colors || []).map((c) => extractColorName(c)).join('; ');
    const description = (p.description || '').replace(/"/g, '""');
    const title = (p.title || '').replace(/"/g, '""');

    return [
      `"${p.id}"`,
      `"${title}"`,
      `"${p.category || 'linen'}"`,
      p.price,
      p.originalPrice || '',
      p.inStock !== false ? 'Да' : 'Нет',
      totalStock,
      `"${sizes}"`,
      `"${colors}"`,
      `"${p.images?.[0] || ''}"`,
      `"${description}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCSV(`manstyle_catalog_${dateStr}.csv`, csvContent);
}

/**
 * Parse CSV text into partial Products
 */
export function parseProductsFromCSV(csvText: string): Partial<Product>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const results: Partial<Product>[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parser supporting quotes
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
      } else if (char === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cells.push(cur.trim());

    if (cells.length >= 4) {
      const title = cells[1] || `Товар #${i}`;
      const category = cells[2] || 'linen';
      const price = parseFloat(cells[3]) || 2990;
      const originalPrice = cells[4] ? parseFloat(cells[4]) : undefined;
      const inStock = cells[5] ? cells[5].toLowerCase() !== 'нет' && cells[5].toLowerCase() !== 'false' : true;
      const sizesStr = cells[7] || 'S; M; L; XL';
      const colorsStr = cells[8] || 'Бежевый; Темно-синий';
      const image = cells[9] || 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80';
      const description = cells[10] || 'Качественная мужская одежда';

      const sizes = sizesStr.split(';').map((s) => s.trim()).filter(Boolean);
      const colorNames = colorsStr.split(';').map((c) => c.trim()).filter(Boolean);
      const colors = colorNames.map((c) => ({
        name: c,
        hex: c.toLowerCase().includes('черн') ? '#0F172A' : c.toLowerCase().includes('син') ? '#1E293B' : '#D4C3B3',
      }));

      results.push({
        id: cells[0] && cells[0].startsWith('prod-') ? cells[0] : `prod-import-${Date.now()}-${i}`,
        title,
        category,
        categoryLabel: category === 'shirts' ? 'Рубашки' : category === 'trousers' ? 'Брюки' : category === 'jackets' ? 'Куртки' : 'Лен',
        price,
        originalPrice,
        inStock,
        sizes: sizes.length > 0 ? sizes : ['S', 'M', 'L', 'XL'],
        colors: colors.length > 0 ? colors : [{ name: 'Бежевый', hex: '#D4C3B3' }],
        images: [image],
        description,
        rating: 4.8,
        reviewsCount: 12,
      });
    }
  }

  return results;
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

  const rows = orders.map((ord) => {
    const statusText = ord.isCancelled ? 'Отменен' : ORDER_STATUS_LABELS[ord.status] || ord.status;
    const totalQty = (ord.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
    const itemsSummary = (ord.items || [])
      .map(
        (it) =>
          `${it.product?.title || 'Товар'} (${it.selectedColor}, ${it.selectedSize}) x${it.quantity}`
      )
      .join('; ')
      .replace(/"/g, '""');

    return [
      `"${ord.id}"`,
      `"${ord.date}"`,
      `"${statusText}"`,
      ord.totalPrice,
      `"${ord.deliveryMethod || 'Курьер'}"`,
      `"${(ord.deliveryAddress || '').replace(/"/g, '""')}"`,
      `"${ord.paymentMethod || 'Банковская карта'}"`,
      `"${ord.trackingNumber || ''}"`,
      totalQty,
      `"${itemsSummary}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCSV(`manstyle_orders_${dateStr}.csv`, csvContent);
}
