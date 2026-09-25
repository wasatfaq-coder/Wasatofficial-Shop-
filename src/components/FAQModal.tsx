import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  X,
  Truck,
  RotateCcw,
  CreditCard,
  ShieldCheck,
  Ruler,
  Search,
  MessageSquare,
  Sparkles,
  PhoneCall,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FAQAccordion, FAQAccordionItem } from './FAQAccordion';

type FAQCategory = 'delivery' | 'fitting' | 'returns' | 'payment' | 'warranty' | 'sizing';

type FAQItem = FAQAccordionItem & {
  category: FAQCategory;
};

const FAQ_DATA: FAQItem[] = [
  {
    id: 'del-1',
    category: 'delivery',
    question: 'Какие варианты доставки доступны и сколько это занимает?',
    answer:
      'Мы доставляем заказы двумя удобными способами: собственной экспресс-курьерской службой с примеркой (1-2 дня по Москве и Санкт-Петербургу, 2-4 дня по РФ) и в пункты выдачи заказов СДЭК и Boxberry (от 2 до 5 рабочих дней). При заказе от 15 000 ₽ курьерская доставка осуществляется бесплатно.',
    highlights: ['Бесплатно от 15 000 ₽', '1-2 дня экспресс-курьер', 'СДЭК и Boxberry по всей России'],
  },
  {
    id: 'del-2',
    category: 'delivery',
    question: 'Как отслеживать статус и передвижение курьера в реальном времени?',
    answer:
      'Каждому заказу присваивается уникальный трек-номер (формата MS-XXXX). В разделе «История заказов» доступна интерактивная карта трекинга с точным отображением маршрута автомобиля курьера, дорожной обстановки и расчетного времени прибытия.',
    highlights: ['Интерактивная карта', 'Прямой контакт с курьером', 'Обновление статуса в реальном времени'],
  },
  {
    id: 'fit-1',
    category: 'fitting',
    question: 'Как работает примерка перед покупкой?',
    answer:
      'При выборе курьерской доставки вам предоставляется 15 минут на бесплатную спокойную примерку всех доставленных вещей в комфортной обстановке. Вы можете примерить смежные размеры и фасоны, после чего оплатить только те позиции, которые вам идеально подошли (частичный выкуп).',
    highlights: ['15 минут бесплатной примерки', 'Частичный выкуп', 'Возможность заказать смежные размеры'],
  },
  {
    id: 'ret-1',
    category: 'returns',
    question: 'Каковы условия и сроки возврата товара (гарантия 14 дней)?',
    answer:
      'В соответствии с законодательством РФ и стандартами MANSTYLE, вы можете вернуть или обменять неподошедший товар надлежащего качества в течение 14 дней с момента получения. Главное условие — сохранение товарного вида, фабричных пломб, ярлыков и оригинальной упаковки.',
    highlights: ['14 дней на возврат', 'Быстрое оформление онлайн', 'Возврат средств на карту за 1-3 рабочих дня'],
  },
  {
    id: 'ret-2',
    category: 'returns',
    question: 'Как быстро возвращаются деньги за возвращенный товар?',
    answer:
      'После проверки и приема возврата на нашем центральном складе возврат денежных средств инициируется мгновенно. Срок зачисления на вашу банковскую карту обычно составляет от 1 до 3 рабочих дней в зависимости от вашего банка-эмитента.',
    highlights: ['Мгновенная отправка возврата', 'СМС и email уведомления'],
  },
  {
    id: 'pay-1',
    category: 'payment',
    question: 'Какие способы оплаты поддерживаются?',
    answer:
      'Мы принимаем онлайн-оплату банковскими картами любых банков РФ (МИР, Visa, MasterCard), Систему быстрых платежей (СБП) по QR-коду без комиссии, а также оплату картой или наличными курьеру при получении после примерки.',
    highlights: ['МИР, Visa, MasterCard', 'СБП по QR-коду', 'Оплата при получении курьеру'],
  },
  {
    id: 'pay-2',
    category: 'payment',
    question: 'Предоставляется ли официальный кассовый чек?',
    answer:
      'Да, сразу после оплаты электронный фискальный чек (54-ФЗ) направляется на указанный в профиле адрес электронной почты. В панели администратора и истории заказов также доступна официальная товарная накладная с печатью для печати или загрузки в PDF.',
    highlights: ['Чек 54-ФЗ на email', 'PDF накладная с реквизитами'],
  },
  {
    id: 'war-1',
    category: 'warranty',
    question: 'Какая гарантия предоставляется на изделия MANSTYLE?',
    answer:
      'Мы предоставляем официальную гарантию качества 6 месяцев на всю линейку мужской одежды и обуви. Гарантия покрывает прочность швов, надежность премиальной металлической фурнитуры (молнии, кнопки, пуговицы) и стойкость натуральных красителей при соблюдении рекомендаций по уходу.',
    highlights: ['6 месяцев гарантии', 'Премиальная фурнитура', '100% контроль качества перед отправкой'],
  },
  {
    id: 'war-2',
    category: 'warranty',
    question: 'Из каких тканей шьется коллекция MANSTYLE?',
    answer:
      'Для пошива используются исключительно сертифицированные премиальные ткани: 100% египетский длинноволокнистый хлопок, тонкорунная шерсть мериноса Super 120s–150s, натуральный лен и премиальный шелк европейских мануфактур.',
    highlights: ['Натуральные гипоаллергенные ткани', 'Высокая износостойкость'],
  },
  {
    id: 'siz-1',
    category: 'sizing',
    question: 'Как безошибочно подобрать свой российский размер?',
    answer:
      'В каждой карточке товара и в профиле встроен умный «Калькулятор силуэта и подбора по российским лекалам». Укажите свой рост, вес и тип телосложения — система с точностью до 98% определит ваш идеальный размер и подскажет посадку модели (Slim Fit, Regular или Relaxed).',
    highlights: ['Точность подбора 98%', 'Российские ГОСТ лекала (46-56)', 'Учет индивидуальных пропорций'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'Все темы', icon: HelpCircle },
  { id: 'delivery', label: 'Доставка', icon: Truck },
  { id: 'fitting', label: 'Примерка', icon: Sparkles },
  { id: 'returns', label: 'Возврат (14 дней)', icon: RotateCcw },
  { id: 'payment', label: 'Оплата', icon: CreditCard },
  { id: 'warranty', label: 'Гарантия', icon: ShieldCheck },
  { id: 'sizing', label: 'Размеры', icon: Ruler },
];

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSupportChat?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const FAQModal: React.FC<FAQModalProps> = ({
  isOpen,
  onClose,
  onOpenSupportChat,
  onShowToast,
}) => {
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
    return FAQ_DATA.filter((item) => {
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
  }, [selectedCategory, searchQuery]);

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
              <div className="w-10 h-10 rounded-2xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <HelpCircle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#2D3A4E]">
                  Часто задаваемые вопросы (FAQ)
                </h3>
                <p className="text-[11px] text-[#5C6B80]">
                  Всё о доставке, примерке, возврате 14 дней и гарантиях качества
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-transform"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative shrink-0">
            <Search className="w-4 h-4 text-[#5C6B80] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Поиск по вопросам и ответам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2.5 pl-10 pr-4 rounded-xl neu-inset text-xs text-[#2D3A4E] placeholder-[#5C6B80]/70 outline-none bg-[#E3E8EF]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-[#5C6B80] hover:text-[#2D3A4E] text-xs font-bold"
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
                      ? 'neu-button text-[#5F6ED0] bg-white/70 shadow-sm'
                      : 'text-[#5C6B80] hover:text-[#2D3A4E] hover:bg-white/30'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#5F6ED0]' : 'text-[#5C6B80]'}`} />
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
          <div className="neu-card rounded-2xl p-3.5 flex items-center justify-between gap-3 shrink-0 bg-gradient-to-r from-[#E3E8EF] to-[#D8E1EC] border border-white/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2D3A4E] truncate">Не нашли ответ на свой вопрос?</p>
                <p className="text-[10px] text-[#5C6B80]">Служба заботы отвечает за 1 минуту</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href="tel:88005553535"
                className="w-8 h-8 rounded-xl neu-button text-[#2D3A4E] hover:text-[#5F6ED0] flex items-center justify-center cursor-pointer transition-colors"
                title="Позвонить на горячую линию"
              >
                <PhoneCall className="w-3.5 h-3.5" />
              </a>

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
              ) : (
                <a
                  href="mailto:support@manstyle-store.ru"
                  className="neu-button px-3 py-1.5 rounded-xl text-xs font-bold text-[#5F6ED0] cursor-pointer"
                >
                  support@manstyle-store.ru
                </a>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
