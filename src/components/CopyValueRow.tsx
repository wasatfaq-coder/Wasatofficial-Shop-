import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

interface CopyValueRowProps {
  label: string;
  /** What the row shows (a number with its mask) */
  value: string;
  /** What goes to the clipboard (numbers — digits only); the shown value by default */
  copyText?: string;
}

/** «Название · значение · Скопировать» with a short «Скопировано» (brief «Доработки 5» §3.1) */
export const CopyValueRow: React.FC<CopyValueRowProps> = ({ label, value, copyText }) => {
  const [copied, setCopied] = useState(false);
  if (!value.trim()) return null;
  const copy = async () => {
    if (await copyToClipboard((copyText ?? value).trim())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="flex items-center gap-2 min-w-0 neu-inset rounded-xl px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] text-[#4E5C70]">{label}</span>
        <span className="block text-sm font-extrabold text-[#2D3A4E] break-words">{value}</span>
      </div>
      {copied && (
        <span className="text-[11px] font-bold text-success shrink-0" aria-hidden="true">
          Скопировано
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={`Скопировать: ${label}`}
        className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-accent shrink-0 cursor-pointer"
      >
        {copied ? <Check className="w-4 h-4 text-success" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Скопировано' : ''}
      </span>
    </div>
  );
};
