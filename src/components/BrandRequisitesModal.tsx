import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Building2,
  Phone,
  Mail,
  Send,
  MessageSquare,
  Copy,
  Check,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  Crown,
  Scissors,
  Award,
  PhoneCall,
} from 'lucide-react';
import { StorefrontSettings } from '../types';
import { copyToClipboard as safeCopyToClipboard } from '../utils/clipboard';
import { getLegalDetails, getStoreContacts } from '../utils/storeContacts';

interface BrandRequisitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  storefrontSettings?: StorefrontSettings;
  onOpenSupportChat?: () => void;
}

type TabType = 'concierge' | 'requisites' | 'brand';

export const BrandRequisitesModal: React.FC<BrandRequisitesModalProps> = ({
  isOpen,
  onClose,
  storefrontSettings,
  onOpenSupportChat,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('concierge');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const storeName = storefrontSettings?.storeName || 'MANSTYLE';
  // Demo template contacts/requisites are never shown to customers (see storeContacts.ts)
  const { phone, email, telegram, whatsapp, pickupAddress } = getStoreContacts(storefrontSettings);
  const workingHours = storefrontSettings?.workingHours || 'Ежедневно с 10:00 до 22:00 (Консьерж 24/7)';

  // Legal details
  const legalData = getLegalDetails(storefrontSettings);

  // Concierge content
  const conciergeDescription =
    storefrontSettings?.conciergeDescription ||
    'Персональный ассистент по стилю и сопровождению заказов. Помощь в выборе размера, бронирование закрытых моделей, организация выездной примерки и консультации стилиста.';
  const service1Title = storefrontSettings?.conciergeService1Title || 'Персональный подбор капсулы';
  const service1Desc =
    storefrontSettings?.conciergeService1Desc ||
    'Составление законченного гардероба на сезон или под деловые мероприятия стилистом бутика.';
  const service2Title = storefrontSettings?.conciergeService2Title || 'Выездная примерка на дом и в офис';
  const service2Desc =
    storefrontSettings?.conciergeService2Desc ||
    'Курьер доставит смежные размеры и фасоны с ожиданием до 30 минут без предоплаты.';
  const service3Title = storefrontSettings?.conciergeService3Title || 'Подгонка в ателье бутика';
  const service3Desc =
    storefrontSettings?.conciergeService3Desc ||
    'Бесплатная корректировка длины брюк и посадки пиджака нашим мастером-портным.';

  // Brand content
  const brandPhilosophyTitle =
    storefrontSettings?.brandPhilosophyTitle || `Философия бренда ${storeName}`;
  const brandPhilosophyText =
    storefrontSettings?.brandPhilosophyText ||
    `${storeName} — премиальный бутик мужской одежды, основанный на эстетике сдержанной роскоши («Quiet Luxury») и безупречном архитектурном крое. Мы создаем гардероб вне времени, который подчеркивает статус и харизму мужчины без кричащих логотипов.`;
  const brandMaterialsTitle = storefrontSettings?.brandMaterialsTitle || 'Итальянские ткани';
  const brandMaterialsText =
    storefrontSettings?.brandMaterialsText ||
    'Селективная шерсть Super 150’s от мануфактур Loro Piana и Zegna, длинноволокнистый хлопок Supima и натуральный лен.';
  const brandCraftsmanshipTitle = storefrontSettings?.brandCraftsmanshipTitle || 'Эталонный крой';
  const brandCraftsmanshipText =
    storefrontSettings?.brandCraftsmanshipText ||
    'Каждая модель разработана с учетом анатомических особенностей мужской фигуры. Полуручная сборка и безупречные строчки.';
  const brandGuaranteesTitle = storefrontSettings?.brandGuaranteesTitle || 'Стандарты подлинности и гарантии';
  const brandGuaranteesList =
    storefrontSettings?.brandGuaranteesList && storefrontSettings.brandGuaranteesList.length > 0
      ? storefrontSettings.brandGuaranteesList
      : [
          '100% оригинальность и сертификация каждого изделия.',
          'Расширенная гарантия качества на швы и фурнитуру.',
          'Примерка перед оплатой и легкий возврат без лишних вопросов.',
        ];

  const copyToClipboard = (text: string, key: string) => {
    safeCopyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const requisiteItems = [
    { label: 'Юридическое лицо', value: legalData.companyName, key: 'company' },
    { label: 'ИНН', value: legalData.inn, key: 'inn' },
    { label: 'КПП', value: legalData.kpp, key: 'kpp' },
    { label: 'ОГРН', value: legalData.ogrn, key: 'ogrn' },
    { label: 'Расчетный счет', value: legalData.checkingAccount, key: 'checking' },
    { label: 'Банк', value: legalData.bankName, key: 'bank' },
    { label: 'БИК', value: legalData.bik, key: 'bik' },
    { label: 'Корр. счет', value: legalData.corrAccount, key: 'corr' },
    { label: 'Юридический адрес', value: legalData.legalAddress, key: 'legalAddress' },
    { label: 'Фактический адрес', value: pickupAddress, key: 'pickup' },
    { label: 'ЭДО', value: legalData.edo, key: 'edo' },
    { label: 'Руководитель', value: legalData.ceo, key: 'ceo' },
    { label: 'Email', value: email, key: 'email' },
    { label: 'Телефон', value: phone, key: 'phone' },
  ].filter((item) => item.value);

  const copyAllRequisites = () => {
    const fullText = [
      `РЕКВИЗИТЫ КОМПАНИИ ${storeName}:`,
      ...requisiteItems.map((item) => `${item.label}: ${item.value}`),
    ].join('\n');

    copyToClipboard(fullText, 'all');
  };

  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
  const cleanTg = telegram.replace('@', '');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="requisites-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            key="requisites-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg max-h-[90vh] neu-modal rounded-3xl p-4 sm:p-6 flex flex-col bg-[#E3E8EF] z-10 overflow-hidden border border-white/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#BAC5D5]/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-[#5F6ED0] shrink-0">
                  <Crown className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-[#2D3A4E] tracking-tight truncate">
                    {storeName} • О бренде & Реквизиты
                  </h2>
                  <p className="text-[11px] text-[#5C6B80] font-semibold truncate">
                    Контакты консьерж-сервиса и юридические данные
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full neu-button flex items-center justify-center text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-5 h-5 stroke-[2.2]" />
              </button>
            </div>

            {/* Tab Switcher with Neumorphic spring indicator */}
            <div className="grid grid-cols-3 gap-1.5 p-1 neu-inset rounded-2xl bg-[#E3E8EF] my-3.5 shrink-0">
              {[
                { id: 'concierge', label: 'Консьерж', icon: Sparkles },
                { id: 'requisites', label: 'Реквизиты', icon: Building2 },
                { id: 'brand', label: 'Бренд', icon: Crown },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`relative py-2 px-2 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                      isActive ? 'text-[#5F6ED0]' : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="requisitesTabPill"
                        className="absolute inset-0 rounded-xl neu-button bg-[#E3E8EF] z-0"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto pr-1 space-y-4 custom-scrollbar flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {/* TAB 1: КОНСЬЕРЖ-СЕРВИС И КОНТАКТЫ */}
                  {activeTab === 'concierge' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Concierge Intro Card */}
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="neu-flat-sm px-2.5 py-1 rounded-full text-[10px] font-black text-[#5F6ED0] uppercase tracking-wider inline-flex items-center gap-1 bg-[#E3E8EF]">
                    <Sparkles className="w-3 h-3 text-[#5F6ED0]" />
                    VIP Concierge Service 24/7
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
                </div>
                <p className="text-xs text-[#2D3A4E] font-medium leading-relaxed">
                  {conciergeDescription}
                </p>
              </div>

              {/* Quick Communication Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                {phone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 flex items-center gap-2.5 text-[#2D3A4E] hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
                >
                  <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 group-hover:scale-105 transition-transform">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <span className="text-[10px] text-[#5C6B80] block font-bold uppercase group-hover:text-[#5F6ED0] transition-colors">
                      Позвонить
                    </span>
                    <span className="text-xs font-black truncate block group-hover:text-[#5F6ED0] transition-colors">
                      {phone}
                    </span>
                  </div>
                </a>
                )}

                {whatsapp && (
                  <a
                    href={`https://wa.me/${cleanWhatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 flex items-center gap-2.5 text-[#2D3A4E] hover:text-success transition-all cursor-pointer active:scale-[0.98] group"
                  >
                    <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-success shrink-0 group-hover:scale-105 transition-transform">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <span className="text-[10px] text-[#5C6B80] block font-bold uppercase group-hover:text-success transition-colors">
                        WhatsApp
                      </span>
                      <span className="text-xs font-black truncate block group-hover:text-success transition-colors">
                        {whatsapp}
                      </span>
                    </div>
                  </a>
                )}

                {telegram && (
                  <a
                    href={`https://t.me/${cleanTg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 flex items-center gap-2.5 text-[#2D3A4E] hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
                  >
                    <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 group-hover:scale-105 transition-transform">
                      <Send className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <span className="text-[10px] text-[#5C6B80] block font-bold uppercase group-hover:text-[#5F6ED0] transition-colors">
                        Telegram
                      </span>
                      <span className="text-xs font-black truncate block group-hover:text-[#5F6ED0] transition-colors">
                        {telegram}
                      </span>
                    </div>
                  </a>
                )}

                {email && (
                <a
                  href={`mailto:${email}`}
                  className="neu-inset bg-[#E3E8EF] rounded-2xl p-3 flex items-center gap-2.5 text-[#2D3A4E] hover:text-[#5F6ED0] transition-all cursor-pointer active:scale-[0.98] group"
                >
                  <div className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5F6ED0] shrink-0 group-hover:scale-105 transition-transform">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <span className="text-[10px] text-[#5C6B80] block font-bold uppercase group-hover:text-[#5F6ED0] transition-colors">
                      Email
                    </span>
                    <span className="text-xs font-black truncate block group-hover:text-[#5F6ED0] transition-colors">
                      {email}
                    </span>
                  </div>
                </a>
                )}
              </div>

              {/* Online Chat Button inside App */}
              {onOpenSupportChat && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSupportChat();
                  }}
                  className="w-full neu-button-accent rounded-2xl p-3 text-white font-black text-xs flex items-center justify-center gap-2 hover:opacity-95 transition-all cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Открыть интерактивный онлайн-чат с консьержем</span>
                </button>
              )}

              {/* Concierge Services List */}
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-[#5F6ED0]" />
                  Услуги консьерж-сервиса {storeName}
                </h4>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-[#5F6ED0] font-black text-[10px] shrink-0 mt-0.5 bg-[#E3E8EF]">
                      1
                    </span>
                    <div>
                      <strong className="text-[#2D3A4E] block">{service1Title}</strong>
                      <p className="text-[11px] text-[#5C6B80]">
                        {service1Desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-[#5F6ED0] font-black text-[10px] shrink-0 mt-0.5 bg-[#E3E8EF]">
                      2
                    </span>
                    <div>
                      <strong className="text-[#2D3A4E] block">{service2Title}</strong>
                      <p className="text-[11px] text-[#5C6B80]">
                        {service2Desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-[#5F6ED0] font-black text-[10px] shrink-0 mt-0.5 bg-[#E3E8EF]">
                      3
                    </span>
                    <div>
                      <strong className="text-[#2D3A4E] block">{service3Title}</strong>
                      <p className="text-[11px] text-[#5C6B80]">
                        {service3Desc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Showroom & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#5F6ED0] uppercase">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Флагманский шоурум</span>
                  </div>
                  <p className="text-xs font-bold text-[#2D3A4E]">{pickupAddress}</p>
                </div>

                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#5F6ED0] uppercase">
                    <Clock className="w-3.5 h-3.5" />
                    <span>График работы</span>
                  </div>
                  <p className="text-xs font-bold text-[#2D3A4E]">{workingHours}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: РЕКВИЗИТЫ КОМПАНИИ */}
          {activeTab === 'requisites' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Copy All Button */}
              {requisiteItems.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-3.5 neu-inset rounded-2xl bg-[#E3E8EF]">
                <div className="min-w-0">
                  <span className="text-xs font-black text-[#2D3A4E] block truncate">
                    Официальные реквизиты организации
                  </span>
                  <span className="text-[10px] text-[#5C6B80] block">
                    Для выставления счетов и договоров
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyAllRequisites}
                  className="neu-button px-3 py-2 rounded-xl text-xs font-bold text-[#5F6ED0] hover:text-[#4F5DC0] flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
                  title="Скопировать все реквизиты"
                >
                  {copiedKey === 'all' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="text-success">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Скопировать все</span>
                    </>
                  )}
                </button>
              </div>
              )}

              {/* Key Value Items */}
              <div className="space-y-2 text-xs">
                {requisiteItems.length === 0 && (
                  <p className="neu-inset rounded-2xl p-3 text-xs text-[#5C6B80] text-center">
                    Реквизиты компании скоро появятся. По вопросам оплаты и документов напишите нам в чат поддержки.
                  </p>
                )}
                {requisiteItems.map((item) => (
                  <div
                    key={item.key}
                    onClick={() => copyToClipboard(item.value, item.key)}
                    className="neu-inset p-2.5 px-3 rounded-2xl flex items-center justify-between gap-2 bg-[#E3E8EF] hover:bg-white/40 transition-all cursor-pointer group"
                    title="Нажмите, чтобы скопировать"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] uppercase font-bold text-[#5C6B80] block">
                        {item.label}
                      </span>
                      <span className="text-xs font-black text-[#2D3A4E] block break-all">
                        {item.value}
                      </span>
                    </div>
                    <div className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] group-hover:text-[#5F6ED0] shrink-0 transition-colors">
                      {copiedKey === item.key ? (
                        <Check className="w-3.5 h-3.5 text-success stroke-[2.5]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-[#5C6B80] text-center italic">
                Все счета формируются автоматически в соответствии с законодательством РФ.
              </p>
            </div>
          )}

          {/* TAB 3: О БРЕНДЕ */}
          {activeTab === 'brand' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Brand Philosophy */}
              <div className="neu-inset rounded-2xl p-4 bg-[#E3E8EF] space-y-2.5">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#5F6ED0]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E]">
                    {brandPhilosophyTitle}
                  </h3>
                </div>
                <p className="text-xs text-[#2D3A4E] leading-relaxed">
                  {brandPhilosophyText}
                </p>
              </div>

              {/* Materials & Quality */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#5F6ED0] uppercase">
                    <Scissors className="w-3.5 h-3.5" />
                    <span>{brandMaterialsTitle}</span>
                  </div>
                  <p className="text-[11px] text-[#5C6B80] leading-snug">
                    {brandMaterialsText}
                  </p>
                </div>

                <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#5F6ED0] uppercase">
                    <Award className="w-3.5 h-3.5" />
                    <span>{brandCraftsmanshipTitle}</span>
                  </div>
                  <p className="text-[11px] text-[#5C6B80] leading-snug">
                    {brandCraftsmanshipText}
                  </p>
                </div>
              </div>

              {/* Guarantees */}
              <div className="neu-inset p-3.5 rounded-2xl bg-[#E3E8EF] space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#2D3A4E]">
                  <ShieldCheck className="w-4 h-4 text-success" />
                  <span>{brandGuaranteesTitle}</span>
                </div>
                <ul className="text-[11px] text-[#5C6B80] space-y-1 list-disc list-inside">
                  {brandGuaranteesList.map((item, idx) => (
                    <li key={`guarantee-${idx}-${item.slice(0, 15)}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer info */}
            <div className="pt-3.5 mt-2 border-t border-[#BAC5D5]/50 flex items-center justify-between text-[11px] text-[#5C6B80] shrink-0">
              <span>{storeName} • Официальный бутик</span>
              <button
                type="button"
                onClick={onClose}
                className="neu-button px-4 py-1.5 rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-[#5F6ED0] cursor-pointer transition-colors"
              >
                Закрыть
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
