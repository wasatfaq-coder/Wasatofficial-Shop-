import React from 'react';
import { CircleSlash } from 'lucide-react';

interface NotConfiguredProps {
  /** What is missing, e.g. «Способы доставки». Without it the text is just «Не настроено». */
  title?: string;
  /** One line for the reader: what happens now or who fills it in */
  hint?: string;
  className?: string;
}

/**
 * Shown instead of content the owner has not filled in yet (Admin panel).
 * Demo or template data is never shown in its place.
 */
export const NotConfigured: React.FC<NotConfiguredProps> = ({ title, hint, className = '' }) => (
  <div
    role="status"
    className={`neu-inset rounded-2xl p-3 flex items-start gap-2.5 bg-[#E3E8EF] text-left ${className}`}
  >
    <CircleSlash className="w-4 h-4 text-[#4E5C70] shrink-0 mt-0.5" aria-hidden="true" />
    <div className="min-w-0">
      <p className="text-xs font-bold text-[#2D3A4E]">{title ? `${title}: не настроено` : 'Не настроено'}</p>
      {hint && <p className="text-[11px] text-[#4E5C70] leading-snug mt-0.5">{hint}</p>}
    </div>
  </div>
);
