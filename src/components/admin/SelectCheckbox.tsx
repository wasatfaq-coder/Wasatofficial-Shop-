import React from 'react';
import { Check } from 'lucide-react';

interface SelectCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  /** Что выбирается: «Выбрать заказ WS-1024» */
  label: string;
  className?: string;
}

/**
 * Галочка массового выбора: `button role="checkbox"`, работает с клавиатуры.
 * Зона нажатия 32px при видимом квадрате 20px; не выбрано — выпуклое, выбрано — вдавленное.
 */
export const SelectCheckbox: React.FC<SelectCheckboxProps> = ({ checked, onToggle, label, className = '' }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={label}
    title={label}
    onClick={onToggle}
    className={`p-1.5 -m-1 shrink-0 rounded-xl cursor-pointer group ${className}`}
  >
    <span
      aria-hidden="true"
      className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
        checked ? 'neu-pill-active text-accent' : 'neu-button text-transparent group-hover:text-accent/40'
      }`}
    >
      <Check className="w-3 h-3 stroke-[3]" />
    </span>
  </button>
);
