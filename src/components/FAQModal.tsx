import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  X,
  Truck,
  RotateCcw,
  Ruler,
  Search,
  MessageSquare,
  PhoneCall,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAQAccordion, FAQAccordionItem } from './FAQAccordion';
import { telHref } from '../utils/storeContacts';
import { formatDays } from '../utils/pluralize';

type FAQCategory = 'delivery' | 'returns' | 'sizing';

type FAQItem = FAQAccordionItem & {
  category: FAQCategory;
};

// Only answers backed by the store settings (Admin → «Витрина», «Доставка и ПВЗ») or by what the app
// really does. Policies the admin panel does not configure (fitting, payment, receipts, warranty,
// fabrics) are not promised here.
const FAQ_DATA: FAQItem[] = [
  {
    id: 'del-1',
    category: 'delivery',
    question: 'Какие способы доставки доступны?',
    answer:
      'Способы доставки, сроки и стоимость для вашего заказа показаны на шаге оформления. При заказе от {FREE_DELIVERY} ₽ доставка бесплатная.',
    highlights: ['Бесплатно от {FREE_DELIVERY} ₽', 'Стоимость видна при оформлении'],
  },
  {
    id: 'del-2',
    category: 'delivery',
    question: 'Как узнать статус заказа?',
    answer:
      'Каждому заказу присваивается номер формата WS-XXXXXXXX. Статус и этапы доставки видны в профиле, в разделе «История заказов»; их обновляет магазин.',
    highlights: ['Статус в профиле'],
  },
  {
    id: 'ret-1',
    category: 'returns',
    question: 'Каковы условия и сроки возврата товара?',
    answer:
      'Вы можете вернуть или обменять неподошедший товар надлежащего качества в течение {RETURN_DAYS} дней с момента получения при сохранении товарного вида, ярлыков и упаковки. Чтобы оформить возврат, напишите нам в чат поддержки.',
    highlights: ['{RETURN_DAYS} дней на возврат'],
  },
  {
    id: 'siz-1',
    category: 'sizing',
    question: 'Как подобрать свой размер?',
    answer:
      'В карточке товара есть калькулятор размера: укажите рост и вес, и он подскажет размер по российской размерной сетке. Если сомневаетесь, спросите в чате поддержки.',
    highlights: ['Калькулятор в карточке товара'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'Все темы', icon: HelpCircle },
  { id: 'delivery', label: 'Доставка', icon: Truck },
  { id: 'returns', label: 'Возврат', icon: RotateCcw },
  { id: 'sizing', label: 'Размеры', icon: Ruler },
];

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
}) => {
  const faqData = useMemo<FAQItem[]>(() => {
    const fill = (text: string) =>
      text
        .split('{FREE_DELIVERY}').join(freeDeliveryThreshold.toLocaleString('ru-RU'))
        .split('{RETURN_DAYS} дней').join(formatDays(returnPeriodDays));
    return FAQ_DATA.map((item) => ({
      ...item,
      question: fill(item.question),
      answer: fill(item.answer),
      highlights: item.highlights?.map(fill),
    }));
  }, [freeDeliveryThreshold, returnPeriodDays]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'del-1': true,
    'ret-1': true,
  });

  const toggleAccordion = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredQuestions = useMemo(() => {
    return faqData.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        item.category === selectedCategory ||
        (selectedCategory === 'fitting' && item.category === 'fitting');
      const matchesSearch =
        !searchQuery.trim() ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.highlights?.some((h) => h.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [faqData, selectedCategory, searchQuery]);

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
                <p className="text-[11px] text-[#4E5C70]">
                  Все о доставке, примерке, возврате и гарантиях качества
                </p>
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

          {/* Category Pills (horizontal scroll) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer active:scale-95 ${
                    isActive
                      ? 'neu-pill-active'
                      : 'text-[#4E5C70] hover:text-[#2D3A4E] hover:bg-white/30'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : 'text-[#4E5C70]'}`} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Accordion List (Scrollable Area) */}
          <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
            <FAQAccordion
              items={filteredQuestions}
              expandedIds={expandedIds}
              onToggle={toggleAccordion}
              emptyMessage="Вопрос не найден"
            />
          </div>

          {/* Footer Call to Action (Support Chat & Call) */}
          <div className="neu-flat rounded-2xl p-3.5 flex items-center justify-between gap-3 shrink-0 bg-gradient-to-r from-[#E3E8EF] to-[#D8E1EC] border border-white/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">Не нашли ответ на свой вопрос?</p>
                <p className="text-[11px] text-[#4E5C70]">Служба заботы отвечает за 1 минуту</p>
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
