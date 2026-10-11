/**
 * Reply templates of the support chat (admin audit 09.10, stage 7, finding 4): one list in the database
 * (`settings/chat_templates`) instead of the browser, where the phone and the computer had different ones and clearing
 * the browser lost them. Plain data: no Firestore here.
 */
import type { ChatQuickTemplate } from '../types';

/** The key the templates lived under in the browser before stage 7 — read once to move them into the database */
export const LEGACY_TEMPLATES_STORAGE_KEY = 'manstyle_admin_reply_templates';

/** The form adds no more than this (the list is one document); a longer list from the browser is kept whole */
export const MAX_CHAT_TEMPLATES = 200;
/** Limits of the form fields; templates are read whole — cutting a saved text would lose its end on the next save */
export const MAX_TEMPLATE_TITLE = 100;
export const MAX_TEMPLATE_TEXT = 2000;

const CATEGORIES: ChatQuickTemplate['category'][] = ['general', 'sizes', 'delivery', 'payment', 'returns', 'discounts'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Templates from the database or an old browser copy: only items with an id, a title and a text */
export function normalizeChatTemplates(raw: unknown): ChatQuickTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: ChatQuickTemplate[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!id || !title || !text || seen.has(id)) continue;
    seen.add(id);
    const category = CATEGORIES.includes(item.category as ChatQuickTemplate['category'])
      ? (item.category as ChatQuickTemplate['category'])
      : 'general';
    const categoryLabel = typeof item.categoryLabel === 'string' ? item.categoryLabel : '';
    items.push({ id, title, text, category, categoryLabel });
  }
  return items;
}

/** The saved templates plus the browser ones they do not have yet (by id), saved first */
export function mergeChatTemplates(saved: ChatQuickTemplate[], local: ChatQuickTemplate[]): ChatQuickTemplate[] {
  const ids = new Set(saved.map((t) => t.id));
  return [...saved, ...local.filter((t) => !ids.has(t.id))];
}
