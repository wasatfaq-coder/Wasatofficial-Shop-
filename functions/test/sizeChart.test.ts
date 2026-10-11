// Размерная сетка модели (этап 14 плана опта, этап 5 docs/wholesale-spec.md): покупатель видит только заполненное —
// размеры товара по порядку, замеры с названием и хотя бы одним значением
import { describe, expect, test } from 'bun:test';
import { SIZE_CHART_MAX_COLUMNS, normalizeSizeChart, productSizeChart } from '../../src/utils/sizeChart';
import {
  EMPTY_SIZE_CHART,
  measurementSuggestions,
  sizeChartErrors,
  sizeChartForForm,
  sizeChartValue,
  withColumn,
  withColumnLabel,
  withValue,
  withoutColumn,
} from '../../src/utils/sizeChartEditing';

const filled = () => {
  let chart = withColumn(withColumn(withColumn(EMPTY_SIZE_CHART, 'Длина изделия'), 'Ширина по груди'), 'Длина рукава');
  chart = withValue(chart, 'M', 'm1', '72');
  chart = withValue(chart, 'M', 'm2', '54');
  chart = withValue(chart, 'L', 'm1', '74');
  chart = withValue(chart, 'L', 'm2', '56');
  return chart;
};

describe('normalizeSizeChart', () => {
  test('пустой столбец не показывается, размеры — в порядке товара', () => {
    expect(normalizeSizeChart(filled(), ['S', 'M', 'L'])).toEqual({
      columns: [
        { key: 'm1', label: 'Длина изделия' },
        { key: 'm2', label: 'Ширина по груди' },
      ],
      rows: [
        { size: 'M', values: { m1: '72', m2: '54' } },
        { size: 'L', values: { m1: '74', m2: '56' } },
      ],
    });
  });

  test('размер, которого у товара больше нет, из таблицы уходит', () => {
    const chart = normalizeSizeChart(filled(), ['L']);
    expect(chart?.rows.map((r) => r.size)).toEqual(['L']);
  });

  test('ничего не заполнено — таблицы нет', () => {
    expect(normalizeSizeChart(withColumn(EMPTY_SIZE_CHART, 'Длина'), ['M'])).toBeUndefined();
    expect(normalizeSizeChart(EMPTY_SIZE_CHART, ['M'])).toBeUndefined();
    expect(normalizeSizeChart(filled(), [])).toBeUndefined();
    expect(normalizeSizeChart(undefined, ['M'])).toBeUndefined();
  });

  test('пробелы обрезаются, столбец без названия не показывается', () => {
    let chart = withValue(filled(), 'M', 'm1', '  73 ');
    chart = withColumnLabel(chart, 'm2', '   ');
    expect(normalizeSizeChart(chart, ['M', 'L'])).toEqual({
      columns: [{ key: 'm1', label: 'Длина изделия' }],
      rows: [
        { size: 'M', values: { m1: '73' } },
        { size: 'L', values: { m1: '74' } },
      ],
    });
  });

  test('сломанная сетка из базы не ломает страницу товара', () => {
    expect(normalizeSizeChart({ columns: 'x', rows: [] }, ['M'])).toBeUndefined();
    expect(normalizeSizeChart('сетка', ['M'])).toBeUndefined();
    expect(
      normalizeSizeChart(
        { columns: [null, { key: 'a', label: 'Длина' }, { key: 'a', label: 'Повтор' }], rows: [null, { size: 'M', values: { a: 70 } }] },
        ['M']
      )
    ).toEqual({ columns: [{ key: 'a', label: 'Длина' }], rows: [{ size: 'M', values: { a: '70' } }] });
  });

  test('productSizeChart берёт размеры товара', () => {
    expect(productSizeChart({ sizes: ['M'], sizeChart: filled() })?.rows).toEqual([{ size: 'M', values: { m1: '72', m2: '54' } }]);
    expect(productSizeChart({ sizes: ['M'] })).toBeUndefined();
  });
});

describe('правка сетки в форме', () => {
  test('тот же замер второй раз не добавляется, и не больше предела', () => {
    const chart = withColumn(EMPTY_SIZE_CHART, 'Длина рукава');
    expect(withColumn(chart, ' длина рукава ')).toBe(chart);
    let many = EMPTY_SIZE_CHART;
    for (let i = 0; i < SIZE_CHART_MAX_COLUMNS + 2; i++) many = withColumn(many, `Замер ${i}`);
    expect(many.columns).toHaveLength(SIZE_CHART_MAX_COLUMNS);
  });

  test('ключ нового столбца не совпадает с оставшимися после удаления', () => {
    const chart = withColumn(withoutColumn(filled(), 'm1'), 'Обхват талии');
    expect(new Set(chart.columns.map((c) => c.key)).size).toBe(chart.columns.length);
  });

  test('удаление замера убирает его значения', () => {
    const chart = withoutColumn(filled(), 'm1');
    expect(sizeChartValue(chart, 'M', 'm1')).toBe('');
    expect(sizeChartValue(chart, 'M', 'm2')).toBe('54');
  });

  test('переименование оставляет значения', () => {
    const chart = withColumnLabel(filled(), 'm1', 'Длина по спинке');
    expect(sizeChartValue(chart, 'L', 'm1')).toBe('74');
  });

  test('ошибки: замер без названия со значениями и повтор названия', () => {
    expect(sizeChartErrors(filled(), ['M', 'L'])).toEqual([]);
    expect(sizeChartErrors(withColumnLabel(filled(), 'm1', ''), ['M'])).toHaveLength(1);
    // пустой столбец без названия не мешает: он просто не сохранится
    expect(sizeChartErrors(withColumnLabel(filled(), 'm3', ''), ['M'])).toEqual([]);
    expect(sizeChartErrors(withColumnLabel(filled(), 'm2', 'ДЛИНА ИЗДЕЛИЯ'), ['M'])[0]).toContain('повторяется');
  });

  test('форма открывает сохранённую сетку как есть', () => {
    expect(sizeChartForForm({})).toEqual(EMPTY_SIZE_CHART);
    expect(sizeChartForForm({ sizeChart: filled() })).toEqual(filled());
  });

  test('подсказки: замеры магазина первыми, уже добавленные — нет', () => {
    const chart = withColumn(EMPTY_SIZE_CHART, 'Длина изделия');
    const chips = measurementSuggestions([{ sizeChart: { columns: [{ key: 'm1', label: 'Длина по спинке' }], rows: [] } }], chart);
    expect(chips[0]).toBe('Длина по спинке');
    expect(chips).not.toContain('Длина изделия');
    expect(chips.length).toBeLessThanOrEqual(SIZE_CHART_MAX_COLUMNS);
  });
});
