import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Landmark, Loader2, Plus, Save, X } from 'lucide-react';
import type { Order, OrderPaymentDetails, PaymentKind, PaymentRequisitesByKind, PaymentTemplate } from '../../types';
import { NeumorphicSelect } from '../NeumorphicSelect';
import { AdminRequisitesFields } from './AdminRequisitesFields';
import { savePaymentTemplate } from '../../utils/firebaseSync';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import {
  emptyRequisites,
  filledPaymentKinds,
  normalizeRequisites,
  PAYMENT_KIND_SHORT,
  PAYMENT_KIND_TITLES,
  PAYMENT_KINDS,
  toFormRequisites,
  validateRequisites,
} from '../../utils/paymentDetails';

type FormState = Partial<Record<PaymentKind, PaymentRequisitesByKind[PaymentKind]>>;

const formOf = (details: OrderPaymentDetails | undefined): FormState => {
  const out: FormState = {};
  for (const kind of PAYMENT_KINDS) {
    const fields = details?.[kind];
    if (fields) out[kind] = toFormRequisites(kind, fields as PaymentRequisitesByKind[typeof kind]);
  }
  return out;
};

interface AdminOrderPaymentBlockProps {
  order: Order;
  /** Requisites templates; null — still loading */
  templates: PaymentTemplate[] | null;
  /** Saves `paymentDetails` of the order (undefined — none); true when saved */
  onSave: (details: OrderPaymentDetails | undefined) => Promise<boolean>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * «Реквизиты оплаты» of an order (brief «Доработки 5» §2): a template for each way to pay → «Применить к заказу» → the
 * fields can be changed for this order only (the template stays as it is) → «Сохранить для заказа». The buyer sees
 * only the ways filled here. «Сохранить как шаблон» adds the entered requisites to the library.
 */
export const AdminOrderPaymentBlock: React.FC<AdminOrderPaymentBlockProps> = ({ order, templates, onSave, onShowToast }) => {
  const [open, setOpen] = useState(false);
  const saved = useMemo(() => formOf(order.paymentDetails), [order.paymentDetails]);
  const [form, setForm] = useState<FormState>(saved);
  const [picked, setPicked] = useState<Partial<Record<PaymentKind, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<PaymentKind, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState<Partial<Record<PaymentKind, string>>>({});
  const [savingTemplate, setSavingTemplate] = useState<PaymentKind | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedChanges(open && dirty, `Реквизиты заказа № ${order.id}`);
  // a new value from the database (another tab, a template applied elsewhere) while there are no edits
  useEffect(() => {
    if (!dirty) setForm(saved);
  }, [saved]);

  const filled = filledPaymentKinds(order.paymentDetails);
  const locked = order.paymentStatus === 'paid' || order.paymentStatus === 'receipt_review';

  const setKind = (kind: PaymentKind, fields: PaymentRequisitesByKind[PaymentKind] | undefined) => {
    setForm((prev) => {
      const next = { ...prev };
      if (fields) next[kind] = fields;
      else delete next[kind];
      return next;
    });
    setErrors((prev) => ({ ...prev, [kind]: {} }));
  };

  const apply = (kind: PaymentKind) => {
    const template = templates?.find((t) => t.id === picked[kind]);
    if (!template) {
      onShowToast('Выберите шаблон', 'info');
      return;
    }
    setKind(kind, toFormRequisites(kind, template.fields as PaymentRequisitesByKind[typeof kind]));
  };

  const saveForOrder = async () => {
    const nextErrors: Partial<Record<PaymentKind, Record<string, string>>> = {};
    const details: OrderPaymentDetails = {};
    for (const kind of PAYMENT_KINDS) {
      const fields = form[kind];
      if (!fields) continue;
      const e = validateRequisites(kind, fields);
      if (Object.keys(e).length > 0) nextErrors[kind] = e;
      else (details as Record<string, unknown>)[kind] = normalizeRequisites(kind, fields);
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      onShowToast('Проверьте реквизиты: есть ошибки в полях', 'error');
      return;
    }
    setSaving(true);
    const ok = await onSave(Object.keys(details).length > 0 ? details : undefined);
    setSaving(false);
    if (ok) onShowToast(`Реквизиты заказа № ${order.id} сохранены — покупатель видит их в заказе`, 'success');
  };

  const saveAsTemplate = async (kind: PaymentKind) => {
    const fields = form[kind];
    const name = (templateName[kind] ?? '').trim();
    if (!fields) return;
    const e = validateRequisites(kind, fields);
    setErrors((prev) => ({ ...prev, [kind]: e }));
    if (Object.keys(e).length > 0) return;
    if (!name) {
      onShowToast('Назовите шаблон', 'info');
      document.getElementById(`order-${order.id}-${kind}-template-name`)?.focus();
      return;
    }
    setSavingTemplate(kind);
    try {
      await savePaymentTemplate({ id: `tpl-${Date.now()}`, name, kind, fields: normalizeRequisites(kind, fields) } as PaymentTemplate);
      setTemplateName((prev) => ({ ...prev, [kind]: '' }));
      onShowToast(`Шаблон «${name}» сохранён`, 'success');
    } catch (err) {
      console.error('Payment template was not saved:', err);
      onShowToast('Не сохранено: шаблон реквизитов. Проверьте соединение.', 'error');
    } finally {
      setSavingTemplate(null);
    }
  };

  return (
    <div className="neu-inset-deep rounded-2xl border border-white/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full min-h-10 px-3 py-2 flex items-center gap-2 text-left cursor-pointer"
      >
        <Landmark className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
        <span className="text-xs font-extrabold text-[#2D3A4E]">Реквизиты оплаты</span>
        <span className="text-[11px] font-bold text-[#4E5C70] truncate">
          {filled.length > 0 ? filled.map((k) => PAYMENT_KIND_SHORT[k]).join(' · ') : 'не указаны'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto text-[#4E5C70] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-[#4E5C70]">
            {locked
              ? 'Покупатель уже прислал чек или заказ оплачен — реквизиты можно поправить, но кнопки оплаты у покупателя сейчас нет.'
              : 'Покупатель увидит в заказе только заполненные способы и сможет скопировать каждое поле.'}
          </p>
          {PAYMENT_KINDS.map((kind) => {
            const fields = form[kind];
            const kindTemplates = (templates ?? []).filter((t) => t.kind === kind);
            return (
              <section key={kind} className="neu-flat-sm rounded-xl p-2.5 space-y-2" aria-label={PAYMENT_KIND_TITLES[kind]}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-[#2D3A4E]">{PAYMENT_KIND_TITLES[kind]}</h4>
                  {fields ? (
                    <button
                      type="button"
                      onClick={() => setKind(kind, undefined)}
                      className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-[#4E5C70] flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      Убрать
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setKind(kind, emptyRequisites(kind))}
                      className="h-8 px-2.5 neu-button rounded-lg text-[11px] font-bold text-accent flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Ввести вручную
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <NeumorphicSelect
                    value={picked[kind] ?? ''}
                    onChange={(v) => setPicked((prev) => ({ ...prev, [kind]: v }))}
                    options={kindTemplates.map((t) => ({ value: t.id, label: t.name }))}
                    placeholder={templates === null ? 'Загрузка…' : 'Шаблон…'}
                    emptyText="Шаблонов нет — добавьте в «Оплата»"
                    ariaLabel={`Шаблон: ${PAYMENT_KIND_TITLES[kind]}`}
                    className="flex-1 min-w-[10rem]"
                    variant="inset"
                  />
                  <button
                    type="button"
                    onClick={() => apply(kind)}
                    disabled={!picked[kind]}
                    className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      picked[kind] ? 'neu-button text-accent' : 'neu-button-disabled text-[#4E5C70]'
                    }`}
                  >
                    Применить к заказу
                  </button>
                </div>

                {fields && (
                  <>
                    <AdminRequisitesFields
                      kind={kind}
                      value={fields}
                      onChange={(next) => setKind(kind, next)}
                      errors={errors[kind]}
                      idPrefix={`order-${order.id}-${kind}`}
                      singleColumn
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <label htmlFor={`order-${order.id}-${kind}-template-name`} className="sr-only">
                        Название нового шаблона
                      </label>
                      <input
                        id={`order-${order.id}-${kind}-template-name`}
                        value={templateName[kind] ?? ''}
                        onChange={(e) => setTemplateName((prev) => ({ ...prev, [kind]: e.target.value }))}
                        maxLength={60}
                        placeholder="Название шаблона"
                        className="flex-1 min-w-[9rem] neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveAsTemplate(kind)}
                        disabled={savingTemplate === kind}
                        className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingTemplate === kind && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                        Сохранить как шаблон
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}

          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setForm(saved);
                  setErrors({});
                }}
                disabled={saving}
                className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] cursor-pointer"
              >
                Отменить правки
              </button>
            )}
            <button
              type="button"
              onClick={saveForOrder}
              disabled={!dirty || saving}
              className={`h-9 px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                dirty && !saving ? 'neu-button text-accent' : 'neu-button-disabled text-[#4E5C70]'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
              Сохранить для заказа
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
