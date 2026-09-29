import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { StorefrontSettings } from '../types';
import {
  LEGAL_DOC_HREF,
  LEGAL_DOC_TITLES,
  LEGAL_TEMPLATE_DATE,
  type LegalDocId,
  type LegalTexts,
  fillLegalText,
  formatLegalDate,
  legalDocsReady,
  legalPlaceholders,
} from '../utils/legalDocs';
import { LEGAL_TEMPLATES } from '../utils/legalTemplates';
import { subscribeToLegalTexts } from '../utils/firebaseSync';
import { LegalText } from '../components/LegalText';
import { NotConfigured } from '../components/NotConfigured';

/** Site address for the documents: the shop's own origin and path, without the screen's hash */
export function siteUrl(): string {
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '');
}

/**
 * «Публичная оферта» (#/offer) and «Политика обработки персональных данных» (#/privacy): the store's edition
 * from Admin → «Документы» or the template, with the requisites from «Витрина». Loaded as a separate chunk.
 */
const LegalDocumentScreen: React.FC<{ docId: LegalDocId; settings: StorefrontSettings }> = ({ docId, settings }) => {
  const [texts, setTexts] = useState<LegalTexts | null>(null);
  useEffect(() => subscribeToLegalTexts(setTexts), []);

  if (!legalDocsReady(settings)) {
    return (
      <div className="pt-1 pb-28 lg:pb-4">
        <NotConfigured
          title={LEGAL_DOC_TITLES[docId]}
          hint="Документ появится, когда магазин укажет свои реквизиты. Вопросы можно задать в чате поддержки."
        />
      </div>
    );
  }

  if (!texts) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-xs text-[#4E5C70]" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Загрузка документа…
      </div>
    );
  }

  const edition = texts[docId];
  const text = fillLegalText(edition?.text ?? LEGAL_TEMPLATES[docId], legalPlaceholders(settings, siteUrl()));
  const other: LegalDocId = docId === 'offer' ? 'privacy' : 'offer';

  return (
    <article className="pt-1 pb-28 lg:pb-4 max-w-3xl mx-auto space-y-4">
      <header className="neu-flat rounded-3xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
          <FileText className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-[#2D3A4E] leading-tight">{LEGAL_DOC_TITLES[docId]}</h2>
          <p className="text-xs text-[#4E5C70] mt-0.5">
            Редакция от {formatLegalDate(edition?.updatedAt || LEGAL_TEMPLATE_DATE)}
          </p>
        </div>
      </header>
      <div className="neu-flat rounded-3xl p-4 sm:p-6">
        <LegalText text={text} />
      </div>
      <p className="text-xs text-[#4E5C70] text-center">
        См. также:{' '}
        <a href={LEGAL_DOC_HREF[other]} className="text-accent font-bold hover:underline">
          {LEGAL_DOC_TITLES[other]}
        </a>
      </p>
    </article>
  );
};

export default LegalDocumentScreen;
