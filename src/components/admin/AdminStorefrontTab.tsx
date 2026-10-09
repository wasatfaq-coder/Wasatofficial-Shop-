import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  ShieldCheck,
  Phone,
  Clock,
  RotateCcw,
  Check,
  Truck,
  Tag,
  Save,
  Sliders,
  AlertCircle,
  Eye,
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
import { AdminBackupCard } from './AdminBackupCard';
import { SaveStorefrontSettings, StorefrontSettings } from '../../types';
import {
  loadStorefrontSettings,
  saveStorefrontSettings,
} from '../../utils/inventory';
import { BrandRequisitesModal } from '../BrandRequisitesModal';
import { NeumorphicSwitch } from '../NeumorphicSwitch';
import { AdminScheduleEditor } from './AdminScheduleEditor';
import { scheduleErrors } from '../../utils/storeSchedule';
import { QuickTextEditModal, QuickEditFieldConfig } from './QuickTextEditModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { resetStorefrontTexts } from '../../utils/storefrontReset';
import { sameValue, useUnsavedChanges } from '../../utils/unsavedChanges';


interface AdminStorefrontTabProps {
  settings?: StorefrontSettings;
  onUpdateSettings?: SaveStorefrontSettings;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Примеры — только подсказки в пустых полях, в настройки не записываются */
const GUARANTEE_EXAMPLES = [
  '100% оригинальность и сертификация каждого изделия.',
  'Расширенная гарантия качества на швы и фурнитуру.',
  'Примерка перед оплатой и легкий возврат без лишних вопросов.',
];

/** Меняет пункт гарантии по номеру; пустые пункты в конце списка не хранятся */
function withGuaranteeItem(list: string[] | undefined, index: number, value: string): string[] {
  const next = [...(list ?? [])];
  while (next.length <= index) next.push('');
  next[index] = value;
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  return next;
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

  // A new version from the database replaces the form only when nothing is being edited:
  // edits not yet applied are not overwritten
  const syncedSettings = useRef(propSettings);
  useEffect(() => {
    if (!propSettings) return;
    const previous = syncedSettings.current;
    syncedSettings.current = propSettings;
    setLocalSettings((local) => (previous && !sameValue(local, previous) ? local : propSettings));
  }, [propSettings]);
  const hasUnappliedChanges = Boolean(propSettings) && !sameValue(localSettings, propSettings);
  useUnsavedChanges(hasUnappliedChanges, 'Витрина');

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // A schedule with a mistake (end before start, a special day without a date) is not written: the errors show at it
  const [showScheduleErrors, setShowScheduleErrors] = useState(false);

  /** Resolves to false when the database rejected the write: App shows the error, no «Сохранено» here */
  const persistSettings = async (next: StorefrontSettings): Promise<boolean> => {
    if (next.schedule && scheduleErrors(next.schedule).length > 0) {
      setShowScheduleErrors(true);
      document.getElementById('storefront-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    setShowScheduleErrors(false);
    saveStorefrontSettings(next);
    if (!onUpdateSettings) return true;
    setIsSaving(true);
    const ok = await onUpdateSettings(next);
    setIsSaving(false);
    return ok !== false;
  };
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

  const handleQuickEditSave = async (key: string, newValue: string) => {
    let newSettings: StorefrontSettings;

    if (key.startsWith('guarantee_')) {
      const idx = parseInt(key.replace('guarantee_', ''), 10);
      newSettings = {
        ...localSettings,
        brandGuaranteesList: withGuaranteeItem(localSettings.brandGuaranteesList, idx, newValue),
      };
    } else if (
      key === 'freeDeliveryThreshold' ||
      key === 'returnPeriodDays'
    ) {
      const num = Math.max(0, parseInt(newValue.replace(/\D/g, ''), 10) || 0);
      newSettings = { ...localSettings, [key]: num };
    } else {
      newSettings = { ...localSettings, [key]: newValue };
    }

    const fieldTitle = editModalConfig?.fieldLabel || editModalConfig?.title || 'Поле';
    setLocalSettings(newSettings);
    if (await persistSettings(newSettings)) {
      onShowToast(`«${fieldTitle}» обновлено`, 'success');
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;
    if (!(await persistSettings(localSettings))) return;

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
    onShowToast('Настройки витрины, реквизиты и данные бренда сохранены', 'success');
  };

  // Only the section's contacts, legal details and texts, from the saved version (not edits waiting for «Применить»):
  // categories, payment, FAQ, labels, schedule, modes and thresholds stay (audit 07.10, stage 8, finding 59-P1)
  const handleResetToDefaults = async () => {
    const next = resetStorefrontTexts(propSettings ?? localSettings);
    setLocalSettings(next);
    if (await persistSettings(next)) {
      onShowToast('Контакты, реквизиты и тексты витрины очищены', 'info');
    }
  };

  // Helper to safely update an item in brandGuaranteesList
  const updateGuaranteeItem = (index: number, val: string) => {
    setLocalSettings({
      ...localSettings,
      brandGuaranteesList: withGuaranteeItem(localSettings.brandGuaranteesList, index, val),
    });
  };

  return (
    <div className="space-y-4 text-[#2D3A4E]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-[#BAC5D5]/50">
        <div>
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-2">
            <Store className="w-4 h-4 text-accent" />
            <span>Управление витриной, брендом и реквизитами</span>
          </h3>
          <p className="text-xs text-[#4E5C70] font-medium mt-0.5">
            Редактирование контактов, VIP-консьержа, юридических реквизитов и философии бренда
          </p>
        </div>

        {/* Toolbar with Clear Button Hierarchy */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Secondary Tools: Preview & Client View */}
          <div className="flex items-center gap-1.5 p-1 neu-inset rounded-xl">
            <button
              type="button"
              onClick={() => setIsClientModalOpen(true)}
              className="py-1.5 px-2.5 sm:px-3 neu-button rounded-lg text-xs font-bold text-accent hover:text-accent-strong transition-all flex items-center gap-1.5 cursor-pointer"
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
                  ? 'neu-inset text-accent font-extrabold'
                  : 'neu-inset text-[#4E5C70] hover:text-[#2D3A4E]'
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
              className="py-2 px-3 neu-button-danger rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Очистить тексты и контакты витрины"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[11px]">Сброс</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="py-2 px-4.5 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-wait"
              title="Применить все изменения к витрине"
            >
              {isSaved ? <Check className="w-4 h-4 text-success" /> : <Save className="w-4 h-4 text-accent" />}
              <span>{isSaving ? 'Сохранение…' : isSaved ? 'Сохранено' : 'Применить'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Reset confirmation: what is cleared and what stays */}
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Очистить контакты, реквизиты и тексты?"
        tone="danger"
        confirmLabel="Очистить"
        cancelLabel="Отмена"
        message={
          <>
            Очистятся телефон, почта, мессенджеры, адрес шоурума, слоган, реквизиты организации и банка, тексты
            консьерж-сервиса и бренда. Покупатели увидят «Не настроено», пока вы не заполните их снова. Название
            магазина, объявление в шапке, график, категории, способы оплаты, FAQ, этикетки, режимы и пороги останутся
            как есть, а неприменённые правки на этой странице отменятся.
          </>
        }
        onConfirm={() => void handleResetToDefaults()}
        onClose={() => setIsResetConfirmOpen(false)}
      />

      {/* LIVE PREVIEW COMPONENT */}
      {showLivePreview && (
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3 border border-accent/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent flex items-center gap-1.5">
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
            <div className="neu-inset rounded-2xl p-3 border border-warning/30 flex items-center gap-2.5 text-warning">
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
              <div className="text-xs">
                <span className="font-extrabold block">Приём заказов на сайте остановлен</span>
                <span className="text-xs text-[#4E5C70]">
                  Оформление и «Заказ в 1 клик» не работают. Покупатели видят плашку на главной и пишут в чат
                  {localSettings.phone ? ` или звонят: ${localSettings.phone}` : ''}.
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
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования названия бренда"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Бренд</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-extrabold text-[#2D3A4E] truncate block">
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
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования юр. лица"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Юр. лицо</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-extrabold text-[#2D3A4E] truncate block">
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
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования ИНН"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">ИНН / КПП</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-extrabold text-[#2D3A4E] truncate block">
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
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого редактирования руководителя"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Руководитель</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-extrabold text-[#2D3A4E] truncate block">
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
                  value: localSettings.freeDeliveryThreshold ? String(localSettings.freeDeliveryThreshold) : '',
                  badge: 'Доставка',
                  description: 'Сумма заказа, начиная с которой доставка становится 0 ₽.',
                })
              }
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для редактирования порога бесплатной доставки"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Беспл. доставка</span>
                <Pencil className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-xs font-extrabold text-success block">
                {localSettings.freeDeliveryThreshold ? `от ${localSettings.freeDeliveryThreshold.toLocaleString('ru-RU')} ₽` : 'не задана'}
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
              className="neu-button rounded-xl p-2.5 text-center hover:border hover:border-accent/40 transition-all cursor-pointer group relative"
              title="Нажмите для быстрого переключения экспресс-доставки"
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-[#4E5C70] block font-bold">Экспресс 2ч</span>
                <Sliders className="w-2.5 h-2.5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span
                className={`text-xs font-extrabold block ${
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
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-accent" />
              Основные контакты бутика и витрины
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Шапка и футер
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="storefront-storeName" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Название бутика / бренда
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-storeName"
                  type="text"
                  value={localSettings.storeName}
                  onChange={(e) => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-storeSlogan" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Слоган / Описание витрины
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-storeSlogan"
                  type="text"
                  value={localSettings.storeSlogan || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, storeSlogan: e.target.value })
                  }
                  placeholder="Бутик премиальной мужской одежды"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-phone" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Телефон горячей линии
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-phone"
                  type="text"
                  value={localSettings.phone}
                  onChange={(e) => setLocalSettings({ ...localSettings, phone: e.target.value })}
                  placeholder="+7 (495) 123-45-67"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-email" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Email клиентской службы
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-email"
                  type="email"
                  value={localSettings.email}
                  onChange={(e) => setLocalSettings({ ...localSettings, email: e.target.value })}
                  placeholder="shop@example.com"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-telegram" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Telegram канал / бот
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-telegram"
                  type="text"
                  value={localSettings.telegram}
                  onChange={(e) => setLocalSettings({ ...localSettings, telegram: e.target.value })}
                  placeholder="@manstyle_official"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-whatsapp" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                WhatsApp для консультаций
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-whatsapp"
                  type="text"
                  value={localSettings.whatsapp}
                  onChange={(e) => setLocalSettings({ ...localSettings, whatsapp: e.target.value })}
                  placeholder="+7 (999) 000-00-00"
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="storefront-pickupAddress" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                Адрес бутика / шоурума
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="storefront-pickupAddress"
                  type="text"
                  value={localSettings.pickupAddress}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, pickupAddress: e.target.value })
                  }
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E]"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* The week, special days and the comment (docs/store-schedule-spec.md) */}
            <AdminScheduleEditor
              schedule={localSettings.schedule}
              comment={localSettings.workingHours}
              onChange={(schedule) => setLocalSettings({ ...localSettings, schedule })}
              onCommentChange={(workingHours) => setLocalSettings({ ...localSettings, workingHours })}
              showErrors={showScheduleErrors}
            />
          </div>

          {/* Top Promotional Announcement Banner */}
          <div className="neu-inset rounded-2xl p-3 space-y-2.5 pt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-accent shrink-0" />
                Промо-сообщение в шапке сайта
              </span>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                <label htmlFor="storefront-isStoreBannerVisible" className="text-[11px] font-bold text-[#4E5C70] whitespace-nowrap cursor-pointer select-none">
                  {localSettings.isStoreBannerVisible ? 'Баннер включен' : 'Баннер скрыт'}
                </label>
                <NeumorphicSwitch
                  id="storefront-isStoreBannerVisible"
                  checked={localSettings.isStoreBannerVisible ?? false}
                  onChange={(checked) => setLocalSettings({ ...localSettings, isStoreBannerVisible: checked })}
                  label="Показывать промо-сообщение в шапке"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-1">
                <label htmlFor="storefront-bannerBadgeText" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст бейджа
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="storefront-bannerBadgeText"
                    type="text"
                    value={localSettings.bannerBadgeText ?? ''}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, bannerBadgeText: e.target.value })
                    }
                    placeholder="АКЦИЯ"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-extrabold text-accent"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="storefront-storeBannerText" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст промо-сообщения
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="storefront-storeBannerText"
                    type="text"
                    value={
                      localSettings.storeBannerText ?? ''
                    }
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, storeBannerText: e.target.value })
                    }
                    placeholder="Текст баннера в верхней строке сайта"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-medium text-[#2D3A4E]"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
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
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Вкладка «Консьерж»: Описание и перечень услуг
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Вкладка 1 из 3
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label htmlFor="storefront-conciergeDescription" className="block text-[11px] font-bold text-[#4E5C70] mb-1.5">
                Приветственное описание консьерж-сервиса
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id="storefront-conciergeDescription"
                  rows={3}
                  value={
                    localSettings.conciergeDescription ??
                    'Персональный ассистент по стилю и сопровождению заказов. Помощь в выборе размера, бронирование закрытых моделей, организация выездной примерки и консультации стилиста.'
                  }
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, conciergeDescription: e.target.value })
                  }
                  className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] resize-none leading-relaxed"
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
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <span className="text-[11px] font-extrabold uppercase text-accent block pt-1">
              Перечень услуг консьерж-сервиса
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Service 1 */}
              <div className="neu-inset rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-extrabold text-[11px] shrink-0">
                      1
                    </span>
                    <span className="text-[11px] font-extrabold text-[#2D3A4E]">Услуга 1</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService1Title" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-conciergeService1Title"
                      type="text"
                      value={localSettings.conciergeService1Title ?? 'Персональный подбор капсулы'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          conciergeService1Title: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService1Desc" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      id="storefront-conciergeService1Desc"
                      rows={3}
                      value={
                        localSettings.conciergeService1Desc ??
                        'Составление законченного гардероба на сезон или под деловые мероприятия стилистом бутика.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService1Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] resize-none leading-relaxed"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Service 2 */}
              <div className="neu-inset rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-extrabold text-[11px] shrink-0">
                      2
                    </span>
                    <span className="text-[11px] font-extrabold text-[#2D3A4E]">Услуга 2</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService2Title" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-conciergeService2Title"
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
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService2Desc" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      id="storefront-conciergeService2Desc"
                      rows={3}
                      value={
                        localSettings.conciergeService2Desc ??
                        'Курьер доставит смежные размеры и фасоны с ожиданием до 30 минут без предоплаты.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService2Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] resize-none leading-relaxed"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Service 3 */}
              <div className="neu-inset rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg neu-flat-sm flex items-center justify-center text-accent font-extrabold text-[11px] shrink-0">
                      3
                    </span>
                    <span className="text-[11px] font-extrabold text-[#2D3A4E]">Услуга 3</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService3Title" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-conciergeService3Title"
                      type="text"
                      value={localSettings.conciergeService3Title ?? 'Подгонка в ателье бутика'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          conciergeService3Title: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-conciergeService3Desc" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      id="storefront-conciergeService3Desc"
                      rows={3}
                      value={
                        localSettings.conciergeService3Desc ??
                        'Бесплатная корректировка длины брюк и посадки пиджака нашим мастером-портным.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, conciergeService3Desc: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] resize-none leading-relaxed"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
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
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-accent" />
              Вкладка «Реквизиты»: Официальные юридические данные
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Вкладка 2 из 3
            </span>
          </div>

          <p className="text-xs text-[#4E5C70]">
            Данные поля транслируются в карточки реквизитов и копируются клиентами при формировании официальных счетов и договоров.
          </p>

          <div className="space-y-3 text-xs">
            {/* 1. Organization & Addresses */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <Building2 className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-extrabold text-[#2D3A4E]">Организация и адреса</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="storefront-legalEntityName" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Юридическое лицо / Организация
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-legalEntityName"
                      type="text"
                      value={localSettings.legalEntityName || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, legalEntityName: e.target.value })
                      }
                      placeholder="ООО «МЭНСТАЙЛ РУС»"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-ceo" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Руководитель / Генеральный директор
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-ceo"
                      type="text"
                      value={localSettings.ceo || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, ceo: e.target.value })}
                      placeholder="Смирнов Александр Владимирович"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-legalAddress" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Юридический адрес компании
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-legalAddress"
                      type="text"
                      value={localSettings.legalAddress || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, legalAddress: e.target.value })
                      }
                      placeholder="Индекс, город, улица, дом, офис"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-edo" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Система электронного документооборота (ЭДО)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-edo"
                      type="text"
                      value={localSettings.edo || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, edo: e.target.value })}
                      placeholder="Диадок (ID: 2BM-7704829104-770401001), СБИС"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
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
            <div className="neu-inset rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-extrabold text-[#2D3A4E]">Государственная регистрация (ФНС)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="storefront-inn" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    ИНН
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-inn"
                      type="text"
                      value={localSettings.inn || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, inn: e.target.value })}
                      placeholder="7704829104"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-kpp" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    КПП
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-kpp"
                      type="text"
                      value={localSettings.kpp || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, kpp: e.target.value })}
                      placeholder="770401001"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-ogrn" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    ОГРН / ОГРНИП
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-ogrn"
                      type="text"
                      value={localSettings.ogrn || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, ogrn: e.target.value })}
                      placeholder="1217700458921"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
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
            <div className="neu-inset rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 border-b border-black/5 pb-2">
                <CreditCard className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-extrabold text-[#2D3A4E]">Банковский счет и расчеты</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="storefront-bankName" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Банк обслуживания
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-bankName"
                      type="text"
                      value={localSettings.bankName || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, bankName: e.target.value })}
                      placeholder="Название банка"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-bik" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    БИК банка
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-bik"
                      type="text"
                      value={localSettings.bik || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, bik: e.target.value })}
                      placeholder="044525225"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-checkingAccount" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Расчетный счет (Р/С)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-checkingAccount"
                      type="text"
                      value={localSettings.checkingAccount || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, checkingAccount: e.target.value })
                      }
                      placeholder="40702810938000012345"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="storefront-corrAccount" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Корреспондентский счет (К/С)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-corrAccount"
                      type="text"
                      value={localSettings.corrAccount || ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, corrAccount: e.target.value })
                      }
                      placeholder="30101810400000000225"
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-mono text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
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
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-accent" />
              Вкладка «Бренд»: Философия, ткани, крой и гарантии
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Вкладка 3 из 3
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Brand Philosophy */}
            <div className="neu-inset rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-extrabold text-[#2D3A4E]">Философия бренда</span>
              </div>
              <div>
                <label htmlFor="storefront-brandPhilosophyTitle" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Заголовок блока
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="storefront-brandPhilosophyTitle"
                    type="text"
                    value={localSettings.brandPhilosophyTitle ?? `Философия бренда ${localSettings.storeName}`}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandPhilosophyTitle: e.target.value })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать в модальном окне"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="storefront-brandPhilosophyText" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Текст манифеста бренда
                </label>
                <div className="flex items-start gap-1.5">
                  <textarea
                    id="storefront-brandPhilosophyText"
                    rows={3}
                    value={
                      localSettings.brandPhilosophyText ??
                      'Wasat Shop — премиальный бутик мужской одежды, основанный на эстетике сдержанной роскоши («Quiet Luxury») и безупречном архитектурном крое. Мы создаем гардероб вне времени, который подчеркивает статус и харизму мужчины без кричащих логотипов.'
                    }
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandPhilosophyText: e.target.value })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E] resize-none leading-relaxed"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80 mt-0.5"
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
              <div className="neu-inset rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-extrabold text-[#2D3A4E]">Материалы и ткани</span>
                </div>
                <div>
                  <label htmlFor="storefront-brandMaterialsTitle" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-brandMaterialsTitle"
                      type="text"
                      value={localSettings.brandMaterialsTitle ?? 'Итальянские ткани'}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, brandMaterialsTitle: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="storefront-brandMaterialsText" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      id="storefront-brandMaterialsText"
                      rows={3}
                      value={
                        localSettings.brandMaterialsText ??
                        'Селективная шерсть Super 150’s от мануфактур Loro Piana и Zegna, длинноволокнистый хлопок Supima и натуральный лен.'
                      }
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, brandMaterialsText: e.target.value })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] resize-none leading-relaxed"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80 mt-0.5"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Craftsmanship */}
              <div className="neu-inset rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-extrabold text-[#2D3A4E]">Крой и пошив</span>
                </div>
                <div>
                  <label htmlFor="storefront-brandCraftsmanshipTitle" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Заголовок
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="storefront-brandCraftsmanshipTitle"
                      type="text"
                      value={localSettings.brandCraftsmanshipTitle ?? 'Эталонный крой'}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          brandCraftsmanshipTitle: e.target.value,
                        })
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label="Редактировать в модальном окне"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="storefront-brandCraftsmanshipText" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                    Описание
                  </label>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      id="storefront-brandCraftsmanshipText"
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
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-[11px] text-[#2D3A4E] resize-none leading-relaxed"
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
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80 mt-0.5"
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
            <div className="neu-inset rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                  <span className="text-[11px] font-extrabold text-[#2D3A4E]">
                    Стандарты подлинности и гарантии
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="storefront-guarantees-title" className="block text-[11px] font-bold text-[#4E5C70] mb-1">
                  Заголовок блока гарантий
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="storefront-guarantees-title"
                    type="text"
                    value={localSettings.brandGuaranteesTitle ?? ''}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, brandGuaranteesTitle: e.target.value })
                    }
                    placeholder="Например: Стандарты подлинности и гарантии"
                    className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs font-bold text-[#2D3A4E]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openQuickEdit({
                        key: 'brandGuaranteesTitle',
                        title: 'О бренде: Гарантии',
                        fieldLabel: 'Заголовок блока гарантий',
                        value: localSettings.brandGuaranteesTitle ?? '',
                        badge: 'Гарантии',
                        description: 'Заголовок секции гарантий подлинности и сервисных стандартов.',
                      })
                    }
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                    title="Редактировать в модальном окне"
                    aria-label="Редактировать заголовок блока гарантий"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <span className="text-[11px] uppercase font-bold text-[#4E5C70] block">
                  Пункты гарантий (до 3, пустые не показываются)
                </span>

                {GUARANTEE_EXAMPLES.map((example, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md neu-flat-sm flex items-center justify-center text-success font-bold text-[11px] shrink-0">
                      ✓
                    </span>
                    <input
                      type="text"
                      value={localSettings.brandGuaranteesList?.[i] ?? ''}
                      onChange={(e) => updateGuaranteeItem(i, e.target.value)}
                      placeholder={`Например: ${example}`}
                      aria-label={`Пункт гарантии ${i + 1}`}
                      className="flex-1 min-w-0 px-2.5 py-1.5 neu-flat-sm rounded-lg text-xs text-[#2D3A4E]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEdit({
                          key: `guarantee_${i}`,
                          title: 'О бренде: Гарантии',
                          fieldLabel: `Пункт гарантии №${i + 1}`,
                          value: localSettings.brandGuaranteesList?.[i] ?? '',
                          badge: `Гарантия ${i + 1}`,
                          description: 'Гарантийное обязательство перед клиентом. Пустой пункт покупателю не показывается.',
                        })
                      }
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                      title="Редактировать в модальном окне"
                      aria-label={`Редактировать пункт гарантии ${i + 1}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. DELIVERY COSTS & THRESHOLD MANAGEMENT */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-accent" />
              Порог бесплатной доставки и срок возврата
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Динамический расчет в корзине
            </span>
          </div>

          <p className="text-xs text-[#4E5C70]">
            Сумма заказа, с которой доставка становится бесплатной, — для способов без своего порога. Цена каждого
            способа доставки и его собственный порог задаются в разделе «Доставка и ПВЗ».
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Free Delivery Threshold */}
            <div className="neu-inset p-3 rounded-2xl space-y-1.5">
              <label htmlFor="storefront-freeDeliveryThreshold" className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Порог бесплатной доставки
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    id="storefront-freeDeliveryThreshold"
                    type="number"
                    min="0"
                    step="500"
                    value={localSettings.freeDeliveryThreshold || ''}
                    placeholder="нет"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        freeDeliveryThreshold: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-extrabold text-success pr-8"
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
                      value: localSettings.freeDeliveryThreshold ? String(localSettings.freeDeliveryThreshold) : '',
                      badge: 'Доставка',
                      description: 'Сумма заказа в рублях, при достижении которой доставка автоматически становится бесплатной (0 ₽).',
                      inputType: 'number',
                      numberMin: 0,
                      numberStep: 500,
                      unit: '₽',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>Пусто — бесплатной доставки от суммы нет</span>
              </div>
            </div>

            {/* Return Period */}
            <div className="neu-inset p-3 rounded-2xl space-y-1.5">
              <label htmlFor="storefront-returnPeriodDays" className="block text-[11px] font-bold text-[#2D3A4E] mb-1 truncate">
                Срок возврата и примерки
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    id="storefront-returnPeriodDays"
                    type="number"
                    min="1"
                    max="90"
                    value={localSettings.returnPeriodDays || ''}
                    placeholder="не задан"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        // empty = not set: customers are not told a return period
                        returnPeriodDays: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 neu-button rounded-xl text-xs font-extrabold text-accent pr-10"
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
                      value: localSettings.returnPeriodDays ? String(localSettings.returnPeriodDays) : '',
                      badge: 'Гарантии',
                      description: 'Количество дней на примерку и возврат товара надлежащего качества.',
                      inputType: 'number',
                      numberMin: 1,
                      numberMax: 90,
                      numberStep: 1,
                      unit: 'дн.',
                    })
                  }
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all shrink-0 cursor-pointer border border-white/80"
                  title="Редактировать в модальном окне"
                  aria-label="Редактировать в модальном окне"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4E5C70] pt-0.5">
                <span>В карточках товаров</span>
                <span className="font-bold text-accent">{localSettings.returnPeriodDays ? `${localSettings.returnPeriodDays} дн.` : 'не показывается'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. SYSTEM MODES & SWITCHES */}
        <div className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 border border-transparent">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              Системные режимы витрины и логистики
            </h4>
            <span className="text-[11px] font-extrabold text-accent neu-flat-sm px-2.5 py-1 rounded-lg border border-white/80">
              Глобальные переключатели
            </span>
          </div>

          <p className="text-xs text-[#4E5C70]">
            Прием заказов, экспресс-доставка и предзаказ товаров, которых нет на складе.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Online Storefront */}
            <div className="neu-inset p-3 rounded-2xl flex items-center justify-between gap-2 border border-black/5">
              <label htmlFor="storefront-isStoreOnline" className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isStoreOnline ? 'text-accent' : 'text-[#4E5C70]'
                }`}>
                  <Store className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-extrabold text-[#2D3A4E] block truncate">Онлайн-витрина</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isStoreOnline ? 'text-success' : 'text-warning'
                  }`}>
                    {localSettings.isStoreOnline ? 'Приём заказов активен' : 'Приём заказов остановлен'}
                  </span>
                </div>
              </label>
              <NeumorphicSwitch
                id="storefront-isStoreOnline"
                checked={Boolean(localSettings.isStoreOnline)}
                onChange={(checked) => setLocalSettings({ ...localSettings, isStoreOnline: checked })}
                label="Онлайн-витрина"
              />
            </div>

            {/* Express Delivery */}
            <div className="neu-inset p-3 rounded-2xl flex items-center justify-between gap-2 border border-black/5">
              <label htmlFor="storefront-isExpressEnabled" className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isExpressEnabled ? 'text-accent' : 'text-[#4E5C70]'
                }`}>
                  <Clock className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-extrabold text-[#2D3A4E] block truncate">Экспресс 2 часа</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isExpressEnabled ? 'text-success' : 'text-[#4E5C70]'
                  }`}>
                    {localSettings.isExpressEnabled ? 'Доступна клиентам' : 'Временно отключена'}
                  </span>
                </div>
              </label>
              <NeumorphicSwitch
                id="storefront-isExpressEnabled"
                checked={Boolean(localSettings.isExpressEnabled)}
                onChange={(checked) => setLocalSettings({ ...localSettings, isExpressEnabled: checked })}
                label="Экспресс 2 часа"
              />
            </div>

            {/* Preorder Mode */}
            <div className="neu-inset p-3 rounded-2xl flex items-center justify-between gap-2 border border-black/5">
              <label htmlFor="storefront-isPreorderMode" className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                <div className={`w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center shrink-0 transition-colors ${
                  localSettings.isPreorderMode ? 'text-accent' : 'text-[#4E5C70]'
                }`}>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="space-y-0.5 truncate">
                  <span className="text-xs font-extrabold text-[#2D3A4E] block truncate">Предзаказ</span>
                  <span className={`text-[11px] font-bold block truncate ${
                    localSettings.isPreorderMode ? 'text-accent' : 'text-[#4E5C70]'
                  }`}>
                    {localSettings.isPreorderMode ? 'Можно заказать без остатка' : 'Только в наличии'}
                  </span>
                </div>
              </label>
              <NeumorphicSwitch
                id="storefront-isPreorderMode"
                checked={Boolean(localSettings.isPreorderMode)}
                onChange={(checked) => setLocalSettings({ ...localSettings, isPreorderMode: checked })}
                label="Предзаказ"
              />
            </div>
          </div>

          {/* Unpaid orders give their goods back (stage 5 without Blaze): a made-up order does not hold the stock */}
          <div className="neu-inset p-3 rounded-2xl space-y-1.5">
            <label htmlFor="storefront-unpaidOrderCancelDays" className="block text-xs font-extrabold text-[#2D3A4E]">
              Отменять неоплаченные заказы через
            </label>
            <div className="relative max-w-[12rem]">
              <input
                id="storefront-unpaidOrderCancelDays"
                type="number"
                min="1"
                max="30"
                value={localSettings.unpaidOrderCancelDays || ''}
                placeholder="не отменять"
                aria-describedby="storefront-unpaidOrderCancelDays-hint"
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    // empty = off
                    unpaidOrderCancelDays: Math.min(30, Math.max(0, Math.round(Number(e.target.value) || 0))),
                  })
                }
                className="w-full px-3 py-2 neu-button rounded-xl text-xs font-extrabold text-accent pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4E5C70]">дн.</span>
            </div>
            <p id="storefront-unpaidOrderCancelDays-hint" className="text-[11px] text-[#4E5C70]">
              Заказ в «Принят» со статусом «Ожидает оплаты» отменяется с причиной «Заказ не оплачен», товар возвращается на
              склад. Срабатывает, когда вы открываете «Заказы». Чек на проверке и оплата при получении не отменяются. Пусто —
              не отменять.
            </p>
          </div>
        </div>

        {/* Orders validated by the placeOrder Cloud Function */}
        <AdminServerOrdersCard onShowToast={onShowToast} />

        {/* Free backup: a JSON copy of the database on the owner's device */}
        <AdminBackupCard onShowToast={onShowToast} />

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2 gap-3 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setIsClientModalOpen(true)}
            className="py-3 px-5 neu-button rounded-2xl text-xs font-bold text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Crown className="w-4 h-4 text-accent" />
            <span>Проверить окно «Бренд и реквизиты»</span>
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="py-3 px-6 neu-button rounded-2xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center gap-2 cursor-pointer transition-transform disabled:opacity-60 disabled:cursor-wait"
          >
            {isSaved ? <Check className="w-4 h-4 text-success" /> : <Save className="w-4 h-4 text-accent" />}
            <span>{isSaving ? 'Сохранение…' : isSaved ? 'Сохранено' : 'Применить настройки к витрине'}</span>
          </button>
        </div>
      </form>

      {/* Edits made in the form are applied by one button that stays in view */}
      {hasUnappliedChanges && (
        <div className="sticky bottom-0 z-10 pt-2 pb-1">
          <div className="neu-flat rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap border border-white/80">
            <p className="text-xs font-bold text-[#2D3A4E] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-hidden="true" />
              Есть несохраненные изменения
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => propSettings && setLocalSettings(propSettings)}
                disabled={isSaving}
                className="h-9 px-3.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer disabled:opacity-60"
              >
                Отменить
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="h-9 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Сохранение…' : 'Применить'}
              </button>
            </div>
          </div>
        </div>
      )}

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
