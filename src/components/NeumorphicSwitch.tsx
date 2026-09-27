import React from 'react';

interface NeumorphicSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Подпись для экранного диктора (видимый текст рядом со свитчем его не заменяет) */
  label: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Переключатель вкл/выкл: `button role="switch"`, работает с клавиатуры (Tab, пробел, Enter).
 * Выключен — вдавленная лунка, включен — графитовая заливка.
 */
export const NeumorphicSwitch: React.FC<NeumorphicSwitchProps> = ({
  checked,
  onChange,
  label,
  id,
  disabled = false,
  className = '',
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-12 h-7 rounded-full p-1 shrink-0 flex items-center transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 ${
      checked ? 'neu-fill-accent' : 'neu-inset'
    } ${className}`}
  >
    <span
      aria-hidden="true"
      className={`w-5 h-5 rounded-full neu-flat-sm border border-white/90 transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);
