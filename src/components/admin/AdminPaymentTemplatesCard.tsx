import React, { useState } from 'react';
import { Edit3, Landmark, Loader2, Plus, Trash2 } from 'lucide-react';
import type { PaymentKind, PaymentRequisitesByKind, PaymentTemplate } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { AdminRequisitesFields } from './AdminRequisitesFields';
import { usePaymentTemplates } from './usePaymentTemplates';
import { deletePaymentTemplate, savePaymentTemplate } from '../../utils/firebaseSync';
import { useChangedSince, useUnsavedChanges } from '../../utils/unsavedChanges';
import {
  displayValue,
  emptyRequisites,
  normalizeRequisites,
  PAYMENT_KIND_SHORT,
  PAYMENT_KIND_TITLES,
  PAYMENT_KINDS,
  REQUISITE_FIELDS,
  toFormRequisites,
  validateRequisites,
} from '../../utils/paymentDetails';

interface Draft {
  id: string;
  isNew: boolean;
  name: string;
  kind: PaymentKind;
  fields: PaymentRequisitesByKind[PaymentKind];
}

/** First field of a template for the list: the phone, the card or the account */
const summaryOf = (t: PaymentTemplate): string => {
  const field = REQUISITE_FIELDS[t.kind][t.kind === 'account' ? 1 : 0];
  const value = (t.fields as unknown as Record<string, string>)[field.key];
  return displayValue(field, value);
};

/**
 * «Шаблоны реквизитов» (brief «Доработки 5» §2.1): named sets of requisites («Сбербанк — ИП Иванов», «Т-Банк СБП
 * физлицо») the admin applies to an order in «Заказы». Only the admin reads them; the buyer sees the requisites applied
 * to their order.
 */
export const AdminPaymentTemplatesCard: React.FC<{
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}> = ({ onShowToast }) => {
  const templates = usePaymentTemplates();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<PaymentTemplate | null>(null);
  useUnsavedChanges(useChangedSince(draft?.id ?? null, [draft?.name, draft?.kind, JSON.stringify(draft?.fields)]), 'Шаблон реквизитов');

  const startNew = () => {
    setErrors({});
    setDraft({ id: `tpl-${Date.now()}`, isNew: true, name: '', kind: 'sbp', fields: emptyRequisites('sbp') });
  };
  const startEdit = (t: PaymentTemplate) => {
    setErrors({});
    setDraft({ id: t.id, isNew: false, name: t.name, kind: t.kind, fields: toFormRequisites(t.kind, t.fields) });
  };

  const save = async () => {
    if (!draft) return;
    const fieldErrors = validateRequisites(draft.kind, draft.fields);
    const next = { ...fieldErrors, ...(draft.name.trim() ? {} : { name: 'Назовите шаблон' }) };
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      await savePaymentTemplate({
        id: draft.id,
        name: draft.name.trim(),
        kind: draft.kind,
        fields: normalizeRequisites(draft.kind, draft.fields),
      } as PaymentTemplate);
      onShowToast(`Шаблон «${draft.name.trim()}» сохранён`, 'success');
      setDraft(null);
    } catch (err) {
      console.error('Payment template was not saved:', err);
      onShowToast('Не сохранено: шаблон реквизитов. Проверьте соединение.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: PaymentTemplate) => {
    try {
      await deletePaymentTemplate(t.id);
      onShowToast(`Шаблон «${t.name}» удалён`, 'success');
    } catch (err) {
      console.error('Payment template was not deleted:', err);
      onShowToast('Не удалось удалить шаблон. Проверьте соединение.', 'error');
    }
  };

  return (
    <section className="neu-flat rounded-3xl p-4 space-y-3" aria-labelledby="payment-templates-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 id="payment-templates-title" className="text-sm font-extrabold text-[#2D3A4E] flex items-center gap-2">
            <Landmark className="w-4 h-4 text-accent" aria-hidden="true" />
            Шаблоны реквизитов
          </h3>
          <p className="text-xs text-[#4E5C70] mt-0.5">
            СБП, карта и расчётный счёт. В «Заказах» шаблон применяется к заказу, и покупатель видит реквизиты в своём заказе.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={startNew}
            className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-accent flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Добавить шаблон
          </button>
        )}
      </div>

      {draft && (
        <div className="neu-inset rounded-2xl p-3 space-y-3">
          <div role="radiogroup" aria-label="Тип оплаты" className="flex flex-wrap gap-1.5">
            {PAYMENT_KINDS.map((kind) => {
              const selected = draft.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!draft.isNew && !selected}
                  onClick={() => {
                    setErrors({});
                    setDraft({ ...draft, kind, fields: emptyRequisites(kind) });
                  }}
                  className={`min-h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                    selected ? 'neu-pill-active text-[#2D3A4E]' : !draft.isNew ? 'neu-button-disabled text-[#4E5C70]' : 'neu-button text-[#2D3A4E]'
                  }`}
                >
                  {PAYMENT_KIND_TITLES[kind]}
                </button>
              );
            })}
          </div>
          <div className="space-y-1">
            <label htmlFor="payment-template-name" className="block text-[11px] font-bold text-[#4E5C70]">
              Название шаблона
            </label>
            <input
              id="payment-template-name"
              value={draft.name}
              maxLength={60}
              placeholder="Например: Сбербанк — ИП Иванов"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'payment-template-name-error' : undefined}
              className="w-full neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none"
            />
            {errors.name && (
              <p id="payment-template-name-error" className="text-[11px] font-bold text-danger">
                {errors.name}
              </p>
            )}
          </div>
          <AdminRequisitesFields
            kind={draft.kind}
            value={draft.fields}
            onChange={(fields) => setDraft({ ...draft, fields })}
            errors={errors}
            idPrefix="payment-template"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="h-9 px-4 neu-button rounded-xl text-xs font-bold text-[#4E5C70] cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-9 px-4 neu-button rounded-xl text-xs font-extrabold text-accent flex items-center gap-1.5 cursor-pointer"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Сохранить шаблон
            </button>
          </div>
        </div>
      )}

      {templates === null ? (
        <p className="text-xs text-[#4E5C70]">Загрузка шаблонов…</p>
      ) : templates.length === 0 ? (
        !draft && <p className="text-xs text-[#4E5C70]">Шаблонов пока нет: реквизиты можно ввести и в самом заказе.</p>
      ) : (
        <ul className="space-y-1.5">
          {templates.map((t) => (
            <li key={t.id} className="neu-flat-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-[11px] font-extrabold text-accent shrink-0 w-10">{PAYMENT_KIND_SHORT[t.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">{t.name}</p>
                <p className="text-[11px] text-[#4E5C70] font-mono truncate">{summaryOf(t)}</p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(t)}
                aria-label={`Изменить шаблон «${t.name}»`}
                className="w-8 h-8 neu-button rounded-lg flex items-center justify-center text-accent cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setToDelete(t)}
                aria-label={`Удалить шаблон «${t.name}»`}
                className="w-8 h-8 neu-button rounded-lg flex items-center justify-center text-danger cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Удалить шаблон?"
        message="Реквизиты, уже применённые к заказам, останутся в заказах."
        preview={toDelete ? <span className="text-xs font-bold text-[#2D3A4E]">{toDelete.name}</span> : undefined}
        onConfirm={() => {
          if (toDelete) void remove(toDelete);
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </section>
  );
};
