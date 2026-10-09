import React from 'react';
import { AdminHint } from '../AdminHint';
import { SUPPLIER_MAX_LENGTH, SUPPLIER_SKU_MAX_LENGTH } from '../../../utils/productCosts';
import type { Product } from '../../../types';
import type { ProductForm } from './useProductForm';

/**
 * Supplier and the supplier's article (stage 11 of docs/admin-wholesale-plan.md): for reordering and checking the
 * supplier's invoices. Kept in `product_costs` with the cost — the customer never sees them. The names of suppliers
 * already in the shop are offered while typing, so one supplier is not written three ways.
 */
export function ProductFormSupplier({ form, products }: { form: ProductForm; products: Pick<Product, 'supplier'>[] }) {
  const { formSupplier, setFormSupplier, formSupplierSku, setFormSupplierSku } = form;
  const knownSuppliers = React.useMemo(
    () => [...new Set(products.map((p) => p.supplier).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'ru')),
    [products]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-0.5 mb-1">
          <label htmlFor="product-form-supplier" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
            Поставщик
          </label>
          <AdminHint label="Поставщик">Для вас: у кого купили товар. Покупатель не видит.</AdminHint>
        </div>
        <input
          id="product-form-supplier"
          type="text"
          list={knownSuppliers.length > 0 ? 'product-form-supplier-list' : undefined}
          value={formSupplier}
          onChange={(e) => setFormSupplier(e.target.value)}
          maxLength={SUPPLIER_MAX_LENGTH}
          autoComplete="off"
          placeholder="напр. Guangzhou Fashion"
          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
        />
        {knownSuppliers.length > 0 && (
          <datalist id="product-form-supplier-list">
            {knownSuppliers.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-0.5 mb-1">
          <label htmlFor="product-form-supplier-sku" className="text-[11px] font-bold text-[#4E5C70] leading-tight">
            Артикул поставщика
          </label>
          <AdminHint label="Артикул поставщика">
            Для вас: как поставщик называет товар — по нему перезаказывают и сверяют счёт. Покупатель не видит.
          </AdminHint>
        </div>
        <input
          id="product-form-supplier-sku"
          type="text"
          value={formSupplierSku}
          onChange={(e) => setFormSupplierSku(e.target.value)}
          maxLength={SUPPLIER_SKU_MAX_LENGTH}
          autoComplete="off"
          placeholder="напр. GF-2231"
          className="w-full h-9 px-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] placeholder:text-[#56647A]"
        />
      </div>
    </div>
  );
}
