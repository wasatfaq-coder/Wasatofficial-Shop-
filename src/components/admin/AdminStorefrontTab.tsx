import React, { useState, useEffect } from 'react';
import {
  Store,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Clock,
  RotateCcw,
  Check,
  Truck,
  Tag,
  Save,
  MessageCircle,
  Send,
  Sliders,
  AlertCircle,
  RefreshCw,
  Copy,
  Eye,
  Gift,
  HelpCircle,
  ExternalLink,
  Crown,
  Sparkles,
  Scissors,
  Award,
  Building2,
  FileText,
  CreditCard,
  Pencil,
} from 'lucide-react';
import { AdminServerOrdersCard } from './AdminServerOrdersCard';
import { StorefrontSettings } from '../../types';
import {
  loadStorefrontSettings,
  saveStorefrontSettings,
  DEFAULT_STOREFRONT_SETTINGS,
} from '../../utils/inventory';
import { BrandRequisitesModal } from '../BrandRequisitesModal';
import { QuickTextEditModal, QuickEditFieldConfig } from './QuickTextEditModal';


interface AdminStorefrontTabProps {
  settings?: StorefrontSettings;
  onUpdateSettings?: (newSettings: StorefrontSettings) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminStorefrontTab: React.FC<AdminStorefrontTabProps> = ({
  settings: propSettings,
  onUpdateSettings,
  onShowToast,
}) => {
  const [localSettings, setLocalSettings] = useState<StorefrontSettings>(() => {
    if (propSettings) return propSettings;
    return loadStorefrontSettings();
  });

  useEffect(() => {
    if (propSettings) {
      setLocalSettings(propSettings);
    }
  }, [propSettings]);

  const [isSaved, setIsSaved] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Mini-modal state for editing any text field in neomorphic style
  const [editModalConfig, setEditModalConfig] = useState<QuickEditFieldConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);


  const openQuickEdit = (config: Omit<QuickEditFieldConfig, 'value'> & { value?: string }) => {
    setEditModalConfig({
      ...config,
      value: config.value ?? '',
    });
    setIsEditModalOpen(true);
  };

  const handleQuickEditSave = (key: string, newValue: string) => {
    let newSettings: StorefrontSettings;

    if (key.startsWith('guarantee_')) {
      const idx = parseInt(key.replace('guarantee_', ''), 10);
      const list = [...(localSettings.brandGuaranteesList || [
        '100% оригинальность и сертификация каждого изделия.',
        'Расширенная гарантия качества на швы и фурнитуру.',
        'Примерка перед оплатой и легкий возврат без лишних вопросов.',
      ])];
      list[idx] = newValue;
      newSettings = { ...localSettings, brandGuaranteesList: list };
    } else if (
      key === 'freeDeliveryThreshold' ||
      key === 'courierDeliveryPrice' ||
      key === 'pickupDeliveryPrice' ||
      key === 'returnPeriodDays'
    ) {
      const num = Math.max(0, parseInt(newValue.replace(/\D/g, ''), 10) || 0);
      newSettings = { ...localSettings, [key]: num };
    } else {
      newSettings = { ...localSettings, [key]: newValue };
    }

    setLocalSettings(newSettings);
    saveStorefrontSettings(newSettings);
    if (onUpdateSettings) {
      onUpdateSettings(newSettings);
    }

    const fieldTitle = editModalConfig?.fieldLabel || editModalConfig?.title || 'Поле';
    onShowToast(`«${fieldTitle}» обновлено`, 'success');
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveStorefrontSettings(localSettings);
    if (onUpdateSettings) {
      onUpdateSettings(localSettings);
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
    onShowToast('Настройки витрины, реквизиты и данные бренда сохранены', 'success');
  };

  const handleResetToDefaults = () => {
    setLocalSettings(DEFAULT_STOREFRONT_SETTINGS);
    saveStorefrontSettings(DEFAULT_STOREFRONT_SETTINGS);
    if (onUpdateSettings) {
      onUpdateSettings(DEFAULT_STOREFRONT_SETTINGS);
    }
    onShowToast('Тексты и контакты витрины очищены', 'info');
  };

  // Helper to safely update an item in brandGuaranteesList
  const updateGuaranteeItem = (index: number, val: string) => {
    const list = [...(localSettings.brandGuaranteesList || [
      '100% оригинальность и сертификация каждого изделия.',
      'Расширенная гарантия качества на швы и фурнитуру.',
      'Примерка перед оплатой и легкий возврат без лишних вопросов.',
    ])];
    list[index] = val;
    setLocalSettings({ ...localSettings, brandGuaranteesList: list });
  };

  return (
    <div className="space-y-4 text-[#2D3A4E]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-[#BAC5D5]/50">
        <div>
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-2">
            <Store className="w-4 h-4 text-accent" />
            <span>Управление витриной, брендом и реквизитами</span>
          </h3>
          <p className="text-[11px] text-[#4E5C70] font-medium mt-0.5">
            Редактирование контактов, VIP-консьержа, юридических реквизитов и философии бренда
          </p>
        </div>

        {/* Toolbar with Clear Button Hierarchy */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Secondary Tools: Preview & Client View */}
          <div className="flex items-center gap-1.5 p-1 neu-inset rounded-xl bg-[#E3E8EF]/60">
            <button
              type="button"
              onClick={() => setIsClientModalOpen(true)}
              className="py-1.5 px-2.5 sm:px-3 neu-inset rounded-lg text-xs font-bold text-accent hover:text-accent-strong transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 bg-[#E3E8EF]"
              title="Открыть окно «Бренд и реквизиты» так, как его видит покупатель"
            >
              <Crown className="w-3.5 h-3.5" />
              <span className="text-[11px]">Клиент</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className={`py-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                showLivePreview
                  ? 'neu-inset text-accent font-black bg-[#E3E8EF]'
                  : 'neu-inset text-[#4E5C70] hover:text-[#2D3A4E] bg-[#E3E8EF]'
              }`}
              title={showLivePreview ? 'Скрыть интерактивную сводку' : 'Показать интерактивную сводку'}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="text-[11px]">Сводка</span>
            </button>
          </div>

          {/* Primary & Destructive Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              className="py-2 px-3 neu-button-danger rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Очистить тексты и контакты витрины"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[11px]">Сброс</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className="py-2 px-4.5 neu-inset rounded-xl text-xs font-black text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer active:scale-95 transition-all bg-[#E3E8EF]"
              title="Применить все изменения к витрине"
            >
              {isSaved ? <Check className="w-4 h-4 text-success" /> : <Save className="w-4 h-4 text-accent" />}
              <span>{isSaved ? 'Сохранено!' : 'Применить'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {isResetConfirmOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsResetConfirmOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm neu-flat rounded-3xl bg-[#E3E8EF] p-5 sm:p-6 space-y-4 border border-white/80 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl neu-flat-sm flex items-center justify-center text-warning bg-[#E3E8EF] shrink-0 border border-white/80">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E]">
                  Сброс настроек витрины
                </h4>
                <p className="text-[11px] text-[#4E5C70] mt-1 leading-relaxed">
                  Очистить контакты, реквизиты, описание консьерж-сервиса и тексты о бренде? Покупатели увидят «Не настроено», пока вы не заполните их снова. Тарифы доставки вернутся к значениям по умолчанию.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#BAC5D5]/30">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="py-2 px-3.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer active:scale-95 transition-all bg-[#E3E8EF] border border-white/80"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResetConfirmOpen(false);
                  handleResetToDefaults();
                }}
                className="py-2 px-4 neu-button rounded-xl text-xs font-black text-danger hover:text-danger active:scale-95 transition-all cursor-pointer bg-[#E3E8EF] border border-danger/70"
              >
                Да, сбросить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW COMPONENT */}
      {showLivePreview && (
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3 bg-[#E3E8EF] border border-accent/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Интерактивный сводный статус
            </span>
            <button
              type="button"
              onClick={() => setIsClientModalOpen(true)}
              className="text-[11px] text-accent hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Посмотреть как у клиента</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Store Offline Banner Preview if offline */}
          {!localSettings.isStoreOnline && (
            <div className="neu-inset rounded-2xl p-3 bg-warning-soft border border-warning/30 flex items-center gap-2.5 text-warning">
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
              <div className="text-xs">
                <span className="font-black block">Режим закрытой примерки</span>
                <span className="text-[11px] text-[#4E5C70]">
                  Онлайн-оформление приостановлено. Заказы принимаются через консьержа:{' '}
                  {localSettings.phone}
                </span>
              </div>
            </div>
          )}

          {/* Quick Preview Chips with Tap-to-Edit Functionality */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                openQuickEdit({
                  key: 'storeName',
                  title: 'Основные контакты',
                  fieldLabel: 'Название бутика / бренда',
                  value: localSettings.storeName,
                  badge: 'Бренд',
                  description: 'Основное имя бренда, отображается в логотипе, шапке и уведомлениях.',
                })
              }
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования названия бренда"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Бренд</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-black text-[#2D3A4E] truncate block">
                {localSettings.storeName}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openQuickEdit({
                  key: 'legalEntityName',
                  title: 'Юридические реквизиты',
                  fieldLabel: 'Юридическое лицо / Организация',
                  value: localSettings.legalEntityName || '',
                  badge: 'Организация',
                  description: 'Полное юридическое наименование компании для договоров и чеков.',
                })
              }
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования юр. лица"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Юр. лицо</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-black text-[#2D3A4E] truncate block">
                {localSettings.legalEntityName || '—'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openQuickEdit({
                  key: 'inn',
                  title: 'Юридические реквизиты',
                  fieldLabel: 'ИНН',
                  value: localSettings.inn || '',
                  badge: 'Налоги',
                  description: 'Идентификационный номер налогоплательщика.',
                })
              }
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования ИНН"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">ИНН / КПП</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-black text-[#2D3A4E] truncate block">
                {localSettings.inn || '—'} / {localSettings.kpp || '—'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openQuickEdit({
                  key: 'ceo',
                  title: 'Юридические реквизиты',
                  fieldLabel: 'Руководитель / Генеральный директор',
                  value: localSettings.ceo || '',
                  badge: 'Руководство',
                  description: 'ФИО первого лица компании или индивидуального предпринимателя.',
                })
              }
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования руководителя"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Руководитель</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-black text-[#2D3A4E] truncate block">
                {localSettings.ceo || '—'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openQuickEdit({
                  key: 'freeDeliveryThreshold',
                  title: 'Тарифы доставки',
                  fieldLabel: 'Порог бесплатной доставки (₽)',
                  value: String(localSettings.freeDeliveryThreshold ?? 5000),
                  badge: 'Доставка',
                  description: 'Сумма заказа, начиная с которой доставка становится 0 ₽.',
                })
              }
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для редактирования порога бесплатной доставки"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Беспл. доставка</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-black text-success block">
                от {localSettings.freeDeliveryThreshold?.toLocaleString('ru-RU') || 5000} ₽
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !localSettings.isExpressEnabled;
                setLocalSettings({ ...localSettings, isExpressEnabled: next });
                onShowToast(
                  next ? 'Экспресс-доставка за 2 часа включена' : 'Экспресс-доставка отключена',
                  'info'
                );
              }}
              className="neu-inset rounded-xl p-2.5 text-center bg-[#E3E8EF] hover:border hover:border-accent/40 active:scale-95 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого переключения экспресс-доставки"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Экспресс 2ч</span>
                <Sliders className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span
                className={`text-xs font-black block ${
                  localSettings.isExpressEnabled ? 'text-success' : 'text-danger'
                }`}
              >
                {localSettings.isExpressEnabled ? 'Включена' : 'Отключена'}
              </span>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* 1. STORE CONTACTS & SHOWROOM */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-accent" />
              Основные контакты бутика и витрины
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Шапка и футер
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Название бутика / бренда
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.storeName}
                  onChange={(e) => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'storeName',
                      title: 'Основные контакты',
                      fieldLabel: 'Название бутика / бренда',
                      value: localSettings.storeName,
                      badge: 'Шапка и футер',
                      description: 'Официальное наименование магазина в интерфейсе, логотипе, шапке и уведомлениях.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Слоган / Описание витрины
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.storeSlogan || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, storeSlogan: e.target.value })
                  }
                  placeholder="Бутик премиальной мужской одежды"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'storeSlogan',
                      title: 'Основные контакты',
                      fieldLabel: 'Слоган / Описание витрины',
                      value: localSettings.storeSlogan || '',
                      badge: 'Подзаголовок',
                      description: 'Короткий слоган или дескриптор бутика, отображаемый под логотипом.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Телефон горячей линии
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.phone}
                  onChange={(e) => setLocalSettings({ ...localSettings, phone: e.target.value })}
                  placeholder="+7 (495) 123-45-67"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'phone',
                      title: 'Основные контакты',
                      fieldLabel: 'Телефон горячей линии',
                      value: localSettings.phone,
                      badge: 'Связь',
                      description: 'Номер телефона для звонков клиентов, кликабелен в шапке сайта и в карточке заказа.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Email клиентской службы
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={localSettings.email}
                  onChange={(e) => setLocalSettings({ ...localSettings, email: e.target.value })}
                  placeholder="shop@example.com"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'email',
                      title: 'Основные контакты',
                      fieldLabel: 'Email клиентской службы',
                      value: localSettings.email,
                      badge: 'Связь',
                      description: 'Адрес электронной почты для официальных запросов клиентов и счетов.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Telegram канал / бот
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.telegram}
                  onChange={(e) => setLocalSettings({ ...localSettings, telegram: e.target.value })}
                  placeholder="@manstyle_official"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'telegram',
                      title: 'Основные контакты',
                      fieldLabel: 'Telegram канал / бот',
                      value: localSettings.telegram,
                      badge: 'Мессенджер',
                      description: 'Имя пользователя или ссылка на Telegram для оперативной связи.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                WhatsApp для консультаций
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.whatsapp}
                  onChange={(e) => setLocalSettings({ ...localSettings, whatsapp: e.target.value })}
                  placeholder="+7 (999) 000-00-00"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'whatsapp',
                      title: 'Основные контакты',
                      fieldLabel: 'WhatsApp для консультаций',
                      value: localSettings.whatsapp,
                      badge: 'Мессенджер',
                      description: 'Номер WhatsApp стилиста для отправки фото и быстрой примерки.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Адрес бутика / шоурума
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.pickupAddress}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, pickupAddress: e.target.value })
                  }
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'pickupAddress',
                      title: 'Основные контакты',
                      fieldLabel: 'Адрес бутика / шоурума',
                      value: localSettings.pickupAddress,
                      badge: 'Самовывоз',
                      description: 'Точный физический адрес бутика, отображаемый для самовывоза и визитов.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Режим работы
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.workingHours}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, workingHours: e.target.value })
                  }
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'workingHours',
                      title: 'Основные контакты',
                      fieldLabel: 'Режим работы',
                      value: localSettings.workingHours,
                      badge: 'График',
                      description: 'Часы работы бутика и операторов консьерж-службы.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Top Promotional Announcement Banner */}
          <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2.5 pt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-accent shrink-0" />
                Промо-сообщение в шапке сайта
              </span>
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 self-start sm:self-auto neu-button px-2.5 py-1 rounded-xl bg-[#E3E8EF] border border-white/80 active:scale-95 transition-all">
                <span className="text-[11px] font-bold text-[#4E5C70] whitespace-nowrap">
                  {localSettings.isStoreBannerVisible ? 'Баннер включен' : 'Баннер скрыт'}
                </span>
                <input
                  type="checkbox"
                  checked={localSettings.isStoreBannerVisible ?? false}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, isStoreBannerVisible: e.target.checked })
                  }
                  className="sr-only"
                />
                <div
                  className={`w-9 h-5 rounded-full transition-colors relative p-0.5 neu-inset ${
                    localSettings.isStoreBannerVisible ? 'bg-accent' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      localSettings.isStoreBannerVisible ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-1">
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст бейджа
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={localSettings.bannerBadgeText ?? ''}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, bannerBadgeText: e.target.value })
                    }
                    placeholder="АКЦИЯ"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-black text-accent bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'bannerBadgeText',
                        title: 'Промо-сообщение',
                        fieldLabel: 'Текст бейджа акции',
                        value: localSettings.bannerBadgeText ?? '',
                        badge: 'Бейдж',
                        description: 'Необязательное короткое слово перед текстом (например: АКЦИЯ, NEW). Пусто — без бейджа.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст промо-сообщения
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={
                      localSettings.storeBannerText ?? ''
                    }
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, storeBannerText: e.target.value })
                    }
                    placeholder="Текст баннера в верхней строке сайта"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-medium text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'storeBannerText',
                        title: 'Промо-сообщение',
                        fieldLabel: 'Текст промо-сообщения',
                        value: localSettings.storeBannerText ?? '',
                        badge: 'Верхняя строка',
                        description: 'Строка над шапкой на всех страницах. Показывается, когда баннер включен и текст заполнен.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. VIP CONCIERGE SERVICE DETAILS */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Вкладка «Консьерж»: Описание и перечень услуг
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Вкладка 1 из 3
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-[#4E5C70] mb-1.5">
                Приветственное описание консьерж-сервиса
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  rows={3}
                  value={
                    localSettings.conciergeDescription ??
                    'Персональный ассистент по стилю и сопровождению заказов. Помощь в выборе размера, бронирование закрытых моделей, организация выездной примерки и консультации стилиста.'
                  }
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, conciergeDescription: e.target.value })
                  }
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                />
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'conciergeDescription',
                      title: 'Консьерж-сервис',
                      fieldLabel: 'Приветственное описание',
                      value:
                        localSettings.conciergeDescription ??
                        'Персональный ассистент по стилю и сопровождению заказов. Помощь в выборе размера, бронирование закрытых моделей, организация выездной примерки и консультации стилиста.',
                      isMultiline: true,
                      rows: 4,
                      badge: 'Вкладка 1',
                      description: 'Текст первого экрана в окне консьерж-сервиса, разъясняющий привилегии персонального обслуживания.',
                    })
                  }
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <span className="text-[11px] font-black uppercase text-accent block pt-1">
              Перечень услуг консьерж-сервиса
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Service 1 */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-black text-[11px] shrink-0 bg-[#E3E8EF]">
                      1
                    </span>
                    <span className="text-[11px] font-black text-[#2D3A4E]">Услуга 1</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.conciergeService1Title ?? 'Персональный подбор капсулы'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          conciergeService1Title: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService1Title',
                          title: 'Консьерж: Услуга 1',
                          fieldLabel: 'Заголовок услуги',
                          value:
                            localSettings.conciergeService1Title ?? 'Персональный подбор капсулы',
                          badge: 'Услуга 1',
                          description: 'Краткое название услуги персонального консьержа.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={3}
                      value={
                        localSettings.conciergeService1Desc ??
                        'Составление законченного гардероба на сезон или под деловые мероприятия стилистом бутика.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService1Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService1Desc',
                          title: 'Консьерж: Услуга 1',
                          fieldLabel: 'Подробное описание услуги',
                          value:
                            localSettings.conciergeService1Desc ??
                            'Составление законченного гардероба на сезон или под деловые мероприятия стилистом бутика.',
                          isMultiline: true,
                          rows: 3,
                          badge: 'Услуга 1',
                          description: 'Развернутое описание услуги консьержа.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Service 2 */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-black text-[11px] shrink-0 bg-[#E3E8EF]">
                      2
                    </span>
                    <span className="text-[11px] font-black text-[#2D3A4E]">Услуга 2</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={
                        localSettings.conciergeService2Title ?? 'Выездная примерка на дом и в офис'
                      }
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          conciergeService2Title: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService2Title',
                          title: 'Консьерж: Услуга 2',
                          fieldLabel: 'Заголовок услуги',
                          value:
                            localSettings.conciergeService2Title ??
                            'Выездная примерка на дом и в офис',
                          badge: 'Услуга 2',
                          description: 'Краткое название второй услуги персонального сервиса.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={3}
                      value={
                        localSettings.conciergeService2Desc ??
                        'Курьер доставит смежные размеры и фасоны с ожиданием до 30 минут без предоплаты.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService2Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService2Desc',
                          title: 'Консьерж: Услуга 2',
                          fieldLabel: 'Подробное описание услуги',
                          value:
                            localSettings.conciergeService2Desc ??
                            'Курьер доставит смежные размеры и фасоны с ожиданием до 30 минут без предоплаты.',
                          isMultiline: true,
                          rows: 3,
                          badge: 'Услуга 2',
                          description: 'Развернутое описание услуги консьержа.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Service 3 */}
              <div className="neu-inset rounded-2xl p-3 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-black text-[11px] shrink-0 bg-[#E3E8EF]">
                      3
                    </span>
                    <span className="text-[11px] font-black text-[#2D3A4E]">Услуга 3</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.conciergeService3Title ?? 'Подгонка в ателье бутика'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          conciergeService3Title: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService3Title',
                          title: 'Консьерж: Услуга 3',
                          fieldLabel: 'Заголовок услуги',
                          value:
                            localSettings.conciergeService3Title ?? 'Подгонка в ателье бутика',
                          badge: 'Услуга 3',
                          description: 'Краткое название третьей услуги персонального сервиса.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={3}
                      value={
                        localSettings.conciergeService3Desc ??
                        'Бесплатная корректировка длины брюк и посадки пиджака нашим мастером-портным.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService3Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'conciergeService3Desc',
                          title: 'Консьерж: Услуга 3',
                          fieldLabel: 'Подробное описание услуги',
                          value:
                            localSettings.conciergeService3Desc ??
                            'Бесплатная корректировка длины брюк и посадки пиджака нашим мастером-портным.',
                          isMultiline: true,
                          rows: 3,
                          badge: 'Услуга 3',
                          description: 'Развернутое описание услуги консьержа.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. LEGAL REQUISITES OF THE ORGANIZATION */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-accent" />
              Вкладка «Реквизиты»: Официальные юридические данные
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Вкладка 2 из 3
            </span>
          </div>

          <p className="text-[11px] text-[#4E5C70]">
            Данные поля транслируются в карточки реквизитов и копируются клиентами при формировании официальных счетов и договоров.
          </p>

          <div className="space-y-3 text-xs">
            {/* 1. Organization & Addresses */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <Building2 className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-black text-[#2D3A4E]">Организация и адреса</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Юридическое лицо / Организация
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.legalEntityName || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, legalEntityName: e.target.value })
                      }
                      placeholder="ООО «МЭНСТАЙЛ РУС»"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'legalEntityName',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'Юридическое лицо / Организация',
                          value: localSettings.legalEntityName || '',
                          badge: 'Организация',
                          description: 'Полное юридическое наименование компании для договоров и чеков.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Руководитель / Генеральный директор
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.ceo || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, ceo: e.target.value })}
                      placeholder="Смирнов Александр Владимирович"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'ceo',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'Руководитель / Генеральный директор',
                          value: localSettings.ceo || '',
                          badge: 'Руководство',
                          description: 'ФИО первого лица компании или индивидуального предпринимателя.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Юридический адрес компании
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.legalAddress || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, legalAddress: e.target.value })
                      }
                      placeholder="125009, г. Москва, Столешников переулок, д. 14, стр. 1, офис 402"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'legalAddress',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'Юридический адрес',
                          value: localSettings.legalAddress || '',
                          badge: 'Адрес',
                          description: 'Адрес места нахождения согласно выписке из ЕГРЮЛ.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Система электронного документооборота (ЭДО)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.edo || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, edo: e.target.value })}
                      placeholder="Диадок (ID: 2BM-7704829104-770401001), СБИС"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'edo',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'Система электронного документооборота (ЭДО)',
                          value: localSettings.edo || '',
                          badge: 'ЭДО',
                          description: 'Оператор и идентификатор участника ЭДО (Диадок, СБИС и др.).',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Tax Registration: INN, KPP, OGRN */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-black text-[#2D3A4E]">Государственная регистрация (ФНС)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    ИНН
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.inn || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, inn: e.target.value })}
                      placeholder="7704829104"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'inn',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'ИНН организации',
                          value: localSettings.inn || '',
                          badge: 'Регистрация',
                          description: 'Идентификационный номер налогоплательщика (10 или 12 цифр).',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    КПП
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.kpp || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, kpp: e.target.value })}
                      placeholder="770401001"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'kpp',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'КПП организации',
                          value: localSettings.kpp || '',
                          badge: 'Регистрация',
                          description: 'Код причины постановки на учет (9 цифр для юрлиц).',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    ОГРН / ОГРНИП
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.ogrn || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, ogrn: e.target.value })}
                      placeholder="1217700458921"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'ogrn',
                          title: 'Юридические реквизиты',
                          fieldLabel: 'ОГРН / ОГРНИП',
                          value: localSettings.ogrn || '',
                          badge: 'Регистрация',
                          description: 'Основной государственный регистрационный номер (13 или 15 цифр).',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Banking: Bank, BIK, Checking, Corr */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <CreditCard className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-black text-[#2D3A4E]">Банковский счет и расчеты</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Банк обслуживания
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.bankName || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, bankName: e.target.value })}
                      placeholder="ПАО «Сбербанк России», г. Москва"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'bankName',
                          title: 'Банковские реквизиты',
                          fieldLabel: 'Банк обслуживания',
                          value: localSettings.bankName || '',
                          badge: 'Банк',
                          description: 'Полное фирменное наименование банка и город филиала.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    БИК банка
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.bik || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, bik: e.target.value })}
                      placeholder="044525225"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'bik',
                          title: 'Банковские реквизиты',
                          fieldLabel: 'БИК банка',
                          value: localSettings.bik || '',
                          badge: 'Банк',
                          description: 'Банковский идентификационный код (9 цифр).',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Расчетный счет (Р/С)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.checkingAccount || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, checkingAccount: e.target.value })
                      }
                      placeholder="40702810938000012345"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'checkingAccount',
                          title: 'Банковские реквизиты',
                          fieldLabel: 'Расчетный счет (Р/С)',
                          value: localSettings.checkingAccount || '',
                          badge: 'Банк',
                          description: '20-значный расчетный номер счета организации.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Корреспондентский счет (К/С)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.corrAccount || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, corrAccount: e.target.value })
                      }
                      placeholder="30101810400000000225"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'corrAccount',
                          title: 'Банковские реквизиты',
                          fieldLabel: 'Корреспондентский счет (К/С)',
                          value: localSettings.corrAccount || '',
                          badge: 'Банк',
                          description: '20-значный корреспондентский счет банка в Банке России.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. BRAND PHILOSOPHY, CRAFTSMANSHIP & GUARANTEES */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-accent" />
              Вкладка «Бренд»: Философия, ткани, крой и гарантии
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Вкладка 3 из 3
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Brand Philosophy */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2">
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-black text-[#2D3A4E]">Философия бренда</span>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Заголовок блока
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={localSettings.brandPhilosophyTitle ?? `Философия бренда ${localSettings.storeName}`}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandPhilosophyTitle: e.target.value })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'brandPhilosophyTitle',
                        title: 'О бренде: Философия',
                        fieldLabel: 'Заголовок философии бренда',
                        value:
                          localSettings.brandPhilosophyTitle ??
                          `Философия бренда ${localSettings.storeName}`,
                        badge: 'Философия',
                        description: 'Главный заголовок раздела о ценностях и концепции модного дома.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст манифеста бренда
                </label>
                <div className="flex items-start gap-1.5">
                  <textarea
                    rows={3}
                    value={
                      localSettings.brandPhilosophyText ??
                      'Wasat Shop — премиальный бутик мужской одежды, основанный на эстетике сдержанной роскоши («Quiet Luxury») и безупречном архитектурном крое. Мы создаем гардероб вне времени, который подчеркивает статус и харизму мужчины без кричащих логотипов.'
                    }
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandPhilosophyText: e.target.value })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'brandPhilosophyText',
                        title: 'О бренде: Философия',
                        fieldLabel: 'Текст манифеста бренда',
                        value:
                          localSettings.brandPhilosophyText ??
                          'Wasat Shop — премиальный бутик мужской одежды, основанный на эстетике сдержанной роскоши («Quiet Luxury») и безупречном архитектурном крое. Мы создаем гардероб вне времени, который подчеркивает статус и харизму мужчины без кричащих логотипов.',
                        isMultiline: true,
                        rows: 4,
                        badge: 'Манифест',
                        description: 'Полный текст манифеста и истории бренда во вкладке «О бренде».',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80 mt-0.5"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Materials & Craftsmanship */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Materials */}
              <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-black text-[#2D3A4E]">Материалы и ткани</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.brandMaterialsTitle ?? 'Итальянские ткани'}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, brandMaterialsTitle: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'brandMaterialsTitle',
                          title: 'О бренде: Ткани',
                          fieldLabel: 'Заголовок блока тканей',
                          value: localSettings.brandMaterialsTitle ?? 'Итальянские ткани',
                          badge: 'Материалы',
                          description: 'Краткий заголовок раздела о качестве сырья и производителях тканей.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={3}
                      value={
                        localSettings.brandMaterialsText ??
                        'Селективная шерсть Super 150’s от мануфактур Loro Piana и Zegna, длинноволокнистый хлопок Supima и натуральный лен.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, brandMaterialsText: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'brandMaterialsText',
                          title: 'О бренде: Ткани',
                          fieldLabel: 'Описание используемых материалов',
                          value:
                            localSettings.brandMaterialsText ??
                            'Селективная шерсть Super 150’s от мануфактур Loro Piana и Zegna, длинноволокнистый хлопок Supima и натуральный лен.',
                          isMultiline: true,
                          rows: 3,
                          badge: 'Материалы',
                          description: 'Развернутое описание мануфактур, пряжи и свойств тканей.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80 mt-0.5"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Craftsmanship */}
              <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2">
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-black text-[#2D3A4E]">Крой и пошив</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={localSettings.brandCraftsmanshipTitle ?? 'Эталонный крой'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          brandCraftsmanshipTitle: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'brandCraftsmanshipTitle',
                          title: 'О бренде: Крой',
                          fieldLabel: 'Заголовок кроя и пошива',
                          value: localSettings.brandCraftsmanshipTitle ?? 'Эталонный крой',
                          badge: 'Пошив',
                          description: 'Краткий заголовок раздела о мастерстве сборки и посадке.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={3}
                      value={
                        localSettings.brandCraftsmanshipText ??
                        'Каждая модель разработана с учетом анатомических особенностей мужской фигуры. Полуручная сборка и безупречные строчки.'
                      }
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          brandCraftsmanshipText: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: 'brandCraftsmanshipText',
                          title: 'О бренде: Крой',
                          fieldLabel: 'Описание кроя и пошива',
                          value:
                            localSettings.brandCraftsmanshipText ??
                            'Каждая модель разработана с учетом анатомических особенностей мужской фигуры. Полуручная сборка и безупречные строчки.',
                          isMultiline: true,
                          rows: 3,
                          badge: 'Пошив',
                          description: 'Развернутое описание лекал, ручных швов и технологии сборки.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80 mt-0.5"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Guarantees */}
            <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                  <span className="text-[11px] font-black text-[#2D3A4E]">
                    Стандарты подлинности и гарантии
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Заголовок блока гарантий
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={localSettings.brandGuaranteesTitle ?? 'Стандарты подлинности и гарантии'}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandGuaranteesTitle: e.target.value })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'brandGuaranteesTitle',
                        title: 'О бренде: Гарантии',
                        fieldLabel: 'Заголовок блока гарантий',
                        value:
                          localSettings.brandGuaranteesTitle ??
                          'Стандарты подлинности и гарантии',
                        badge: 'Гарантии',
                        description: 'Заголовок секции гарантий подлинности и сервисных стандартов.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <span className="text-[11px] uppercase font-bold text-[#4E5C70] block">
                  Пункты гарантийных обязательств (3 пункта)
                </span>

                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md neu-flat-sm flex items-center justify-center text-success font-bold text-[11px] shrink-0 bg-[#E3E8EF]">
                    ✓
                  </span>
                  <input
                    type="text"
                    value={
                      localSettings.brandGuaranteesList?.[0] ??
                      '100% оригинальность и сертификация каждого изделия.'
                    }
                    onChange={(e) => updateGuaranteeItem(0, e.target.value)}
                    placeholder="Пункт гарантии 1"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'guarantee_0',
                        title: 'О бренде: Гарантии',
                        fieldLabel: 'Пункт гарантии №1',
                        value:
                          localSettings.brandGuaranteesList?.[0] ??
                          '100% оригинальность и сертификация каждого изделия.',
                        badge: 'Гарантия 1',
                        description: 'Первое гарантийное обязательство перед клиентом.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md neu-flat-sm flex items-center justify-center text-success font-bold text-[11px] shrink-0 bg-[#E3E8EF]">
                    ✓
                  </span>
                  <input
                    type="text"
                    value={
                      localSettings.brandGuaranteesList?.[1] ??
                      'Расширенная гарантия качества на швы и фурнитуру.'
                    }
                    onChange={(e) => updateGuaranteeItem(1, e.target.value)}
                    placeholder="Пункт гарантии 2"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'guarantee_1',
                        title: 'О бренде: Гарантии',
                        fieldLabel: 'Пункт гарантии №2',
                        value:
                          localSettings.brandGuaranteesList?.[1] ??
                          'Расширенная гарантия качества на швы и фурнитуру.',
                        badge: 'Гарантия 2',
                        description: 'Второе гарантийное обязательство перед клиентом.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md neu-flat-sm flex items-center justify-center text-success font-bold text-[11px] shrink-0 bg-[#E3E8EF]">
                    ✓
                  </span>
                  <input
                    type="text"
                    value={
                      localSettings.brandGuaranteesList?.[2] ??
                      'Примерка перед оплатой и легкий возврат без лишних вопросов.'
                    }
                    onChange={(e) => updateGuaranteeItem(2, e.target.value)}
                    placeholder="Пункт гарантии 3"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'guarantee_2',
                        title: 'О бренде: Гарантии',
                        fieldLabel: 'Пункт гарантии №3',
                        value:
                          localSettings.brandGuaranteesList?.[2] ??
                          'Примерка перед оплатой и легкий возврат без лишних вопросов.',
                        badge: 'Гарантия 3',
                        description: 'Третье гарантийное обязательство перед клиентом.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. DELIVERY COSTS & THRESHOLD MANAGEMENT */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-accent" />
              Тарифы доставки, порог и срок возврата
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Динамический расчет в корзине
            </span>
          </div>

          <p className="text-[11px] text-[#4E5C70]">
            Укажите базовую стоимость курьерской доставки и сумму заказа, начиная с которой доставка автоматически становится бесплатной (0 ₽) в корзине и чекауте.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {/* Free Delivery Threshold */}
            <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF] space-y-1.5">
              <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Порог бесплатной доставки
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={localSettings.freeDeliveryThreshold ?? 5000}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        freeDeliveryThreshold: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-black text-success bg-[#E3E8EF] pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">
                    ₽
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'freeDeliveryThreshold',
                      title: 'Тарифы доставки',
                      fieldLabel: 'Порог бесплатной доставки',
                      value: String(localSettings.freeDeliveryThreshold ?? 5000),
                      badge: 'Доставка',
                      description: 'Сумма заказа в рублях, при достижении которой доставка автоматически становится бесплатной (0 ₽).',
                      inputType: 'number',
                      numberMin: 0,
                      numberStep: 500,
                      unit: '₽',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>Свыше суммы: 0 ₽</span>
                <span className="font-bold text-success">0 ₽ от порога</span>
              </div>
            </div>

            {/* Courier Delivery Cost */}
            <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF] space-y-1.5">
              <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Курьер (базовый тариф)
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={localSettings.courierDeliveryPrice ?? 350}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        courierDeliveryPrice: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-black text-[#2D3A4E] bg-[#E3E8EF] pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">
                    ₽
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'courierDeliveryPrice',
                      title: 'Тарифы доставки',
                      fieldLabel: 'Базовый тариф курьера',
                      value: String(localSettings.courierDeliveryPrice ?? 350),
                      badge: 'Доставка',
                      description: 'Стоимость доставки курьером до двери при сумме заказа ниже порога бесплатной доставки.',
                      inputType: 'number',
                      numberMin: 0,
                      numberStep: 50,
                      unit: '₽',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>До порога</span>
                <span className="font-semibold text-[#2D3A4E]">Стандарт</span>
              </div>
            </div>

            {/* Pickup Point Cost */}
            <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF] space-y-1.5">
              <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Самовывоз из бутика
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={localSettings.pickupDeliveryPrice ?? 0}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        pickupDeliveryPrice: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-black text-[#2D3A4E] bg-[#E3E8EF] pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">
                    ₽
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'pickupDeliveryPrice',
                      title: 'Тарифы доставки',
                      fieldLabel: 'Стоимость самовывоза',
                      value: String(localSettings.pickupDeliveryPrice ?? 0),
                      badge: 'Шоурум',
                      description: 'Стоимость самовывоза из фирменного бутика (0 ₽ для бесплатного самовывоза).',
                      inputType: 'number',
                      numberMin: 0,
                      numberStep: 50,
                      unit: '₽',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>Шоурум бутика</span>
                <span className="font-bold text-success">
                  {localSettings.pickupDeliveryPrice === 0 ? 'Бесплатно' : `${localSettings.pickupDeliveryPrice} ₽`}
                </span>
              </div>
            </div>

            {/* Return Period */}
            <div className="neu-inset p-3 rounded-2xl bg-[#E3E8EF] space-y-1.5">
              <label className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Срок возврата и примерки
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={localSettings.returnPeriodDays}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        returnPeriodDays: Number(e.target.value) || 14,
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-black text-accent bg-[#E3E8EF] pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">
                    дн.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickEdit({
                      key: 'returnPeriodDays',
                      title: 'Условия покупки',
                      fieldLabel: 'Срок возврата (дней)',
                      value: String(localSettings.returnPeriodDays ?? 14),
                      badge: 'Гарантии',
                      description: 'Количество дней на примерку и возврат товара надлежащего качества.',
                      inputType: 'number',
                      numberMin: 1,
                      numberMax: 90,
                      numberStep: 1,
                      unit: 'дн.',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong active:scale-90 transition-all shrink-0 cursor-pointer bg-[#E3E8EF] border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>В карточках товаров</span>
                <span className="font-bold text-accent">{localSettings.returnPeriodDays} дн.</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. SYSTEM MODES & SWITCHES */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 bg-[#E3E8EF] border border-transparent">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              Системные режимы витрины и логистики
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-button px-2.5 py-1 rounded-lg bg-[#E3E8EF] border border-white/80">
              Глобальные переключатели
            </span>
          </div>

          <p className="text-[11px] text-[#4E5C70]">
            Прием заказов, экспресс-доставка и предзаказ товаров, которых нет на складе.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Online Storefront */}
            <div
              onClick={() =>
                setLocalSettings({ ...localSettings, isStoreOnline: !localSettings.isStoreOnline })
              }
              className="neu-inset p-3 rounded-2xl flex items-center justify-between cursor-pointer select-none bg-[#E3E8EF] hover:brightness-[1.01] active:scale-[0.98] transition-all border border-black/5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isStoreOnline ? 'text-accent' : 'text-[#8C9BAE]'
                }`}>
                  <Store className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-black text-[#2D3A4E] block truncate">Онлайн-витрина</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isStoreOnline ? 'text-success' : 'text-warning'
                  }`}>
                    {localSettings.isStoreOnline ? 'Прием заказов активен' : 'Технические работы'}
                  </span>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 shrink-0 ml-2 shadow-inner ${
                  localSettings.isStoreOnline ? 'bg-accent' : 'bg-[#BAC5D5]/60'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    localSettings.isStoreOnline ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>

            {/* Express Delivery */}
            <div
              onClick={() =>
                setLocalSettings({
                  ...localSettings,
                  isExpressEnabled: !localSettings.isExpressEnabled,
                })
              }
              className="neu-inset p-3 rounded-2xl flex items-center justify-between cursor-pointer select-none bg-[#E3E8EF] hover:brightness-[1.01] active:scale-[0.98] transition-all border border-black/5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isExpressEnabled ? 'text-accent' : 'text-[#8C9BAE]'
                }`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-black text-[#2D3A4E] block truncate">Экспресс 2 часа</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isExpressEnabled ? 'text-success' : 'text-[#8C9BAE]'
                  }`}>
                    {localSettings.isExpressEnabled ? 'Доступна клиентам' : 'Временно отключена'}
                  </span>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 shrink-0 ml-2 shadow-inner ${
                  localSettings.isExpressEnabled ? 'bg-accent' : 'bg-[#BAC5D5]/60'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    localSettings.isExpressEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>

            {/* Preorder Mode */}
            <div
              onClick={() =>
                setLocalSettings({
                  ...localSettings,
                  isPreorderMode: !localSettings.isPreorderMode,
                })
              }
              className="neu-inset p-3 rounded-2xl flex items-center justify-between cursor-pointer select-none bg-[#E3E8EF] hover:brightness-[1.01] active:scale-[0.98] transition-all border border-black/5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isPreorderMode ? 'text-accent' : 'text-[#8C9BAE]'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-black text-[#2D3A4E] block truncate">Предзаказ</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isPreorderMode ? 'text-accent' : 'text-[#8C9BAE]'
                  }`}>
                    {localSettings.isPreorderMode ? 'Можно заказать без остатка' : 'Только в наличии'}
                  </span>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full transition-colors relative p-0.5 shrink-0 ml-2 shadow-inner ${
                  localSettings.isPreorderMode ? 'bg-accent' : 'bg-[#BAC5D5]/60'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    localSettings.isPreorderMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Orders validated by the placeOrder Cloud Function */}
        <AdminServerOrdersCard onShowToast={onShowToast} />

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2 gap-3 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setIsClientModalOpen(true)}
            className="py-3 px-5 neu-inset rounded-2xl text-xs font-bold text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer transition-colors active:scale-95 bg-[#E3E8EF]"
          >
            <Crown className="w-4 h-4 text-accent" />
            <span>Проверить окно «Бренд и реквизиты»</span>
          </button>

          <button
            type="submit"
            className="py-3 px-6 neu-inset rounded-2xl text-xs font-black text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer active:scale-95 transition-transform bg-[#E3E8EF]"
          >
            {isSaved ? <Check className="w-4 h-4 text-success" /> : <Save className="w-4 h-4 text-accent" />}
            <span>{isSaved ? 'Сохранено!' : 'Применить настройки к витрине'}</span>
          </button>
        </div>
      </form>

      {/* Interactive Modal Preview for Admin */}
      <BrandRequisitesModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        storefrontSettings={localSettings}
      />

      {/* Mini-modal for editing any text field in neomorphic style */}
      <QuickTextEditModal
        config={editModalConfig}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleQuickEditSave}
      />

    </div>
  );
};
