import React from 'react';
import type { StorefrontSettings } from '../../../types';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import { AdminHint } from '../AdminHint';
import type { StorefrontSectionProps } from './storefrontForm';

/** Поля настроек, в которых лежит строка */
export type StorefrontTextKey = {
  [K in keyof StorefrontSettings]-?: StorefrontSettings[K] extends string | undefined ? K : never;
}[keyof StorefrontSettings];

const labelClass = 'block text-xs font-bold text-[#4E5C70] mb-1';
const inputClass = 'w-full min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]';

/** Блок раздела: заголовок с иконкой и необязательной подсказкой */
export const StorefrontCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, icon, hint, children }) => (
  <section className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5">
    <div className="flex items-center gap-1 min-w-0">
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
        {icon}
        {title}
      </h4>
      {hint && <AdminHint label={title}>{hint}</AdminHint>}
    </div>
    {children}
  </section>
);

interface StorefrontTextFieldProps extends StorefrontSectionProps {
  name: StorefrontTextKey;
  label: string;
  placeholder?: string;
  /** Тип поля ввода: для телефона и почты подставится нужная клавиатура */
  type?: 'text' | 'tel' | 'email';
  autoComplete?: string;
  /** Моноширинный шрифт: номера и коды */
  mono?: boolean;
  /** Несколько строк */
  rows?: number;
  hint?: string;
  className?: string;
}

/** Текстовое поле формы: видимая подпись, значение — прямо из настроек (подставленных запасных текстов нет) */
export const StorefrontTextField: React.FC<StorefrontTextFieldProps> = ({
  settings,
  patch,
  name,
  label,
  placeholder,
  type = 'text',
  autoComplete = 'off',
  mono = false,
  rows,
  hint,
  className = '',
}) => {
  const id = `storefront-${name}`;
  const value = settings[name] ?? '';
  const change = (next: string) => patch({ [name]: next } as Partial<StorefrontSettings>);
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {hint && <AdminHint label={label}>{hint}</AdminHint>}
      </div>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => change(e.target.value)}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => change(e.target.value)}
          className={`${inputClass} ${mono ? 'font-mono' : ''}`}
        />
      )}
    </div>
  );
};

/** Строка с переключателем: подпись и состояние словами, подсказка, `role="switch"` */
export const StorefrontSwitchRow: React.FC<{
  id: string;
  label: string;
  status: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
}> = ({ id, label, status, hint, checked, onChange, icon }) => (
  <div className="neu-inset p-3 rounded-2xl flex items-center justify-between gap-2.5">
    <label htmlFor={id} className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
      <span
        className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 ${
          checked ? 'text-accent' : 'text-[#4E5C70]'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-xs font-extrabold text-[#2D3A4E] block">{label}</span>
        <span className="text-xs text-[#4E5C70] block">{status}</span>
      </span>
    </label>
    <AdminHint label={label}>{hint}</AdminHint>
    <NeumorphicSwitch id={id} checked={checked} onChange={onChange} label={label} />
  </div>
);

/** Поле «число дней»: пусто — «не задано» (разбор числа — `parseWholeNumber`) */
export const StorefrontDaysField: React.FC<{
  id: string;
  label: string;
  hint: string;
  value: number | undefined;
  max: number;
  placeholder: string;
  note: string;
  onChange: (raw: string) => void;
}> = ({ id, label, hint, value, max, placeholder, note, onChange }) => (
  <div className="neu-inset p-3 rounded-2xl space-y-1.5">
    <div className="flex items-center gap-1">
      <label htmlFor={id} className="block text-xs font-extrabold text-[#2D3A4E]">
        {label}
      </label>
      <AdminHint label={label}>{hint}</AdminHint>
    </div>
    <div className="relative max-w-[12rem]">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value ?? ''}
        placeholder={placeholder}
        aria-describedby={`${id}-note`}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 neu-inset rounded-xl text-xs font-extrabold text-accent pr-10"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">дн.</span>
    </div>
    <p id={`${id}-note`} className="text-xs text-[#4E5C70]">
      {note}
    </p>
  </div>
);
