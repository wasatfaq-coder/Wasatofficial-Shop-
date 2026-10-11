import React from 'react';
import type { SaveStorefrontSettings, StorefrontSettings, StorePaymentMethod } from '../../types';
import { AdminListEditor } from './AdminListEditor';
import { AdminPaymentTemplatesCard } from './AdminPaymentTemplatesCard';

interface AdminPaymentTabProps {
  settings: StorefrontSettings;
  onUpdateSettings?: SaveStorefrontSettings;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Admin → «Оплата»: the payment methods offered at checkout and the requisites templates for orders */
export const AdminPaymentTab: React.FC<AdminPaymentTabProps> = ({ settings, onUpdateSettings, onShowToast }) => {
  const noShownMethod = !(settings.paymentMethods ?? []).some((m) => m.title.trim() && m.isActive !== false);
  return (
  <div className="space-y-4">
  {noShownMethod && (
    <p role="status" className="rounded-2xl p-3 text-xs font-bold text-[#2D3A4E] bg-warning-soft border border-warning/30">
      Покупатели не смогут оформить заказ: нет ни одного показанного способа оплаты
    </p>
  )}
  <AdminListEditor<StorePaymentMethod>
    title="Способы оплаты"
    titleHint="Что покупатель выбирает при заказе. Сайт денег не принимает: вы даёте инструкцию."
    description="Покупатель выбирает один из них при оформлении и видит вашу инструкцию. Онлайн-оплаты на сайте нет: укажите, как перевести деньги."
    emptyTitle="Способы оплаты"
    emptyHint="Пока способов нет, покупатели не могут оформить заказ (заказ в 1 клик доступен)."
    items={settings.paymentMethods ?? []}
    addLabel="Добавить способ"
    createItem={() => ({ id: `pay-${Date.now()}`, title: '', description: '', onDelivery: false, isActive: true })}
    fields={[
      { key: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Перевод по номеру телефона' },
      {
        key: 'description',
        label: 'Инструкция для покупателя',
        type: 'textarea',
        help: 'Куда и сколько перевести. Если пусто, покупатель увидит «не настроено».',
        placeholder: 'Например: переведите сумму заказа по номеру +7 … (банк …), в комментарии укажите номер заказа',
      },
      {
        key: 'onDelivery',
        label: 'Оплата при получении',
        type: 'checkbox',
        hint: 'Заказ получит статус «оплата при получении»',
        help: 'Заказ уйдёт в работу без предоплаты, платят курьеру или в пункте.',
      },
    ]}
    visibleKey="isActive"
    renderSummary={(m) => (
      <div className="space-y-0.5">
        <p className="text-xs font-extrabold text-[#2D3A4E] flex items-center gap-2 flex-wrap">
          {m.title}
          {m.onDelivery && <span className="text-[11px] font-bold text-[#4E5C70]">при получении</span>}
        </p>
        <p className="text-xs text-[#4E5C70] line-clamp-2">{m.description || 'Инструкция: не настроено'}</p>
      </div>
    )}
    onSave={(paymentMethods) => onUpdateSettings?.({ ...settings, paymentMethods })}
    onShowToast={onShowToast}
  />
  <AdminPaymentTemplatesCard onShowToast={onShowToast} />
  </div>
  );
};
