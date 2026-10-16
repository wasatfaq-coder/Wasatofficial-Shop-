import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { AdminBackupCard } from '../AdminBackupCard';
import { AdminHint } from '../AdminHint';
import { ConfirmDialog } from '../../ConfirmDialog';

interface StorefrontDataSectionProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Очищает контакты, реквизиты и тексты в сохранённой версии; false — база отказала */
  onResetTexts: () => Promise<boolean>;
  /** Пока идёт запись «Применить» или очистка */
  busy: boolean;
}

/**
 * «Резервная копия»: всё, что здесь нажато, сохраняется сразу, без «Применить» (копия базы, восстановление из неё,
 * очистка контактов и текстов). Замена старого названия на новое — карточка над «Витриной» в панели.
 */
export const StorefrontDataSection: React.FC<StorefrontDataSectionProps> = ({ onShowToast, onResetTexts, busy }) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-text-primary">Сохраняется сразу, без «Применить»</p>

      <AdminBackupCard onShowToast={onShowToast} />

      <section className="neu-flat p-4 sm:p-5 rounded-3xl space-y-3 ">
        <div className="flex items-center gap-1">
          <h4 className="text-sm font-extrabold text-text-primary">Очистить контакты и тексты</h4>
          <AdminHint label="Очистить контакты и тексты">
            Очищает контакты, реквизиты и тексты о бренде. Товары, заказы, категории и оплата остаются.
          </AdminHint>
        </div>
        <p className="text-xs text-text-secondary leading-snug">
          Покупатели увидят «Не настроено», пока вы не заполните эти поля снова. Название магазина, объявление в
          шапке, график, категории, способы оплаты, FAQ, этикетки, режимы и пороги останутся как есть.
        </p>
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={busy}
          className="py-2 px-3.5 neu-button-danger rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-wait"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Очистить контакты и тексты
        </button>
      </section>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Очистить контакты, реквизиты и тексты?"
        tone="danger"
        confirmLabel="Очистить"
        cancelLabel="Отмена"
        message={
          <>
            Очистятся телефон, почта, мессенджеры, адрес магазина, слоган, реквизиты организации и банка, тексты
            консьерж-сервиса и бренда. Покупатели увидят «Не настроено», пока вы не заполните их снова. Название
            магазина, объявление в шапке, график, категории, способы оплаты, FAQ, этикетки, режимы и пороги останутся
            как есть. Неприменённые правки в очищаемых полях пропадут.
          </>
        }
        onConfirm={() => {
          setIsConfirmOpen(false);
          void onResetTexts();
        }}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};
