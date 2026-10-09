import { useState } from 'react';
import { Plus, Ruler, Trash2 } from 'lucide-react';
import { SizeChartTable } from '../../SizeChartTable';
import { SIZE_CHART_LABEL_MAX, SIZE_CHART_MAX_COLUMNS, SIZE_CHART_VALUE_MAX, normalizeSizeChart } from '../../../utils/sizeChart';
import {
  measurementSuggestions,
  sizeChartValue,
  withColumn,
  withColumnLabel,
  withValue,
  withoutColumn,
} from '../../../utils/sizeChartEditing';
import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductForm } from './useProductForm';

/**
 * «Размерная сетка» of the product form (wholesale plan, stage 14): measurements in cm per size of the product — a column
 * per measurement, a row per size — and the table as the customer will see it. Optional: an empty chart is not shown.
 */
export function ProductFormSizeChart({
  form,
  products,
}: {
  form: ProductForm;
  /** The shop's products: their measurements become chips */
  products: AdminProductsTabProps['products'];
}) {
  const { formSizes, formSizeChart, setFormSizeChart, setPendingRemoval } = form;
  const [newMeasurement, setNewMeasurement] = useState('');
  const columns = formSizeChart.columns;
  const isFull = columns.length >= SIZE_CHART_MAX_COLUMNS;
  const chips = isFull ? [] : measurementSuggestions(products, formSizeChart);
  const preview = normalizeSizeChart(formSizeChart, formSizes);

  // the same measurement again is not added: the typed name stays in the field
  const addMeasurement = (label: string) => {
    const next = withColumn(formSizeChart, label);
    if (next === formSizeChart) return;
    setFormSizeChart(next);
    setNewMeasurement('');
  };

  const removeMeasurement = (key: string, label: string) => {
    const filled = formSizes.filter((size) => sizeChartValue(formSizeChart, size, key).trim()).length;
    setPendingRemoval({
      title: 'Удалить замер?',
      message: filled > 0 ? `Вместе с замером удалятся его значения у размеров: ${filled}.` : 'Значений у этого замера нет.',
      preview: (
        <>
          <span className="w-8 h-8 rounded-xl neu-flat flex items-center justify-center text-accent shrink-0">
            <Ruler className="w-4 h-4" aria-hidden="true" />
          </span>
          <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">{label.trim() || 'Замер без названия'}</p>
        </>
      ),
      run: () => setFormSizeChart((chart) => withoutColumn(chart, key)),
    });
  };

  return (
    <section aria-labelledby="product-form-size-chart" className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#BAC5D5]/30">
        <h4
          id="product-form-size-chart"
          className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider"
        >
          <Ruler className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          Размерная сетка
        </h4>
        <span className="text-[11px] font-semibold text-[#4E5C70]">Необязательно</span>
      </div>
      <p className="text-xs text-[#4E5C70] leading-snug">
        Замеры в сантиметрах для каждого размера. Покупатель увидит таблицу под выбором размера; пустые замеры не
        показываются.
      </p>

      {formSizes.length === 0 ? (
        <p className="text-xs font-bold text-[#4E5C70]">Сначала добавьте размеры товара — строки сетки появятся по ним.</p>
      ) : (
        <>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Частые замеры">
              {chips.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => addMeasurement(label)}
                  className="min-h-8 px-2.5 rounded-xl neu-button text-[11px] font-bold text-[#2D3A4E] hover:text-accent flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-accent" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {isFull ? (
            <p className="text-xs text-[#4E5C70]">Замеров уже {SIZE_CHART_MAX_COLUMNS} — больше таблица не поместится на телефоне.</p>
          ) : (
            <div data-enter-adds className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Свой замер"
                value={newMeasurement}
                maxLength={SIZE_CHART_LABEL_MAX}
                onChange={(e) => setNewMeasurement(e.target.value)}
                placeholder="Свой замер, напр. Длина по спинке"
                className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
              />
              <button
                type="button"
                onClick={() => addMeasurement(newMeasurement)}
                disabled={!newMeasurement.trim()}
                className={`h-9 px-3 rounded-xl text-xs font-extrabold shrink-0 whitespace-nowrap ${
                  newMeasurement.trim() ? 'neu-button text-accent cursor-pointer' : 'neu-button-disabled text-[#4E5C70]'
                }`}
              >
                + Замер
              </button>
            </div>
          )}

          {columns.length > 0 && (
            // a row per measurement, a column per size — as in a factory's spec sheet; the name stays in view
            <div className="overflow-x-auto overscroll-x-contain -mx-1 px-1 pb-1">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-[1] bg-[var(--neu-bg)] pr-2 py-1 text-left text-[11px] font-bold text-[#4E5C70] whitespace-nowrap">
                      Замер
                    </th>
                    {formSizes.map((size) => (
                      <th key={size} scope="col" className="px-1 py-1 text-center font-extrabold text-accent whitespace-nowrap">
                        {size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((column, i) => (
                    <tr key={column.key}>
                      <th scope="row" className="sticky left-0 z-[1] bg-[var(--neu-bg)] pr-2 py-1 text-left font-normal">
                        <div className="flex items-center gap-1 w-44 sm:w-56">
                          <input
                            type="text"
                            value={column.label}
                            maxLength={SIZE_CHART_LABEL_MAX}
                            onChange={(e) => setFormSizeChart((chart) => withColumnLabel(chart, column.key, e.target.value))}
                            aria-label={`Название замера ${i + 1}`}
                            placeholder="Название замера"
                            className="flex-1 min-w-0 h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
                          />
                          <button
                            type="button"
                            onClick={() => removeMeasurement(column.key, column.label)}
                            aria-label={`Удалить замер: ${column.label.trim() || `замер ${i + 1}`}`}
                            title="Удалить замер"
                            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[#4E5C70] hover:text-danger cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </th>
                      {formSizes.map((size) => (
                        <td key={size} className="px-1 py-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={sizeChartValue(formSizeChart, size, column.key)}
                            maxLength={SIZE_CHART_VALUE_MAX}
                            onChange={(e) => setFormSizeChart((chart) => withValue(chart, size, column.key, e.target.value))}
                            aria-label={`${column.label.trim() || `Замер ${i + 1}`}, размер ${size}, см`}
                            placeholder="см"
                            className="w-[4.5rem] h-9 px-1.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] text-center placeholder:text-[#56647A] placeholder:font-normal"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider">Как увидит покупатель</p>
              <SizeChartTable chart={preview} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
