import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { NotConfigured } from '../NotConfigured';

export type ListField<T> = {
  key: keyof T & string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'select';
  placeholder?: string;
  required?: boolean;
  /** For type 'select' */
  options?: { value: string; label: string }[];
  /** Shown under a checkbox */
  hint?: string;
};

interface AdminListEditorProps<T extends { id: string }> {
  title: string;
  description: string;
  /** Name of the list for «…: не настроено», e.g. «Способы оплаты» */
  emptyTitle: string;
  emptyHint: string;
  items: T[];
  fields: ListField<T>[];
  /** Blank item for the «Добавить» form */
  createItem: (items: T[]) => T;
  /** Line shown for an item in the list */
  renderSummary: (item: T) => React.ReactNode;
  /** Saves the whole list (the parent writes it to Firestore) */
  onSave: (items: T[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  addLabel?: string;
  /** Optional one-click fill, e.g. «Взять категории из товаров» */
  quickAction?: { label: string; run: (items: T[]) => T[]; disabledReason?: string };
}

/**
 * Admin editor for a simple list stored in the store settings: add, edit, delete (with confirmation),
 * reorder. Every change is saved at once; an empty list is shown as «Не настроено».
 */
export function AdminListEditor<T extends { id: string }>({
  title,
  description,
  emptyTitle,
  emptyHint,
  items,
  fields,
  createItem,
  renderSummary,
  onSave,
  onShowToast,
  addLabel = 'Добавить',
  quickAction,
}: AdminListEditorProps<T>) {
  const [draft, setDraft] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [toDelete, setToDelete] = useState<T | null>(null);

  const startAdd = () => {
    setDraft(createItem(items));
    setIsNew(true);
  };
  const startEdit = (item: T) => {
    setDraft({ ...item });
    setIsNew(false);
  };
  const cancel = () => setDraft(null);

  const missing = draft
    ? fields.filter((f) => f.required && !String((draft as Record<string, unknown>)[f.key] ?? '').trim())
    : [];

  const saveDraft = () => {
    if (!draft) return;
    if (missing.length > 0) {
      onShowToast(`Заполните: ${missing.map((f) => f.label.toLowerCase()).join(', ')}`, 'error');
      return;
    }
    const next = isNew ? [...items, draft] : items.map((it) => (it.id === draft.id ? draft : it));
    onSave(next);
    onShowToast(isNew ? 'Добавлено' : 'Изменения сохранены', 'success');
    setDraft(null);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onSave(next);
  };

  const setField = (key: string, value: unknown) =>
    setDraft((prev) => (prev ? ({ ...prev, [key]: value } as T) : prev));

  return (
    <div className="space-y-4">
      <div className="neu-flat rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#2D3A4E]">{title}</h3>
            <p className="text-[11px] text-[#4E5C70] leading-snug mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {quickAction && (
              <button
                type="button"
                onClick={() => {
                  const next = quickAction.run(items);
                  if (next.length === items.length) {
                    onShowToast(quickAction.disabledReason || 'Нечего добавить', 'info');
                    return;
                  }
                  onSave(next);
                  onShowToast(`Добавлено: ${next.length - items.length}`, 'success');
                }}
                className="py-2 px-3 neu-button rounded-xl text-xs font-bold text-accent cursor-pointer"
              >
                {quickAction.label}
              </button>
            )}
            <button
              type="button"
              onClick={startAdd}
              disabled={Boolean(draft)}
              className="py-2 px-3 neu-button-accent rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              {addLabel}
            </button>
          </div>
        </div>

        {draft && (
          <div className="neu-inset rounded-2xl p-3.5 space-y-3">
            {fields.map((field) => {
              const value = (draft as Record<string, unknown>)[field.key];
              const id = `field-${field.key}`;
              if (field.type === 'checkbox') {
                return (
                  <label key={field.key} htmlFor={id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      id={id}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => setField(field.key, e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-accent"
                    />
                    <span>
                      <span className="text-xs font-bold text-[#2D3A4E] block">{field.label}</span>
                      {field.hint && <span className="text-[11px] text-[#4E5C70] block">{field.hint}</span>}
                    </span>
                  </label>
                );
              }
              return (
                <div key={field.key} className="space-y-1">
                  <label htmlFor={id} className="text-[11px] font-bold text-[#4E5C70] block">
                    {field.label}
                    {field.required && ' *'}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={id}
                      rows={3}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] resize-y leading-relaxed"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={id}
                      value={String(value ?? '')}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    >
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type="text"
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="w-full px-3 py-2 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF]"
                    />
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancel}
                className="py-2 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Отмена
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={missing.length > 0}
                className="py-2 px-3 neu-button rounded-xl text-xs font-black text-accent flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5" />
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <NotConfigured title={emptyTitle} hint={emptyHint} />
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={item.id} className="neu-flat-sm rounded-2xl p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">{renderSummary(item)}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="w-8 h-8 neu-button rounded-xl flex items-center justify-center text-[#4E5C70] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Выше"
                  title="Выше"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  className="w-8 h-8 neu-button rounded-xl flex items-center justify-center text-[#4E5C70] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Ниже"
                  title="Ниже"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  disabled={Boolean(draft)}
                  className="w-8 h-8 neu-button rounded-xl flex items-center justify-center text-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Изменить"
                  title="Изменить"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setToDelete(item)}
                  className="w-8 h-8 neu-button-danger rounded-xl flex items-center justify-center cursor-pointer"
                  aria-label="Удалить"
                  title="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Удалить запись?"
        message="Запись будет удалена из базы, покупатели перестанут её видеть."
        onConfirm={() => {
          if (!toDelete) return;
          onSave(items.filter((it) => it.id !== toDelete.id));
          onShowToast('Удалено', 'info');
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
