import type { Product, ProductSizeChart, SizeChartColumn } from '../types';

/**
 * «Размерная сетка» of a model (docs/wholesale-spec.md, stage 5; stage 14 of docs/admin-wholesale-plan.md): the owner
 * types measurements in cm per size, the product page shows them next to the sizes. Only the product's sizes, in their
 * order, and only filled measurements reach the customer: an empty column or a removed size is not shown.
 */

/** Measurements in a chart: wider than that the table no longer fits a phone even with its own scroll */
export const SIZE_CHART_MAX_COLUMNS = 8;
export const SIZE_CHART_LABEL_MAX = 30;
/** «98–102», «72,5»: a value is short, longer text belongs to the description */
export const SIZE_CHART_VALUE_MAX = 12;

/** Measurements with at least one value among the product's sizes */
export const filledKeys = (chart: ProductSizeChart, sizes: string[]) =>
  new Set(
    chart.rows
      .filter((row) => sizes.includes(row.size))
      .flatMap((row) => Object.entries(row.values).filter(([, v]) => String(v ?? '').trim()).map(([k]) => k))
  );

/**
 * The chart as stored and shown: rows of the product's sizes in their order, measurements with a name and at least one
 * value, values trimmed; nothing left — `undefined` (the product page shows no table). Reads a chart from the database
 * defensively: a broken one is not shown rather than breaking the product page.
 */
export function normalizeSizeChart(raw: unknown, sizes: string[] | undefined): ProductSizeChart | undefined {
  if (!raw || typeof raw !== 'object' || !Array.isArray(sizes) || sizes.length === 0) return undefined;
  const { columns: rawColumns, rows: rawRows } = raw as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(rawColumns) || !Array.isArray(rawRows)) return undefined;

  const seenKeys = new Set<string>();
  const named: SizeChartColumn[] = [];
  for (const c of rawColumns.slice(0, SIZE_CHART_MAX_COLUMNS)) {
    const key = typeof c?.key === 'string' ? c.key : '';
    const label = typeof c?.label === 'string' ? c.label.trim().slice(0, SIZE_CHART_LABEL_MAX) : '';
    if (!key || !label || seenKeys.has(key)) continue;
    seenKeys.add(key);
    named.push({ key, label });
  }

  const rowBySize = new Map<string, Record<string, unknown>>();
  for (const r of rawRows) {
    if (typeof r?.size === 'string' && r.values && typeof r.values === 'object' && !rowBySize.has(r.size)) {
      rowBySize.set(r.size, r.values as Record<string, unknown>);
    }
  }
  const rows = [...new Set(sizes)].flatMap((size) => {
    const source = rowBySize.get(size) ?? {};
    const values: Record<string, string> = {};
    for (const { key } of named) {
      const value = source[key];
      const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, SIZE_CHART_VALUE_MAX) : '';
      if (text) values[key] = text;
    }
    return Object.keys(values).length > 0 ? [{ size, values }] : [];
  });
  const filled = filledKeys({ columns: named, rows }, sizes);
  const columns = named.filter((c) => filled.has(c.key));
  if (rows.length === 0 || columns.length === 0) return undefined;
  return { columns, rows };
}

/** The table of the product page; `undefined` — the owner has not filled it */
export const productSizeChart = (product: Pick<Product, 'sizeChart' | 'sizes'>): ProductSizeChart | undefined =>
  normalizeSizeChart(product.sizeChart, product.sizes);
