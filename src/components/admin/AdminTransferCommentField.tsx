import type { TransferCommentMode, TransferCommentSetting } from '../../types';
import {
  resolveTransferComment,
  TRANSFER_COMMENT_MAX,
  TRANSFER_COMMENT_MODE_LABELS,
  TRANSFER_COMMENT_PLACEHOLDER,
  TRANSFER_COMMENT_SAMPLE_ID,
} from '../../utils/paymentDetails';

const MODES: TransferCommentMode[] = ['order', 'custom', 'none'];

interface AdminTransferCommentFieldProps {
  value: TransferCommentSetting;
  onChange: (next: TransferCommentSetting) => void;
  /** Error from `validateTransferComment` */
  error?: string | null;
  /** Unique per form: ids of the input and its hints */
  idPrefix: string;
}

/**
 * «Комментарий к переводу»: what the buyer is asked to write in the bank transfer. Three modes; the custom text may hold
 * `{номер}`. The preview shows the result for a sample order id.
 */
export function AdminTransferCommentField({ value, onChange, error, idPrefix }: AdminTransferCommentFieldProps) {
  const inputId = `${idPrefix}-comment-text`;
  const preview = resolveTransferComment(value, TRANSFER_COMMENT_SAMPLE_ID);
  const describedBy = [error ? `${inputId}-error` : '', `${inputId}-preview`].filter(Boolean).join(' ');
  return (
    <div className="space-y-1.5">
      <span id={`${idPrefix}-comment-label`} className="block text-[11px] font-bold text-[#4E5C70]">
        Комментарий к переводу
      </span>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-comment-label`} className="flex flex-wrap gap-1.5">
        {MODES.map((mode) => {
          const selected = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode === 'custom' ? { mode, text: value.text ?? '' } : { mode })}
              className={`min-h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${selected ? 'neu-pill-active text-[#2D3A4E]' : 'neu-button text-[#2D3A4E]'}`}
            >
              {TRANSFER_COMMENT_MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
      {value.mode === 'custom' && (
        <div className="space-y-1">
          <label htmlFor={inputId} className="sr-only">
            Текст комментария к переводу
          </label>
          <input
            id={inputId}
            value={value.text ?? ''}
            onChange={(e) => onChange({ mode: 'custom', text: e.target.value })}
            placeholder={`Например: Оплата заказа ${TRANSFER_COMMENT_PLACEHOLDER}`}
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className="w-full neu-inset rounded-xl px-3 py-2 text-xs text-[#2D3A4E] outline-none"
          />
          <p className="text-[11px] text-[#4E5C70]">
            {TRANSFER_COMMENT_PLACEHOLDER} заменится на номер заказа · {(value.text ?? '').trim().length}/{TRANSFER_COMMENT_MAX}
          </p>
          {error && (
            <p id={`${inputId}-error`} className="text-[11px] font-bold text-danger">
              {error}
            </p>
          )}
        </div>
      )}
      <p id={`${inputId}-preview`} className="text-[11px] text-[#4E5C70]">
        {preview ? (
          <>
            Покупатель увидит: <span className="font-bold text-[#2D3A4E]">{preview}</span> (пример для заказа {TRANSFER_COMMENT_SAMPLE_ID})
          </>
        ) : (
          'Покупатель увидит: «Комментарий к переводу не нужен — магазин его не указал»'
        )}
      </p>
    </div>
  );
}
