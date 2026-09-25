import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  X,
  Search,
  MessageSquare,
  PhoneCall,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAQAccordion, FAQAccordionItem } from './FAQAccordion';
import { NotConfigured } from './NotConfigured';
import type { StoreFaqItem } from '../types';
import { telHref } from '../utils/storeContacts';
import { formatDays } from '../utils/pluralize';

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Store policies substituted into the answers ({FREE_DELIVERY}, {RETURN_DAYS}) */
  freeDeliveryThreshold?: number;
  returnPeriodDays?: number;
  /** Store phone from Admin → «Витрина»; the call button is hidden when empty */
  storePhone?: string;
  /** Store email from Admin → «Витрина»; hidden when empty */
  storeEmail?: string;
  onOpenSupportChat?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Questions from Admin → «FAQ»; none → «Вопросы и ответы: не настроено» */
  faqItems?: StoreFaqItem[];
}

export const FAQModal: React.FC<FAQModalProps> = ({
  isOpen,
  onClose,
  onOpenSupportChat,
  onShowToast,
  freeDeliveryThreshold = 5000,
  returnPeriodDays = 14,
  storePhone = '',
  storeEmail = '',
  faqItems = [],
}) => {
  // {FREE_DELIVERY} and {RETURN_DAYS} in the admin's texts are replaced with the store settings
  const faqData = useMemo<FAQAccordionItem[]>(() => {
    const fill = (text: string) =>
      text
        .split('{FREE_DELIVERY}').join(freeDeliveryThreshold.toLocaleString('ru-RU'))
        .split('{RETURN_DAYS} дней').join(formatDays(returnPeriodDays));
    return faqItems
      .filter((item) => item.isActive !== false && item.question.trim())
      .map((item) => ({ id: item.id, question: fill(item.question), answer: fill(item.answer) }));
  }, [faqItems, freeDeliveryThreshold, returnPeriodDays]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleAccordion = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredQuestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faqData.filter(
      (item) => !q || item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    );
  }, [faqData, searchQuery]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="neu-modal rounded-3xl p-4 sm:p-6 max-w-2xl w-full max-h-[88vh] flex flex-col space-y-4 text-[#2D3A4E] border border-white/80 relative z-10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-accent shrink-0">
                <HelpCircle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#2D3A4E]">
                  Часто задаваемые вопросы (FAQ)
                </h3>
                <p className="text-[11px] text-[#4E5C70]">Ответы магазина на частые вопросы</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform"
              title="Закрыть"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative shrink-0">
            <Search className="w-4 h-4 text-[#4E5C70] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Поиск по вопросам и ответам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2.5 pl-10 pr-4 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder:text-[#56647A] bg-[#E3E8EF]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-[#4E5C70] hover:text-[#2D3A4E] text-xs font-bold"
              >
                Очистить
              </button>
            )}
          </div>

          {/* Accordion List (Scrollable Area) */}
          <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
            {faqData.length === 0 ? (
              <NotConfigured
                title="Вопросы и ответы"
                hint="Задайте свой вопрос в чате поддержки — мы ответим."
              />
            ) : (
              <FAQAccordion
                items={filteredQuestions}
                expandedIds={expandedIds}
                onToggle={toggleAccordion}
                emptyMessage="Вопрос не найден"
              />
            )}
          </div>

          {/* Footer Call to Action (Support Chat & Call) */}
          <div className="neu-flat rounded-2xl p-3.5 flex items-center justify-between gap-3 shrink-0 bg-gradient-to-r from-[#E3E8EF] to-[#D8E1EC] border border-white/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">Не нашли ответ на свой вопрос?</p>
                <p className="text-[11px] text-[#4E5C70]">Напишите нам в чат поддержки</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {storePhone && (
                <a
                  href={telHref(storePhone)}
                  className="w-8 h-8 rounded-xl neu-button text-[#2D3A4E] hover:text-accent flex items-center justify-center cursor-pointer transition-colors"
                  title={`Позвонить: ${storePhone}`}
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                </a>
              )}

              {onOpenSupportChat ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSupportChat();
                  }}
                  className="neu-button-accent px-3 py-1.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                >
                  <span>Написать в чат</span>
                </button>
              ) : storeEmail ? (
                <a
                  href={`mailto:${storeEmail}`}
                  className="neu-button px-3 py-1.5 rounded-xl text-xs font-bold text-accent cursor-pointer"
                >
                  {storeEmail}
                </a>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
