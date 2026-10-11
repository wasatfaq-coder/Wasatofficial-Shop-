import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Product } from '../../../types';
import { ModalPortal } from '../../ModalPortal';
import { DiscardChangesDialog, useDiscardGuard } from '../../DiscardChangesDialog';
import { useDialogA11y } from '../../../utils/useDialogA11y';
import { useUnsavedChanges } from '../../../utils/unsavedChanges';
import { applyAdminStockChanges } from '../../../utils/firebaseSync';
import { pluralRu } from '../../../utils/pluralize';
import { quickStockChanges, quickStockVariants, variantKey } from '../../../utils/quickProductEdit';
import type { AdminProductsTabProps } from '../AdminProductsTab';

export const QUICK_STOCK_REASON = 'Правка остатка из списка товаров';

/**
 * The stock of each colour × size of one product from the list, without the form (stage 4 of
 * docs/admin-wholesale-plan.md, finding 28). Each changed variation — by the difference with the shown stock, in its own
 * transaction with a journal entry (`applyAdminStockChanges`, like an operation in «Склад и SKU»): a sale while the window
 * is open stays sold. A variation that did not go through stays in the window to retry.
 */
export function ProductQuickStockDialog({
  product,
  onClose,
  onShowToast,
}: {
  product: Product;
  onClose: () => void;
  onShowToast: AdminProductsTabProps['onShowToast'];
}) {
  const variants = useMemo(() => quickStockVariants(product), [product]);
  // the stock the owner saw when the window opened: the difference is counted from it, so a sale while the window is open
  // (the list updates «сейчас N шт.» live) stays sold; a saved variation moves its baseline by what was written
  const [baseline, setBaseline] = useState<Record<string, number>>(() =>
    Object.fromEntries(variants.map((sku) => [variantKey(sku), Math.max(0, Number(sku.stock) || 0)]))
  );
  const seenVariants = useMemo(
    () => variants.map((sku) => ({ ...sku, stock: baseline[variantKey(sku)] ?? sku.stock })),
    [variants, baseline]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const { changes, error: valueError } = quickStockChanges(product, seenVariants, values);
  const dirty = changes.length > 0 || Boolean(valueError);
  useUnsavedChanges(dirty, 'Остатки товара');
  const guard = useDiscardGuard(dirty, onClose);
  const dialog = useDialogA11y(true, guard.requestClose, { closeOnEscape: !saving });

  const handleSave = async () => {
    if (savingRef.current) return;
    setError(valueError);
    if (valueError) return;
    if (changes.length === 0) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const { failed } = await applyAdminStockChanges(changes, { reason: QUICK_STOCK_REASON, operator: 'Администратор' });
    savingRef.current = false;
    setSaving(false);
    if (failed.length > 0) {
      // what went through is on the shelf; the window keeps only the variations to repeat
      const failedKeys = new Set(failed.map(variantKey));
      setBaseline((prev) => {
        const next = { ...prev };
        for (const c of changes) if (!failedKeys.has(variantKey(c))) next[variantKey(c)] = (next[variantKey(c)] ?? 0) + c.delta;
        return next;
      });
      setValues((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => failedKeys.has(key))));
      setError(
        `Не сохранено: ${failed.map((c) => `${c.color}, ${c.size}`).join('; ')}. Проверьте соединение и повторите — остальное уже на складе`
      );
      return;
    }
    onShowToast(
      `Остаток «${product.title}» изменён: ${changes.length} ${pluralRu(changes.length, ['вариант', 'варианта', 'вариантов'])}`,
      'success'
    );
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
          className="neu-modal animate-in zoom-in-95 fade-in duration-200 rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-3.5 text-[#2D3A4E] border border-white/80 my-auto"
        >
          <div className="flex items-start justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <div className="min-w-0">
              <h3 id={dialog.titleId} className="text-sm sm:text-base font-extrabold text-[#2D3A4E]">
                Остаток товара
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

          {variants.length === 0 ? (
            <p className="text-xs text-[#4E5C70]">
              У товара нет цветов и размеров — остаток задаётся по ним. Добавьте их в форме товара, блок «Варианты и
              остатки».
            </p>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
              className="space-y-3"
            >
              <p className="text-xs text-[#4E5C70]">
                Впишите новый остаток там, где он изменился. Каждая правка попадёт в журнал склада.
              </p>
              <ul aria-label="Варианты" className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {variants.map((sku, i) => {
                  const key = variantKey(sku);
                  const id = `quick-stock-${i}`;
                  const shown = Math.max(0, Number(sku.stock) || 0);
                  return (
                    <li key={key} className="neu-flat-sm rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <label htmlFor={id} className="block text-xs font-bold text-[#2D3A4E]">
                          {sku.color}, {sku.size}
                        </label>
                        <span id={`${id}-now`} className="block text-[11px] font-bold text-[#4E5C70]">
                          сейчас {shown} шт.
                        </span>
                      </div>
                      <input
                        id={id}
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-describedby={`${id}-now`}
                        data-autofocus={i === 0 ? true : undefined}
                        value={values[key] ?? ''}
                        placeholder={String(shown)}
                        onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-24 px-3 py-2 neu-inset rounded-xl text-sm font-extrabold text-[#2D3A4E] text-right"
                      />
                    </li>
                  );
                })}
              </ul>
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
          )}
        </div>
      </div>
      <DiscardChangesDialog {...guard.dialogProps} what="Изменения остатков" />
    </ModalPortal>
  );
}
