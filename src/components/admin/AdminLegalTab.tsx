import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Eye, FileText, Loader2, Pencil, RotateCcw, Save } from 'lucide-react';
import type { StorefrontSettings } from '../../types';
import {
  LEGAL_DOC_HREF,
  LEGAL_DOC_IDS,
  LEGAL_DOC_TITLES,
  LEGAL_TEMPLATE_DATE,
  type LegalDocId,
  type LegalTexts,
  fillLegalText,
  formatLegalDate,
  legalPlaceholders,
  missingLegalRequisites,
} from '../../utils/legalDocs';
import { LEGAL_TEMPLATES } from '../../utils/legalTemplates';
import { subscribeToLegalTexts } from '../../utils/firebaseSync';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { LegalText } from '../LegalText';
import { ConfirmDialog } from '../ConfirmDialog';
import { siteUrl } from '../../views/LegalDocumentScreen';

interface AdminLegalTabProps {
  settings: StorefrontSettings;
  /** Saves the store's edition; null — back to the template. Resolves false when the write failed (toast shown) */
  onSaveLegalText?: (id: LegalDocId, text: string | null) => Promise<boolean>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * Admin → «Документы»: the public offer and the personal data policy. The template with the requisites from
 * «Витрина» is published as is; the owner can edit the text (placeholders stay live) or go back to the template.
 */
export const AdminLegalTab: React.FC<AdminLegalTabProps> = ({ settings, onSaveLegalText, onShowToast }) => {
  const [texts, setTexts] = useState<LegalTexts | null>(null);
  const [docId, setDocId] = useState<LegalDocId>('offer');
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<LegalDocId | null>(null);

  useEffect(() => subscribeToLegalTexts(setTexts), []);

  const edition = texts?.[docId];
  const saved = edition?.text ?? LEGAL_TEMPLATES[docId];
  const value = draft ?? saved;
  const dirty = draft !== null && draft !== saved;
  useUnsavedChanges(dirty, 'Документы');

  const missing = missingLegalRequisites(settings);
  const placeholders = useMemo(() => legalPlaceholders(settings, siteUrl()), [settings]);
  const filled = useMemo(() => fillLegalText(value, placeholders), [value, placeholders]);

  const switchDoc = (id: LegalDocId) => {
    if (id === docId) return;
    if (dirty) {
      setPendingDoc(id);
      return;
    }
    setDocId(id);
    setDraft(null);
  };

  const save = async (text: string | null) => {
    if (!onSaveLegalText) return;
    setSaving(true);
    // The template text unchanged is not stored: later template updates then reach the store
    const toStore = text !== null && text.trim() === LEGAL_TEMPLATES[docId].trim() ? null : text;
    const ok = await onSaveLegalText(docId, toStore);
    setSaving(false);
    if (ok) {
      setDraft(null);
      onShowToast(toStore === null ? `${LEGAL_DOC_TITLES[docId]}: снова шаблон` : `${LEGAL_DOC_TITLES[docId]}: сохранено`, 'success');
    }
  };

  return (
    <div className="space-y-4">
      <div className="neu-flat rounded-3xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
            <FileText className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-[#2D3A4E]">Оферта и политика персональных данных</h3>
            <p className="text-[11px] text-[#4E5C70] leading-snug mt-0.5">
              Покупатели видят документы на сайте и принимают оферту кнопкой «Подтвердить заказ». Текст — шаблон по
              Закону о защите прав потребителей и 152-ФЗ; реквизиты подставляются из «Витрины». Текст можно изменить:
              метки вида {'{{продавец}}'} заменяются реквизитами при показе.
            </p>
          </div>
        </div>

        {missing.length > 0 ? (
          <div role="status" className="rounded-2xl p-3 bg-warning-soft border border-warning/30 text-xs text-[#2D3A4E]">
            <p className="font-bold text-warning">Документы не показываются покупателям</p>
            <p className="text-[11px] mt-0.5 leading-snug">
              Заполните в «Витрине» → «Реквизиты»: {missing.join(', ')}. До этого оформление заказа работает без ссылки на
              оферту.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-bold text-success">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Опубликованы
            </span>
            {LEGAL_DOC_IDS.map((id) => (
              <a
                key={id}
                href={LEGAL_DOC_HREF[id]}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-bold text-accent hover:underline"
              >
                {LEGAL_DOC_TITLES[id]} <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="neu-flat rounded-3xl p-4 space-y-3">
        <div role="radiogroup" aria-label="Документ" className="flex flex-wrap gap-2">
          {LEGAL_DOC_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={docId === id}
              onClick={() => switchDoc(id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                docId === id ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
              }`}
            >
              {LEGAL_DOC_TITLES[id]}
            </button>
          ))}
        </div>

        {texts === null ? (
          <p className="flex items-center gap-2 text-xs text-[#4E5C70]" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Загрузка…
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-[#4E5C70]">
                {edition
                  ? `Текст магазина, изменен ${formatLegalDate(edition.updatedAt)}`
                  : `Шаблон, редакция от ${formatLegalDate(LEGAL_TEMPLATE_DATE)}`}
                {dirty && <span className="ml-2 font-bold text-warning">есть несохраненные изменения</span>}
              </p>
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                aria-pressed={preview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl neu-button text-xs font-bold text-accent cursor-pointer"
              >
                {preview ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                {preview ? 'Редактировать' : 'Как увидит покупатель'}
              </button>
            </div>

            {preview ? (
              <div className="neu-inset rounded-2xl p-4 max-h-[60vh] overflow-y-auto">
                <LegalText text={filled} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="legal-doc-text" className="block text-xs font-bold text-[#2D3A4E]">
                  Текст документа
                </label>
                <textarea
                  id="legal-doc-text"
                  value={value}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={18}
                  spellCheck
                  className="w-full neu-inset rounded-2xl p-3.5 text-xs leading-relaxed text-[#2D3A4E] resize-y font-mono"
                />
                <p className="text-[11px] text-[#4E5C70]">
                  «## » — заголовок раздела, «- » — пункт списка, пустая строка — новый абзац.
                </p>
              </div>
            )}

            <details className="neu-inset rounded-2xl p-3 text-[11px] text-[#2D3A4E]">
              <summary className="font-bold cursor-pointer">Метки и их значения</summary>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {placeholders.map((p) => (
                  <React.Fragment key={p.key}>
                    <dt className="font-mono text-accent">{`{{${p.key}}}`}</dt>
                    <dd className={`whitespace-pre-line ${p.value ? '' : 'text-warning font-semibold'}`}>
                      {p.value || 'не заполнено'}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </details>

            <div className="flex flex-wrap gap-2 justify-end">
              {edition && (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={saving || !onSaveLegalText}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl neu-button text-xs font-bold text-[#2D3A4E] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Вернуть шаблон
                </button>
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="px-3.5 py-2.5 rounded-xl neu-button text-xs font-bold text-[#4E5C70] cursor-pointer"
                >
                  Отменить правки
                </button>
              )}
              <button
                type="button"
                onClick={() => save(value)}
                disabled={!dirty || saving || !onSaveLegalText || !value.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl neu-button-accent text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        title="Вернуть шаблон?"
        message={`Текст магазина для документа «${LEGAL_DOC_TITLES[docId]}» будет заменен шаблоном с реквизитами из «Витрины».`}
        confirmLabel="Вернуть шаблон"
        confirmIcon={<RotateCcw className="w-4 h-4" />}
        tone="neutral"
        onConfirm={() => {
          setConfirmReset(false);
          save(null);
        }}
        onClose={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        isOpen={pendingDoc !== null}
        title="Перейти без сохранения?"
        message="Изменения текста текущего документа будут потеряны."
        confirmLabel="Перейти"
        confirmIcon={<Check className="w-4 h-4" />}
        tone="neutral"
        onConfirm={() => {
          if (pendingDoc) setDocId(pendingDoc);
          setDraft(null);
          setPendingDoc(null);
        }}
        onClose={() => setPendingDoc(null)}
      />
    </div>
  );
};
