import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, RotateCcw, Sparkles } from 'lucide-react';

export interface QuickEditFieldConfig {
  key: string;
  title: string;
  fieldLabel: string;
  value: string;
  placeholder?: string;
  isMultiline?: boolean;
  rows?: number;
  description?: string;
  badge?: string;
  inputType?: 'text' | 'number' | 'email';
  unit?: string;
  numberMin?: number;
  numberMax?: number;
  numberStep?: number;
}

interface QuickTextEditModalProps {
  config: QuickEditFieldConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string, newValue: string) => void;
}

export const QuickTextEditModal: React.FC<QuickTextEditModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
}) => {
  const [currentValue, setCurrentValue] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (config && isOpen) {
      setCurrentValue(config.value ?? '');
      // Auto-focus the input/textarea on open
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Move cursor to the end
          if ('setSelectionRange' in inputRef.current) {
            const len = inputRef.current.value.length;
            inputRef.current.setSelectionRange(len, len);
          }
        }
      }, 50);
    }
  }, [config, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !config) return null;

  const handleSave = () => {
    onSave(config.key, currentValue);
    onClose();
  };

  const handleResetToInitial = () => {
    setCurrentValue(config.value ?? '');
  };

  const isChanged = currentValue !== (config.value ?? '');

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg neu-flat rounded-3xl bg-[#E3E8EF] p-5 sm:p-6 space-y-4 border border-white/80 shadow-2xl relative animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-[#BAC5D5]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-[#5F6ED0] bg-[#E3E8EF] shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-[#2D3A4E]">
                  {config.title}
                </h3>
                {config.badge && (
                  <span className="text-[10px] font-black text-[#5F6ED0] neu-inset px-2 py-0.5 rounded-md">
                    {config.badge}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#5C6B80] font-medium mt-0.5">
                {config.fieldLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full neu-flat-sm flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all shrink-0 cursor-pointer bg-[#E3E8EF]"
            title="Закрыть (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Description / Context Help */}
        {config.description && (
          <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF]/80 text-[11px] text-[#5C6B80] leading-relaxed flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#5F6ED0] shrink-0 mt-0.5" />
            <span>{config.description}</span>
          </div>
        )}

        {/* Input Area */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#5C6B80] px-1">
            <span>Текстовое значение</span>
            <div className="flex items-center gap-2">
              {isChanged && (
                <button
                  type="button"
                  onClick={handleResetToInitial}
                  className="text-[#5F6ED0] hover:underline flex items-center gap-1 cursor-pointer"
                  title="Сбросить к исходному значению"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Вернуть исходное</span>
                </button>
              )}
              <span>{currentValue.length} симв.</span>
            </div>
          </div>

          {config.isMultiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              rows={config.rows || 4}
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              placeholder={config.placeholder || 'Введите текст...'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full px-3.5 py-3 neu-inset rounded-2xl text-xs sm:text-sm text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none resize-y leading-relaxed font-medium"
            />
          ) : (
            <div className="relative flex items-center">
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={config.inputType || 'text'}
                min={config.numberMin}
                max={config.numberMax}
                step={config.numberStep}
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder={config.placeholder || 'Введите значение...'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                className={`w-full px-3.5 py-2.5 neu-inset rounded-xl text-xs sm:text-sm text-[#2D3A4E] bg-[#E3E8EF] focus:outline-none font-medium ${
                  config.unit ? 'pr-12' : ''
                }`}
              />
              {config.unit && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5C6B80]">
                  {config.unit}
                </span>
              )}
            </div>
          )}
          <span className="text-[10px] text-[#5C6B80] block px-1">
            {config.isMultiline
              ? 'Нажмите Ctrl + Enter для быстрого сохранения'
              : 'Нажмите Enter для быстрого сохранения'}
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="py-2.5 px-5 neu-button-accent rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform shadow-md"
          >
            <Check className="w-4 h-4" />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>
    </div>
  );
};
