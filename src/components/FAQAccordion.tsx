import React, { useId } from 'react';
import { ChevronDown, CheckCircle2, HelpCircle } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';

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
  // The question says whether its answer is open and which panel it opens (audit 07.10, finding 36)
  const idPrefix = useId();
  if (items.length === 0) {
    return (
      <div className="neu-flat rounded-2xl p-6 text-center space-y-2 text-text-secondary">
        <HelpCircle className="w-8 h-8 mx-auto text-[#BAC5D5]" />
        <p className="font-bold text-sm text-text-primary">{emptyMessage}</p>
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
        const panelId = `${idPrefix}-answer-${items.indexOf(item)}`;

        return (
          <div
            key={item.id}
            className="rounded-2xl transition-all duration-200 overflow-hidden"
          >
            {/* Accordion Header styled with neu-button */}
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? panelId : undefined}
              className={`w-full p-3.5 sm:p-4 rounded-2xl flex items-start justify-between gap-3 text-left transition-all duration-200 cursor-pointer ${
                isExpanded
                  ? 'neu-pill-active'
                  : 'neu-button'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                <span className="text-xs sm:text-sm font-extrabold text-text-primary leading-snug">
                  {item.question}
                </span>
              </div>

              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 ${
                  isExpanded
                    ? 'neu-fill-accent rotate-180'
                    : 'neu-inset text-accent'
                }`}
              >
                <ChevronDown aria-hidden="true" className={`w-4 h-4 ${isExpanded ? 'text-white' : 'text-accent'}`} />
              </div>
            </button>

            {/* Accordion Answer Panel styled with neu-inset */}
            <AnimatePresence>
              {isExpanded && (
                <m.div
                  id={panelId}
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="neu-inset rounded-2xl p-4 space-y-3">
                    <p className="text-xs sm:text-[13px] text-text-secondary leading-relaxed font-medium">
                      {item.answer}
                    </p>

                    {item.highlights && item.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 neu-divider-t">
                        {item.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="neu-tone-success px-2.5 py-1 rounded-xl text-[11px] font-bold text-success flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                            <span>{h}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
