import React from 'react';
import type { StorefrontSettings } from '../types';
import { LEGAL_DOC_HREF, legalDocsReady } from '../utils/legalDocs';
import { loadStorefrontSettings } from '../utils/inventory';

/**
 * «Нажимая «…», вы принимаете условия оферты…» under an order button. Shown only when the documents are published
 * (the seller's requisites are filled in); the links open in a new tab so the form keeps what was typed.
 * Without `settings` the cached storefront settings are used (windows that do not get the settings as a prop).
 */
export const LegalConsentNote: React.FC<{
  settings?: Partial<StorefrontSettings> | null;
  action: string;
  className?: string;
}> = ({ settings, action, className = '' }) => {
  if (!legalDocsReady(settings === undefined ? loadStorefrontSettings() : settings)) return null;
  const link = 'text-accent font-bold underline underline-offset-2 hover:text-accent-strong';
  return (
    <p className={`text-[11px] leading-snug text-[#4E5C70] ${className}`}>
      Нажимая «{action}», вы принимаете условия{' '}
      <a href={LEGAL_DOC_HREF.offer} target="_blank" rel="noopener" className={link}>
        публичной оферты
      </a>
      . Как мы обрабатываем данные — в{' '}
      <a href={LEGAL_DOC_HREF.privacy} target="_blank" rel="noopener" className={link}>
        политике обработки персональных данных
      </a>
      .
    </p>
  );
};
