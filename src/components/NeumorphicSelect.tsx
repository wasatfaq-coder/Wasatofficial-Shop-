import React, { useState, useRef, useEffect } from 'react';
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
}

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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options to object format
  const normalizedOptions: NeumorphicSelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${
          triggerClassName?.includes('p-') || triggerClassName?.includes('px-') || triggerClassName?.includes('py-')
            ? ''
            : 'px-3.5 py-2.5'
        } ${variant === 'inset' ? 'neu-inset' : 'neu-button'} ${
          triggerClassName || 'rounded-xl'
        } text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF] flex items-center justify-between gap-2 transition-all cursor-pointer text-left focus:outline-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#BAC5D5]/30'
        } ${isOpen ? 'ring-2 ring-[#5F6ED0]/50' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">
            {prefix && (
              <span className="text-[#5C6B80] font-medium mr-1.5">{prefix}</span>
            )}
            <span className={prefix ? 'font-black text-[#2D3A4E]' : ''}>
              {triggerLabel || (selectedOption ? selectedOption.label : placeholder)}
            </span>
          </span>
          {selectedOption?.badge && (
            <span
              className={`${
                variant === 'inset' ? 'neu-button' : 'neu-flat'
              } text-[10px] px-2 py-0.5 rounded-md text-[#5F6ED0] font-black shrink-0`}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#5C6B80] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#5F6ED0]' : ''
          }`}
        />
      </button>

      {/* Neumorphic Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 left-0 right-0 p-1.5 neu-dropdown rounded-2xl bg-[#E3E8EF] border border-white/80 space-y-1 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150 ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${menuClassName}`}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full px-3 py-2 rounded-xl text-left text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'neu-pill-active font-black'
                    : 'text-[#2D3A4E] font-bold hover:bg-[#BAC5D5]/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug text-left">{opt.label}</p>
                    {opt.sublabel && (
                      <p className="text-[10px] text-[#5C6B80] font-normal mt-0.5 leading-tight">
                        {opt.sublabel}
                      </p>
                    )}
                  </div>
                  {opt.badge && (
                    <span className="neu-flat text-[9px] px-1.5 py-0.5 rounded text-[#5F6ED0] font-black shrink-0 whitespace-nowrap">
                      {opt.badge}
                    </span>
                  )}
                </div>
                {isSelected ? (
                  <div className="w-5 h-5 rounded-full neu-fill-accent text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full neu-inset shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
