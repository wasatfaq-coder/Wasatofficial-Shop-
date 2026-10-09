import type { Product, ProductSizeChart, SizeChartColumn } from '../types';
import { suggestValues } from './cardSuggestions';
import { SIZE_CHART_LABEL_MAX, SIZE_CHART_MAX_COLUMNS, SIZE_CHART_VALUE_MAX, filledKeys } from './sizeChart';

/**
 * Editing «Размерной сетки» in the product form: measurements, values, chips and the check on «Сохранить». Apart from
 * `sizeChart.ts`, which the product page reads: this code stays in the admin chunk.
 */

/** Common garment measurements: chips of the form only put one in, nothing is shown to a customer by itself */
export const COMMON_MEASUREMENTS = [
  'Длина изделия',
  'Ширина по груди',
  'Ширина плеч',
  'Длина рукава',
  'Обхват груди',
  'Обхват талии',
  'Обхват бёдер',
  'Длина по внутреннему шву',
];

export const EMPTY_SIZE_CHART: ProductSizeChart = { columns: [], rows: [] };

const sameLabel = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/ё/g, 'е') === b.trim().toLowerCase().replace(/ё/g, 'е');

/** Measurements of the shop's other models first, then the common ones; the ones in the chart are left out */
export function measurementSuggestions(products: Pick<Product, 'sizeChart'>[], chart: ProductSizeChart): string[] {
  const used = products.flatMap((p) => (Array.isArray(p.sizeChart?.columns) ? p.sizeChart.columns.map((c) => String(c?.label ?? '')) : []));
  return suggestValues(used, COMMON_MEASUREMENTS, chart.columns.map((c) => c.label), SIZE_CHART_MAX_COLUMNS);
}

/** A key no column of the chart has: values of rows are stored by it, so renaming a measurement keeps them */
function newColumnKey(columns: SizeChartColumn[]): string {
  const taken = new Set(columns.map((c) => c.key));
  let n = columns.length + 1;
  while (taken.has(`m${n}`)) n++;
  return `m${n}`;
}

/** The chart with one more measurement; the same one again (or past the limit) leaves it as it is */
export function withColumn(chart: ProductSizeChart, label: string): ProductSizeChart {
  const text = label.trim().slice(0, SIZE_CHART_LABEL_MAX);
  if (!text || chart.columns.length >= SIZE_CHART_MAX_COLUMNS || chart.columns.some((c) => sameLabel(c.label, text))) {
    return chart;
  }
  return { ...chart, columns: [...chart.columns, { key: newColumnKey(chart.columns), label: text }] };
}

export function withColumnLabel(chart: ProductSizeChart, key: string, label: string): ProductSizeChart {
  return {
    ...chart,
    columns: chart.columns.map((c) => (c.key === key ? { ...c, label: label.slice(0, SIZE_CHART_LABEL_MAX) } : c)),
  };
}

/** Without the measurement and its values */
export function withoutColumn(chart: ProductSizeChart, key: string): ProductSizeChart {
  return {
    columns: chart.columns.filter((c) => c.key !== key),
    rows: chart.rows.map((row) => {
      const { [key]: _removed, ...values } = row.values;
      return { ...row, values };
    }),
  };
}

export function withValue(chart: ProductSizeChart, size: string, key: string, value: string): ProductSizeChart {
  const text = value.slice(0, SIZE_CHART_VALUE_MAX);
  const exists = chart.rows.some((row) => row.size === size);
  const rows = exists
    ? chart.rows.map((row) => (row.size === size ? { ...row, values: { ...row.values, [key]: text } } : row))
    : [...chart.rows, { size, values: { [key]: text } }];
  return { ...chart, rows };
}

export const sizeChartValue = (chart: ProductSizeChart, size: string, key: string): string =>
  chart.rows.find((row) => row.size === size)?.values[key] ?? '';

/** Problems of the form's chart, for the list over «Сохранить»: a measurement with values but no name, a repeated name */
export function sizeChartErrors(chart: ProductSizeChart, sizes: string[]): string[] {
  const filled = filledKeys(chart, sizes);
  const errors: string[] = [];
  if (chart.columns.some((c) => !c.label.trim() && filled.has(c.key))) {
    errors.push('Назовите замер в «Размерной сетке» или удалите его столбец');
  }
  const labels = chart.columns.map((c) => c.label.trim()).filter(Boolean);
  const repeated = labels.find((label, i) => labels.findIndex((other) => sameLabel(other, label)) !== i);
  if (repeated) errors.push(`Замер «${repeated}» в «Размерной сетке» повторяется: оставьте один`);
  return errors;
}

/** The form's chart from a saved product (empty when there is none); measurements not filled stay for the owner */
export function sizeChartForForm(product: Pick<Product, 'sizeChart'>): ProductSizeChart {
  const raw = product.sizeChart;
  if (!raw || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return EMPTY_SIZE_CHART;
  return {
    columns: raw.columns
      .filter((c) => typeof c?.key === 'string' && c.key)
      .map((c) => ({ key: c.key, label: String(c.label ?? '') })),
    rows: raw.rows
      .filter((r) => typeof r?.size === 'string' && r.values && typeof r.values === 'object')
      .map((r) => ({
        size: r.size,
        values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, String(v ?? '')])),
      })),
  };
}
