import React from 'react';
import type { StoreFaqItem, StorefrontSettings } from '../../types';
import { AdminListEditor } from './AdminListEditor';

interface AdminFaqTabProps {
  settings: StorefrontSettings;
  onUpdateSettings?: (settings: StorefrontSettings) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Admin → «FAQ»: questions and answers shown in the storefront «Помощь и FAQ» window */
export const AdminFaqTab: React.FC<AdminFaqTabProps> = ({ settings, onUpdateSettings, onShowToast }) => (
  <AdminListEditor<StoreFaqItem>
    title="Вопросы и ответы"
    description="Показываются покупателям в окне FAQ в указанном порядке. В тексте можно писать {FREE_DELIVERY} и {RETURN_DAYS} — подставятся порог бесплатной доставки и срок возврата из «Витрины»."
    emptyTitle="Вопросы и ответы"
    emptyHint="Пока вопросов нет, покупатели видят «Вопросы и ответы: не настроено» и кнопку чата."
    items={settings.faqItems ?? []}
    addLabel="Добавить вопрос"
    createItem={() => ({ id: `faq-${Date.now()}`, question: '', answer: '', isActive: true })}
    fields={[
      { key: 'question', label: 'Вопрос', type: 'text', required: true, placeholder: 'Как вернуть товар?' },
      { key: 'answer', label: 'Ответ', type: 'textarea', required: true },
      { key: 'isActive', label: 'Показывать покупателям', type: 'checkbox' },
    ]}
    renderSummary={(q) => (
      <div className="space-y-0.5">
        <p className="text-xs font-black text-[#2D3A4E]">
          {q.question}
          {q.isActive === false && <span className="ml-2 text-[11px] font-bold text-warning">скрыт</span>}
        </p>
        <p className="text-[11px] text-[#4E5C70] line-clamp-2">{q.answer}</p>
      </div>
    )}
    onSave={(faqItems) => onUpdateSettings?.({ ...settings, faqItems })}
    onShowToast={onShowToast}
  />
);
