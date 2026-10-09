import type { ProductSizeChart } from '../types';

/**
 * «Размерная сетка» of a model as the customer sees it (product page) and the owner previews it (product form). The table
 * scrolls by itself, the page does not: the size column stays in place, the chosen size is marked.
 */
export function SizeChartTable({
  chart,
  selectedSize,
  id,
}: {
  chart: ProductSizeChart;
  /** The size chosen on the page: its row is marked */
  selectedSize?: string;
  id?: string;
}) {
  return (
    <div id={id} className="space-y-1.5">
      {/* a scrolled region is reachable by keyboard and named for a screen reader; flat with a border, not neu-inset:
          the inset shadow broke under the sticky size column */}
      <div
        className="overflow-x-auto overscroll-x-contain rounded-2xl border border-[#BAC5D5]/70"
        role="region"
        aria-label="Размерная сетка, замеры в сантиметрах"
        tabIndex={0}
      >
        <table className="min-w-full text-xs text-center border-collapse">
          <thead>
            <tr className="text-[#4E5C70] border-b border-[#BAC5D5]/60">
              <th scope="col" className="sticky left-0 bg-[var(--neu-bg)] py-2 pl-3 pr-2 text-left font-bold whitespace-nowrap">
                Размер
              </th>
              {chart.columns.map((column) => (
                <th key={column.key} scope="col" className="py-2 px-2 font-bold leading-tight min-w-[4.5rem]">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => {
              const isSelected = row.size === selectedSize;
              return (
                <tr
                  key={row.size}
                  className={`border-b border-[#BAC5D5]/40 last:border-b-0 ${
                    isSelected ? 'text-accent font-extrabold' : 'text-[#2D3A4E]'
                  }`}
                >
                  <th
                    scope="row"
                    className={`sticky left-0 py-2 pl-3 pr-2 text-left whitespace-nowrap ${
                      isSelected ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--neu-bg))] font-extrabold' : 'bg-[var(--neu-bg)] font-bold'
                    }`}
                  >
                    {row.size}
                    {isSelected && <span className="sr-only">, выбран</span>}
                  </th>
                  {chart.columns.map((column) => (
                    <td key={column.key} className={`py-2 px-2 whitespace-nowrap ${isSelected ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--neu-bg))]' : ''}`}>
                      {row.values[column.key] || (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">нет замера</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#4E5C70] leading-snug">Все значения — в сантиметрах.</p>
    </div>
  );
}
