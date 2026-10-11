import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Check, Crown, Save, Store } from 'lucide-react';
import { SaveStorefrontSettings, StorefrontSettings } from '../../types';
import { loadStorefrontSettings, saveStorefrontSettings } from '../../utils/inventory';
import { scheduleErrors } from '../../utils/storeSchedule';
import { STOREFRONT_RESET_FIELDS, resetStorefrontTexts } from '../../utils/storefrontReset';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { BrandRequisitesModal } from '../BrandRequisitesModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { ModalPortal } from '../ModalPortal';
import { StorefrontBrandSection } from './storefront/StorefrontBrandSection';
import { StorefrontContactsSection } from './storefront/StorefrontContactsSection';
import { StorefrontDataSection } from './storefront/StorefrontDataSection';
import { StorefrontOrdersSection } from './storefront/StorefrontOrdersSection';
import { StorefrontRequisitesSection } from './storefront/StorefrontRequisitesSection';
import {
  STOREFRONT_SECTIONS,
  formFieldsChanged,
  mergeFormFields,
  mergeIncoming,
  type StorefrontSectionId,
} from './storefront/storefrontForm';

interface AdminStorefrontTabProps {
  settings?: StorefrontSettings;
  onUpdateSettings?: SaveStorefrontSettings;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** How long «Сохранено» stays in the bar after «Применить» */
const SAVED_MARK_MS = 2500;

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
/** The section tabs run down the left side on a computer (lg), so the arrow keys follow that direction */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}

/** The saved settings with the reset fields taken from `source` */
function withResetFields(target: StorefrontSettings, source: StorefrontSettings): StorefrontSettings {
  const next: Record<string, unknown> = { ...(target as unknown as Record<string, unknown>) };
  const from = source as unknown as Record<string, unknown>;
  for (const field of [...STOREFRONT_RESET_FIELDS, 'brandGuaranteesList']) next[field] = from[field];
  return next as unknown as StorefrontSettings;
}

/**
 * Admin → «Витрина»: sections instead of one long page (stage 6 of docs/admin-wholesale-plan.md). Everything the form
 * edits is applied by one «Применить» in the bar at the bottom; only «Резервная копия» saves at once.
 * The form owns just its own fields (`STOREFRONT_FORM_FIELDS`): the rest of the document is taken from the database
 * as it is when «Применить» is pressed.
 */
export const AdminStorefrontTab: React.FC<AdminStorefrontTabProps> = ({
  settings: propSettings,
  onUpdateSettings,
  onShowToast,
}) => {
  const isDesktop = useIsDesktop();
  const [saved, setSaved] = useState<StorefrontSettings>(() => propSettings ?? loadStorefrontSettings());
  const savedRef = useRef(saved);
  const [localSettings, setLocalSettings] = useState<StorefrontSettings>(saved);
  const markSaved = useCallback((next: StorefrontSettings) => {
    savedRef.current = next;
    setSaved(next);
  }, []);

  // A new version from the database refreshes what the owner did not touch; edits not yet applied stay
  useEffect(() => {
    if (!propSettings || propSettings === savedRef.current) return;
    const previous = savedRef.current;
    markSaved(propSettings);
    setLocalSettings((local) => mergeIncoming(local, previous, propSettings));
  }, [propSettings, markSaved]);

  const patch = useCallback(
    (change: Partial<StorefrontSettings>) => setLocalSettings((local) => ({ ...local, ...change })),
    []
  );

  const hasUnappliedChanges = formFieldsChanged(localSettings, saved);
  useUnsavedChanges(hasUnappliedChanges, 'Витрина');

  const [section, setSection] = useState<StorefrontSectionId>('orders');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // A schedule with a mistake is not written: the errors show at it, on its section
  const [showScheduleErrors, setShowScheduleErrors] = useState(false);
  const [scrollToSchedule, setScrollToSchedule] = useState(false);

  const savedMarkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(savedMarkTimer.current), []);

  useEffect(() => {
    if (!scrollToSchedule || section !== 'contacts') return;
    setScrollToSchedule(false);
    document.getElementById('storefront-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollToSchedule, section]);

  /**
   * Writes `next`; the form and «Сохранено» change only after the database answered true. `SaveStorefrontSettings`
   * may return nothing (`void`): that is taken as success, the way the screen worked before.
   */
  const write = async (next: StorefrontSettings, before: StorefrontSettings): Promise<boolean> => {
    setIsSaving(true);
    try {
      const ok = onUpdateSettings ? (await onUpdateSettings(next)) !== false : true;
      if (!ok) {
        // the app may already show `next` as the saved version: the form must not look saved
        markSaved(before);
        return false;
      }
      saveStorefrontSettings(next);
      markSaved(next);
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    const before = savedRef.current;
    const next = mergeFormFields(before, localSettings);
    if (next.schedule && scheduleErrors(next.schedule).length > 0) {
      setShowScheduleErrors(true);
      setSection('contacts');
      setScrollToSchedule(true);
      return;
    }
    setShowScheduleErrors(false);
    if (!(await write(next, before))) return;
    setLocalSettings((local) => mergeIncoming(local, before, next));
    setIsSaved(true);
    clearTimeout(savedMarkTimer.current);
    savedMarkTimer.current = setTimeout(() => setIsSaved(false), SAVED_MARK_MS);
    onShowToast('Настройки витрины сохранены', 'success');
  };

  // Only the contacts, legal details and texts, in the saved version (not the edits waiting for «Применить» in other
  // fields): categories, payment, FAQ, labels, schedule, modes and thresholds stay (audit 07.10, stage 8, 59-П1)
  const handleResetTexts = async (): Promise<boolean> => {
    if (isSaving) return false;
    const before = savedRef.current;
    const cleared = resetStorefrontTexts(before);
    if (!(await write(cleared, before))) return false;
    setLocalSettings((local) => mergeIncoming(withResetFields(local, before), before, cleared));
    onShowToast('Контакты, реквизиты и тексты витрины очищены', 'info');
    return true;
  };

  const handleCancelChanges = () => {
    setLocalSettings(savedRef.current);
    setShowScheduleErrors(false);
  };

  const sectionProps = { settings: localSettings, patch };

  return (
    <div className="space-y-4 text-[#2D3A4E]">
      <div className="flex items-start justify-between gap-3 flex-wrap pb-2 border-b border-[#BAC5D5]/50">
        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-2">
            <Store className="w-4 h-4 text-accent" aria-hidden="true" />
            <span>Витрина</span>
          </h3>
          <p className="text-xs text-[#4E5C70] font-medium mt-0.5">
            Название, контакты, график, приём заказов, реквизиты и тексты о бренде
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPreviewOpen(true)}
          className="h-9 px-3.5 neu-button rounded-xl text-xs font-bold text-accent hover:text-accent-strong flex items-center gap-1.5 cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5" aria-hidden="true" />
          Бренд и реквизиты
        </button>
      </div>

      <Tabs.Root
        value={section}
        onValueChange={(value) => setSection(value as StorefrontSectionId)}
        orientation={isDesktop ? 'vertical' : 'horizontal'}
        className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-5 lg:items-start"
      >
        <Tabs.List
          aria-label="Разделы витрины"
          className="flex gap-1.5 overflow-x-auto p-1 -m-1 lg:flex-col lg:overflow-visible lg:sticky lg:top-0"
        >
          {STOREFRONT_SECTIONS.map(({ id, label }) => (
            <Tabs.Tab
              key={id}
              value={id}
              className={`shrink-0 whitespace-nowrap h-10 px-3.5 rounded-xl text-xs font-bold cursor-pointer lg:text-left ${
                section === id ? 'neu-pill-active text-accent font-extrabold' : 'neu-button text-[#4E5C70]'
              }`}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div className="min-w-0">
          <Tabs.Panel value="orders">
            <StorefrontOrdersSection {...sectionProps} onShowToast={onShowToast} />
          </Tabs.Panel>
          <Tabs.Panel value="contacts">
            <StorefrontContactsSection {...sectionProps} showScheduleErrors={showScheduleErrors} />
          </Tabs.Panel>
          <Tabs.Panel value="requisites">
            <StorefrontRequisitesSection {...sectionProps} />
          </Tabs.Panel>
          <Tabs.Panel value="brand">
            <StorefrontBrandSection {...sectionProps} />
          </Tabs.Panel>
          <Tabs.Panel value="data">
            <StorefrontDataSection onShowToast={onShowToast} onResetTexts={handleResetTexts} busy={isSaving} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>

      {/* Edits made in the form are applied by one button that stays in view */}
      {(hasUnappliedChanges || isSaved || isSaving) && (
        <div className="sticky bottom-0 z-10 pt-2 pb-1">
          <div className="neu-flat rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap border border-white/80">
            {hasUnappliedChanges || isSaving ? (
              <p className="text-xs font-bold text-[#2D3A4E] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-hidden="true" />
                Есть несохранённые изменения
              </p>
            ) : (
              <p role="status" className="text-xs font-bold text-success flex items-center gap-2">
                <Check className="w-4 h-4" aria-hidden="true" />
                Сохранено
              </p>
            )}
            {(hasUnappliedChanges || isSaving) && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsCancelConfirmOpen(true)}
                  disabled={isSaving}
                  className="h-9 px-3.5 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer disabled:opacity-60"
                >
                  Отменить
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="h-9 px-4 neu-button-accent rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {isSaving ? 'Сохранение…' : 'Применить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isCancelConfirmOpen}
        title="Отменить несохранённые изменения?"
        tone="neutral"
        confirmLabel="Отменить изменения"
        cancelLabel="Вернуться к правкам"
        message="Всё, что вы изменили в «Витрине» и не применили, пропадёт: поля вернутся к сохранённому."
        onConfirm={handleCancelChanges}
        onClose={() => setIsCancelConfirmOpen(false)}
      />

      <ModalPortal>
        <BrandRequisitesModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          storefrontSettings={localSettings}
        />
      </ModalPortal>
    </div>
  );
};
