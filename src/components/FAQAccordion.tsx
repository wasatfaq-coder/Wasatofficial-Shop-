import React from 'react';
import { ChevronDown, CheckCircle2, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FAQAccordionItem {
  id: string;
  category?: string;
  question: string;
  answer: string;
  highlights?: string[];
}

interface FAQAccordionProps {
  items: FAQAccordionItem[];
  expandedIds: Record<string, boolean>;
  onToggle: (id: string) => void;
  emptyMessage?: string;
}

export const FAQAccordion: React.FC<FAQAccordionProps> = ({
  items,
  expandedIds,
  onToggle,
  emptyMessage = 'Вопросы по вашему запросу не найдены',
}) => {
  if (items.length === 0) {
    return (
      <div className="neu-card rounded-2xl p-6 text-center space-y-2 text-[#5C6B80]">
        <HelpCircle className="w-8 h-8 mx-auto text-[#BAC5D5]" />
        <p className="font-bold text-sm text-[#2D3A4E]">{emptyMessage}</p>
        <p className="text-xs">
          Попробуйте изменить формулировку запроса или обратитесь напрямую в нашу службу заботы.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isExpanded = !!expandedIds[item.id];

        return (
          <div
            key={item.id}
            className="rounded-2xl transition-all duration-200 overflow-hidden"
          >
            {/* Accordion Header styled with neu-button */}
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className={`w-full p-3.5 sm:p-4 rounded-2xl neu-button flex items-start justify-between gap-3 text-left transition-all duration-200 cursor-pointer active:scale-[0.99] ${
                isExpanded
                  ? 'border border-[#5F6ED0]/30 shadow-md bg-white/80'
                  : 'hover:border-white/90'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="w-2 h-2 rounded-full bg-[#5F6ED0] mt-1.5 shrink-0" />
                <span className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] leading-snug">
                  {item.question}
                </span>
              </div>

              <div
                className={`w-7 h-7 rounded-xl neu-inset flex items-center justify-center shrink-0 transition-transform duration-300 ${
                  isExpanded
                    ? 'rotate-180 text-white bg-[#5F6ED0] shadow-sm'
                    : 'text-[#5F6ED0] bg-[#E3E8EF]'
                }`}
              >
                <ChevronDown className={`w-4 h-4 ${isExpanded ? 'text-white' : 'text-[#5F6ED0]'}`} />
              </div>
            </button>

            {/* Accordion Answer Panel styled with neu-inset */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] border border-white/60 shadow-inner space-y-3">
                    <p className="text-xs sm:text-[13px] text-[#4A5568] leading-relaxed font-medium">
                      {item.answer}
                    </p>

                    {item.highlights && item.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-[#BAC5D5]/40">
                        {item.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="neu-flat px-2.5 py-1 rounded-xl text-[10px] sm:text-[11px] font-bold text-emerald-800 bg-white/80 border border-emerald-300/40 flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{h}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
