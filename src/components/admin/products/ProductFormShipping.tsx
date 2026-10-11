import { AdminHint } from '../AdminHint';
import type { ProductForm } from './useProductForm';

const FIELD_CLASS =
  'w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]';

/**
 * Weight of one item and the size of its package (stage 15 of docs/admin-wholesale-plan.md): the invoice sums the
 * order's weight from the first, Post and carriers ask for the second. Checked with the rest of the form on «Сохранить»
 * (src/utils/productShipping.ts); the customer does not see them.
 */
export function ProductFormShipping({ form }: { form: ProductForm }) {
  const { formWeight, setFormWeight, formPackageL, setFormPackageL, formPackageW, setFormPackageW, formPackageH, setFormPackageH } =
    form;
  const sides = [
    { id: 'product-form-package-l', label: 'Длина, см', value: formPackageL, onChange: setFormPackageL },
    { id: 'product-form-package-w', label: 'Ширина, см', value: formPackageW, onChange: setFormPackageW },
    { id: 'product-form-package-h', label: 'Высота, см', value: formPackageH, onChange: setFormPackageH },
  ];

  return (
    <div className="space-y-3">
      <div className="min-w-0 sm:max-w-[50%]">
        <div className="flex items-center gap-0.5 mb-1">
          <label htmlFor="product-form-weight" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
            Вес одной штуки, г
          </label>
          <AdminHint label="Вес одной штуки">Вес штуки в упаковке. Из него считается вес заказа в накладной.</AdminHint>
        </div>
        <input
          id="product-form-weight"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formWeight}
          onChange={(e) => setFormWeight(e.target.value)}
          placeholder="напр. 350"
          className={FIELD_CLASS}
        />
      </div>

      <div role="group" aria-labelledby="product-form-package-title">
        <div className="flex items-center gap-0.5 mb-1">
          <span id="product-form-package-title" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
            Габариты упаковки
          </span>
          <AdminHint label="Габариты упаковки">Упаковка одной штуки. Нужны Почте и ТК; все три или ни одного.</AdminHint>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {sides.map((side) => (
            <div key={side.id} className="min-w-0">
              <label htmlFor={side.id} className="text-[11px] font-bold text-[#4E5C70] block mb-1 leading-tight">
                {side.label}
              </label>
              <input
                id={side.id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={side.value}
                onChange={(e) => side.onChange(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
