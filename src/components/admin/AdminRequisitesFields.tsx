import React from 'react';
import type { PaymentKind, PaymentRequisitesByKind } from '../../types';
import { displayValue, REQUISITE_FIELDS } from '../../utils/paymentDetails';

interface AdminRequisitesFieldsProps<K extends PaymentKind> {
  kind: K;
  value: PaymentRequisitesByKind[K];
  onChange: (next: PaymentRequisitesByKind[K]) => void;
  /** Errors by field key (`validateRequisites`) */
  errors?: Record<string, string>;
  /** Unique per form: ids of the inputs and their errors */
  idPrefix: string;
  /** One column: the narrow column of an order card */
  singleColumn?: boolean;
}

/**
 * Fields of one way to pay (brief «Доработки 5» §2.2): numbers are typed freely and get their mask when the field is
 * left (+7 (999) 000-00-00, card groups of 4) — a mask while typing would trap Backspace on its brackets and spaces.
 */
export function AdminRequisitesFields<K extends PaymentKind>({ kind, value, onChange, errors = {}, idPrefix, singleColumn = false }: AdminRequisitesFieldsProps<K>) {
  const values = value as unknown as Record<string, string | undefined>;
  const set = (key: string, next: string) => onChange({ ...(value as object), [key]: next } as unknown as PaymentRequisitesByKind[K]);

  return (
    <div className={`grid grid-cols-1 gap-2 ${singleColumn ? '' : 'sm:grid-cols-2'}`}>
      {REQUISITE_FIELDS[kind].map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const error = errors[field.key];
        const numeric = field.format !== 'text';
        return (
          <div key={field.key} className={`space-y-1 min-w-0 ${field.key === 'orgName' ? 'sm:col-span-2' : ''}`}>
            <label htmlFor={id} className="block text-[11px] font-bold text-[#4E5C70]">
              {field.label}
              {field.optional && kind === 'account' && field.key === 'kpp' ? ' (для ИП необязательно)' : field.optional ? ' (необязательно)' : ''}
            </label>
            <input
              id={id}
              type={field.format === 'phone' ? 'tel' : 'text'}
              inputMode={numeric ? (field.format === 'phone' ? 'tel' : 'numeric') : undefined}
              autoComplete="off"
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              maxLength={field.format === 'text' ? field.maxLength : 40}
              onChange={(e) => set(field.key, e.target.value)}
              onBlur={(e) => {
                if (field.format === 'phone' || field.format === 'card') set(field.key, displayValue(field, e.target.value));
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              className={`w-full neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none ${numeric ? 'font-mono' : ''}`}
            />
            {error && (
              <p id={`${id}-error`} className="text-[11px] font-bold text-danger">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
