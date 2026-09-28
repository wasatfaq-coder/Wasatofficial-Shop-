import type { StorefrontSettings } from '../types';
import { getLegalDetails, getStoreContacts, getStoreName } from './storeContacts';

/**
 * Legal documents of the store: the public offer (дистанционная продажа) and the personal data policy (152-ФЗ).
 * The text is a template from `legalTemplates.ts` (loaded on demand) or the store's own edition saved in Admin →
 * «Документы» (`settings/legal`). Placeholders like {{продавец}} are filled from the requisites in «Витрина»;
 * demo requisites of the old template never count. Without the seller's requisites a document is not published.
 */
export type LegalDocId = 'offer' | 'privacy';

export const LEGAL_DOC_IDS: LegalDocId[] = ['offer', 'privacy'];

export const LEGAL_DOC_TITLES: Record<LegalDocId, string> = {
  offer: 'Публичная оферта',
  privacy: 'Политика обработки персональных данных',
};

/** Hash route of the document page (see navigation.ts) */
export const LEGAL_DOC_HREF: Record<LegalDocId, string> = { offer: '#/offer', privacy: '#/privacy' };

/** The store's own edition of a document; none — the template is used */
export interface LegalDocEdition {
  text: string;
  /** ISO date of the last save */
  updatedAt: string;
}

/** `settings/legal` */
export type LegalTexts = Partial<Record<LegalDocId, LegalDocEdition>>;

/** Date of the current template wording: the edition date of a document that uses the template */
export const LEGAL_TEMPLATE_DATE = '2026-09-28';

type Settings = Partial<StorefrontSettings> | null | undefined;

/** Requisites a published offer must name (Правила продажи № 2463, ст. 26.1 и 9 Закона о защите прав потребителей) */
export function missingLegalRequisites(settings: Settings): string[] {
  const legal = getLegalDetails(settings);
  const contacts = getStoreContacts(settings);
  const missing: string[] = [];
  if (!legal.companyName) missing.push('название продавца (организация или ИП)');
  if (!legal.inn) missing.push('ИНН');
  if (!legal.ogrn) missing.push('ОГРН или ОГРНИП');
  if (!legal.legalAddress) missing.push('юридический адрес');
  if (!contacts.email && !contacts.phone) missing.push('email или телефон');
  return missing;
}

/** Documents are shown to customers (links in checkout and the menu) only with the seller's requisites filled in */
export function legalDocsReady(settings: Settings): boolean {
  return missingLegalRequisites(settings).length === 0;
}

/** ОГРН has 13 digits, ОГРНИП (sole proprietor) 15 */
function ogrnLabel(ogrn: string): string {
  return ogrn.replace(/\D/g, '').length === 15 ? 'ОГРНИП' : 'ОГРН';
}

export interface LegalPlaceholder {
  key: string;
  label: string;
  value: string;
}

/** Placeholders of the templates with their current values ('' — not filled in «Витрина») */
export function legalPlaceholders(settings: Settings, siteUrl: string): LegalPlaceholder[] {
  const legal = getLegalDetails(settings);
  const contacts = getStoreContacts(settings);
  const returnDays = Math.max(7, Math.round(Number(settings?.returnPeriodDays) || 0));
  const contactParts = [
    contacts.email && `по электронной почте ${contacts.email}`,
    contacts.phone && `по телефону ${contacts.phone}`,
  ].filter(Boolean);
  const requisites = [
    legal.companyName && `Продавец: ${legal.companyName}`,
    legal.inn && `ИНН ${legal.inn}${legal.kpp ? `, КПП ${legal.kpp}` : ''}`,
    legal.ogrn && `${ogrnLabel(legal.ogrn)} ${legal.ogrn}`,
    legal.legalAddress && `Адрес: ${legal.legalAddress}`,
    contacts.email && `Email: ${contacts.email}`,
    contacts.phone && `Телефон: ${contacts.phone}`,
    legal.bankName && `Банк: ${legal.bankName}${legal.bik ? `, БИК ${legal.bik}` : ''}`,
    legal.checkingAccount && `Расчетный счет: ${legal.checkingAccount}`,
    legal.corrAccount && `Корреспондентский счет: ${legal.corrAccount}`,
  ].filter(Boolean);
  return [
    { key: 'магазин', label: 'Название магазина', value: getStoreName(settings) },
    { key: 'продавец', label: 'Продавец', value: legal.companyName },
    { key: 'инн', label: 'ИНН', value: legal.inn ? `ИНН ${legal.inn}` : '' },
    { key: 'огрн', label: 'ОГРН / ОГРНИП', value: legal.ogrn ? `${ogrnLabel(legal.ogrn)} ${legal.ogrn}` : '' },
    { key: 'адрес', label: 'Юридический адрес', value: legal.legalAddress },
    { key: 'контакты', label: 'Контакты для заявлений', value: contactParts.join(' или ') },
    { key: 'сайт', label: 'Адрес сайта', value: siteUrl },
    { key: 'срок_возврата', label: 'Срок возврата (не меньше 7 дней)', value: `${returnDays}` },
    { key: 'реквизиты', label: 'Реквизиты (блок)', value: requisites.join('\n') },
  ];
}

/** Text with placeholders filled; an unknown or empty placeholder becomes «[не заполнено: …]» */
export function fillLegalText(text: string, placeholders: LegalPlaceholder[]): string {
  const byKey = new Map(placeholders.map((p) => [p.key, p]));
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, raw: string) => {
    const p = byKey.get(raw.toLowerCase());
    return p?.value || `[не заполнено: ${p?.label ?? raw}]`;
  });
}

/** Blocks of the simple markup: «## » heading, «### » subheading, «- » list item, blank line between paragraphs */
export type LegalBlock =
  | { type: 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul'; items: string[] };

export function parseLegalMarkup(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join('\n') });
    if (list) blocks.push({ type: 'ul', items: list });
    para = [];
    list = null;
  };
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (line.startsWith('### ')) {
      flush();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (/^\s*[-•]\s+/.test(line)) {
      if (para.length) {
        blocks.push({ type: 'p', text: para.join('\n') });
        para = [];
      }
      (list ??= []).push(line.replace(/^\s*[-•]\s+/, ''));
    } else {
      if (list) {
        blocks.push({ type: 'ul', items: list });
        list = null;
      }
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** «28 сентября 2026 г.» */
export function formatLegalDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
