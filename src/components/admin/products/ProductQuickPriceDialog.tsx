import { useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Product } from '../../../types';
import { ModalPortal } from '../../ModalPortal';
import { DiscardChangesDialog, useDiscardGuard } from '../../DiscardChangesDialog';
import { useDialogA11y } from '../../../utils/useDialogA11y';
import { useUnsavedChanges } from '../../../utils/unsavedChanges';
import { belowCostLines, quickPriceError, withQuickPrice } from '../../../utils/quickProductEdit';
import type { AdminProductsTabProps } from '../AdminProductsTab';

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;
/** '' — the field is empty */
const readRub = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(',', '.')));

/**
 * The price of one product from the list, without the form (stage 4 of docs/admin-wholesale-plan.md, finding 28):
 * «Цена» and «Старая цена», the cost and a warning when the price is below it (А9). Closes only after the database
 * answered; the price journal and the price history are written by the save of products, as from the form.
 */
export function ProductQuickPriceDialog({
  product,
  products,
  onClose,
  onUpdateProducts,
  onShowToast,
}: {
  product: Product;
  products: Product[];
  onClose: () => void;
  onUpdateProducts: AdminProductsTabProps['onUpdateProducts'];
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const [price, setPrice] = useState(String(product.price));
  const [oldPrice, setOldPrice] = useState(product.originalPrice ? String(product.originalPrice) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const dirty = price !== String(product.price) || oldPrice !== (product.originalPrice ? String(product.originalPrice) : '');
  useUnsavedChanges(dirty, 'Цена товара');
  const guard = useDiscardGuard(dirty, onClose);
  const dialog = useDialogA11y(true, guard.requestClose, { closeOnEscape: !saving });

  const priceValue = readRub(price) ?? 0;
  const below = belowCostLines([{ ...product, price: priceValue }])[0];

  const handleSave = async () => {
    if (savingRef.current) return;
    const nextOld = readRub(oldPrice);
    const problem = quickPriceError(priceValue, nextOld);
    setError(problem);
    if (problem) return;
    if (!dirty) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    // the product as the database has it now: a change from another window meanwhile is not taken back
    const updated = products.map((p) => (p.id === product.id ? withQuickPrice(p, priceValue, nextOld) : p));
    const saved = (await onUpdateProducts(updated)) !== false;
    savingRef.current = false;
    setSaving(false);
    // a refusal already showed «Не сохранено: …»; the typed prices stay to retry
    if (!saved) return;
    onShowToast(`Цена «${product.title}»: ${rub(priceValue)}`, 'success');
    onClose();
  };

  return (
    <ModalPortal>
      <div
        className="admin-no-glow fixed inset-0 z-[80] bg-[#2D3A4E]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget && !saving) guard.requestClose();
        }}
      >
        <div
          ref={dialog.ref}
          {...dialog.props}
          className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-3.5 text-[#2D3A4E] border border-white/80 my-auto"
        >
          <div className="flex items-start justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <div className="min-w-0">
              <h3 id={dialog.titleId} className="text-sm sm:text-base font-extrabold text-[#2D3A4E]">
                Цена товара
              </h3>
              <p className="text-xs text-[#4E5C70] truncate">{product.title}</p>
            </div>
            <button
              type="button"
              onClick={guard.requestClose}
              disabled={saving}
              className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="quick-price" className="text-[11px] font-bold text-[#4E5C70]">
                  Цена, ₽
                </label>
                <input
                  id="quick-price"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  data-autofocus
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-invalid={Boolean(error) && error.startsWith('Цена')}
                  className="w-full px-3 py-2 neu-inset rounded-xl text-sm font-extrabold text-[#2D3A4E]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="quick-old-price" className="text-[11px] font-bold text-[#4E5C70]">
                  Старая цена, ₽
                </label>
                <input
                  id="quick-old-price"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={oldPrice}
                  onChange={(e) => setOldPrice(e.target.value)}
                  placeholder="нет"
                  aria-invalid={Boolean(error) && error.startsWith('Старая')}
                  className="w-full px-3 py-2 neu-inset rounded-xl text-sm font-extrabold text-[#2D3A4E]"
                />
              </div>
            </div>

            {product.costPrice !== undefined && product.costPrice > 0 && (
              <p className="text-xs text-[#4E5C70]">
                Закупка: <strong className="text-[#2D3A4E]">{rub(product.costPrice)}</strong>
              </p>
            )}
            {below && (
              <p className="flex items-start gap-1.5 rounded-xl bg-warning-soft border border-warning/25 p-2.5 text-xs font-bold text-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                Цена ниже закупки на {rub(below.loss)}: каждая продажа — в убыток. Сохранить можно, если так задумано.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs font-bold text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2.5 pt-2 border-t border-[#BAC5D5]/50">
              <button
                type="button"
                onClick={guard.requestClose}
                disabled={saving}
                className="flex-1 py-2.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                aria-busy={saving}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold ${
                  saving ? 'neu-button-disabled text-[#4E5C70]' : 'neu-button-accent text-white cursor-pointer'
                }`}
              >
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <DiscardChangesDialog {...guard.dialogProps} what="Изменения цены" />
    </ModalPortal>
  );
}
