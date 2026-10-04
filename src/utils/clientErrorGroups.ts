/**
 * The admin card's view of the error log («Аналитика» → «Ошибки на сайте»): labels, devices, grouping. Kept apart
 * from clientErrors.ts, which the customer's page loads, so this stays in the admin chunk.
 */
import { clip, errorFingerprint, type ClientErrorKind, type StoredClientError } from './clientErrors';

export const CLIENT_ERROR_KIND_LABELS: Record<ClientErrorKind, string> = {
  error: 'Ошибка JS',
  rejection: 'Ошибка JS',
  render: 'Экран не открылся',
  console: 'Сбой операции',
  update: 'Сайт обновился',
};

const DEVICES: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
];
// Order matters: Яндекс, Edge and Opera also say «Chrome», Chrome also says «Safari»
const BROWSERS: [RegExp, string][] = [
  [/YaBrowser\/(\d+)/, 'Яндекс Браузер'],
  [/(?:Edg|EdgA|EdgiOS)\/(\d+)/, 'Edge'],
  [/(?:OPR|OPT)\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+).*Safari/, 'Safari'],
];

/** «Android · Chrome 129», «iPhone · Safari 18» — enough to tell devices apart */
export function describeBrowser(userAgent = ''): string {
  if (!userAgent) return '';
  const device = DEVICES.find(([re]) => re.test(userAgent))?.[1] ?? '';
  let browser = '';
  for (const [re, name] of BROWSERS) {
    const version = userAgent.match(re)?.[1];
    if (version) {
      browser = `${name} ${version}`;
      break;
    }
  }
  return [device, browser].filter(Boolean).join(' · ') || clip(userAgent, 60);
}

export interface ClientErrorGroup {
  key: string;
  kind: ClientErrorKind;
  message: string;
  stack: string;
  count: number;
  lastAt: number;
  pages: string[];
  releases: string[];
  browsers: string[];
  ids: string[];
}

/** One line per error: newest first, with how often, where and on which devices */
export function groupClientErrors(errors: StoredClientError[]): ClientErrorGroup[] {
  const groups = new Map<string, ClientErrorGroup>();
  for (const e of errors) {
    const key = `${e.kind === 'rejection' ? 'error' : e.kind}|${errorFingerprint(e.message)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, kind: e.kind, message: e.message, stack: e.stack ?? '', count: 0, lastAt: 0, pages: [], releases: [], browsers: [], ids: [] };
      groups.set(key, group);
    }
    group.count += 1;
    group.ids.push(e.id);
    if (e.createdAt > group.lastAt) group.lastAt = e.createdAt;
    if (!group.stack && e.stack) group.stack = e.stack;
    if (e.page && !group.pages.includes(e.page)) group.pages.push(e.page);
    if (e.release && !group.releases.includes(e.release)) group.releases.push(e.release);
    const browser = describeBrowser(e.browser);
    if (browser && !group.browsers.includes(browser)) group.browsers.push(browser);
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt);
}
