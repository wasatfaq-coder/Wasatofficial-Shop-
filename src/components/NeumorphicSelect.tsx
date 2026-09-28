import React from 'react';
import { Select } from '@base-ui/react/select';
import { ChevronDown, Check } from 'lucide-react';

export interface NeumorphicSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface NeumorphicSelectProps {
  value: string;
  options: (NeumorphicSelectOption | string)[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  triggerClassName?: string;
  menuClassName?: string;
  variant?: 'inset' | 'button';
  placement?: 'bottom' | 'top';
  prefix?: string;
  triggerLabel?: string;
  /** Shown in the open menu when there are no options */
  emptyText?: string;
  /** For a `<label htmlFor>` */
  id?: string;
  /** Name for screen readers when there is no visible label */
  ariaLabel?: string;
}

/**
 * Dropdown on Base UI Select (headless): listbox roles, arrow keys, typeahead, Escape, focus return.
 * The menu is portaled above windows (z-[260]) so a scrolling modal no longer clips it; styles stay neu-*.
 */
export const NeumorphicSelect: React.FC<NeumorphicSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Выберите...',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  disabled = false,
  variant = 'inset',
  placement = 'bottom',
  prefix,
  triggerLabel,
  emptyText = 'Список пуст',
  id,
  ariaLabel,
}) => {
  // Normalize options to object format
  const normalizedOptions: NeumorphicSelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );
  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const hasPadding = /(^|\s)(p|px|py)-/.test(triggerClassName);

  return (
    <div className={`relative ${className}`}>
      <Select.Root
        value={selectedOption ? value : null}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
        disabled={disabled}
        modal={false}
      >
        <Select.Trigger
          id={id}
          // A combobox is named by its label, not by the text inside: the prefix («Категория:») is the name
          aria-label={ariaLabel ?? (prefix ? prefix.replace(/[:\s]+$/, '') : undefined)}
          className={`group w-full ${hasPadding ? '' : 'px-3.5 py-2.5'} ${variant === 'inset' ? 'neu-inset' : 'neu-button'} ${
            triggerClassName || 'rounded-xl'
          } text-xs font-bold text-[#2D3A4E] flex items-center justify-between gap-2 transition-all cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
            <span className="truncate">
              {prefix && <span className="text-[#4E5C70] font-medium mr-1.5">{prefix}</span>}
              <span className={prefix ? 'font-black text-[#2D3A4E]' : selectedOption || triggerLabel ? '' : 'text-[#4E5C70]'}>
                {triggerLabel || (selectedOption ? selectedOption.label : placeholder)}
              </span>
            </span>
            {selectedOption?.badge && (
              <span
                className={`${
                  variant === 'inset' ? 'neu-button' : 'neu-flat'
                } text-[11px] px-2 py-0.5 rounded-md text-accent font-black shrink-0`}
              >
                {selectedOption.badge}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="w-4 h-4 text-[#4E5C70] shrink-0 transition-transform duration-200 group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-accent"
          />
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner
            data-floating-layer=""
            className="z-[260] outline-none"
            side={placement === 'top' ? 'top' : 'bottom'}
            sideOffset={6}
            collisionPadding={8}
            alignItemWithTrigger={false}
          >
            <Select.Popup
              className={`min-w-[var(--anchor-width)] max-w-[calc(100vw-16px)] p-1.5 neu-dropdown rounded-2xl border border-white/80 outline-none transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 ${menuClassName}`}
            >
              <Select.List className="space-y-1 max-h-60 overflow-y-auto no-scrollbar outline-none">
                {normalizedOptions.length === 0 && (
                  <p className="px-3 py-2.5 text-[11px] font-bold text-[#4E5C70] leading-snug">{emptyText}</p>
                )}
                {normalizedOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <Select.Item
                      key={opt.value}
                      value={opt.value}
                      label={opt.label}
                      className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 cursor-pointer select-none outline-none data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-accent/60 ${
                        isSelected ? 'neu-pill-active font-black' : 'text-[#2D3A4E] font-bold data-[highlighted]:text-accent'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span className="min-w-0 flex-1">
                          <Select.ItemText className="block leading-snug text-left">{opt.label}</Select.ItemText>
                          {opt.sublabel && (
                            <span className="block text-[11px] text-[#4E5C70] font-normal mt-0.5 leading-tight">
                              {opt.sublabel}
                            </span>
                          )}
                        </span>
                        {opt.badge && (
                          <span className="neu-flat text-[11px] px-1.5 py-0.5 rounded text-accent font-black shrink-0 whitespace-nowrap">
                            {opt.badge}
                          </span>
                        )}
                      </span>
                      {isSelected ? (
                        <span className="w-5 h-5 rounded-full neu-fill-accent text-white flex items-center justify-center shrink-0" aria-hidden="true">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full neu-inset shrink-0" aria-hidden="true" />
                      )}
                    </Select.Item>
                  );
                })}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
};
