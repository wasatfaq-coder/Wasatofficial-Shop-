/**
 * Errors on customers' screens for the owner (docs/ops-plan.md, stage 2): what a report holds, how personal data is
 * cut out of it, which errors are noise, and how the admin card groups them. No browser or database APIs here.
 */

export const CLIENT_ERRORS_COLLECTION = 'client_errors';
/** Report ids are «{hour}_{slot}»: firestore.rules accept slots 0..29, so at most 30 reports an hour for the whole site */
export const CLIENT_ERROR_SLOTS = 30;
/** One visit sends at most this many reports (a broken screen can throw in a loop) */
export const CLIENT_ERRORS_PER_VISIT = 5;
/** The admin card removes older reports when it opens: the log is temporary and is not in the backup */
export const CLIENT_ERRORS_KEEP_DAYS = 14;

/** Field limits — the same numbers as isClientErrorReport in firestore.rules */
export const CLIENT_ERROR_LIMITS = { message: 500, stack: 2000, page: 200, release: 40, browser: 300 } as const;

/**
 * error — uncaught exception; rejection — unhandled promise; render — a screen failed to draw (the error screen
 * was shown); console — the site logged a failure it handled (an order not saved, stock not taken…); update — the
 * site was published again while the tab was open, and a screen's code is gone from the old address.
 */
export type ClientErrorKind = 'error' | 'rejection' | 'render' | 'console' | 'update';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  /** Path of the page without the query and hash: «/product/abc» */
  page: string;
  /** Commit of the build, «проверка …» on a PR preview */
  release?: string;
  browser?: string;
}

export interface StoredClientError extends ClientErrorReport {
  id: string;
  /** ms; 0 — not confirmed by the server yet */
  createdAt: number;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// +7 999 123-45-67, 89991234567, (999) 123 45 67: ten digits or more with separators
const PHONE = /\+?\d[\d\s()-]{8,}\d/g;

/** E-mails and phone numbers are cut out: the log is read in the admin, and a customer's contacts do not belong there */
export function scrubPersonalData(text: string): string {
  return text.replace(EMAIL, '[почта]').replace(PHONE, (match) => (match.replace(/\D/g, '').length >= 10 ? '[телефон]' : match));
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Text of whatever was thrown or logged: Error, string; objects are not serialized (they may carry an order) */
export function errorText(value: unknown): { message: string; stack: string } {
  if (value instanceof Error) {
    return { message: `${value.name && value.name !== 'Error' ? `${value.name}: ` : ''}${value.message}`, stack: value.stack ?? '' };
  }
  if (typeof value === 'string') return { message: value, stack: '' };
  if (value && typeof value === 'object' && 'message' in value && typeof (value as { message: unknown }).message === 'string') {
    return { message: (value as { message: string }).message, stack: '' };
  }
  return { message: value === undefined ? '' : `[${typeof value}]`, stack: '' };
}

/** console.error('Order was not saved:', err) → «Order was not saved: FirebaseError: …» */
export function consoleText(args: unknown[]): { message: string; stack: string } {
  const parts = args.map(errorText);
  return {
    message: parts.map((p) => p.message).filter(Boolean).join(' '),
    stack: parts.find((p) => p.stack)?.stack ?? '',
  };
}

/** Code of the site that is no longer on Hosting: the site was published again while this tab was open */
export function isStaleBuildError(message: string): boolean {
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|error loading dynamically imported module|Failed to fetch dynamically/i.test(message);
}

// Not the site's fault: no network, a closed Google window, browser extensions, the browser's own noise
const NOISE = [
  /popup-closed-by-user|cancelled-popup-request|popup-blocked|user-cancelled/i,
  /network-request-failed|client is offline|Could not reach Cloud Firestore backend|Failed to fetch$|NetworkError when attempting|Load failed$/i,
  /\[code=unavailable\]|code=unavailable|deadline-exceeded/i,
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError|The user aborted a request|signal is aborted/i,
];

export function isNoise(message: string, stack = ''): boolean {
  if (!message.trim()) return true;
  if (NOISE.some((re) => re.test(message))) return true;
  // Only extension code in the stack: not ours
  return /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack) && !/\/assets\//.test(stack);
}

/** Builds the report; null — noise, nothing to send */
export function buildReport(
  kind: ClientErrorKind,
  raw: { message: string; stack: string },
  context: { page: string; release: string; browser: string }
): ClientErrorReport | null {
  const message = clip(scrubPersonalData(raw.message.trim()), CLIENT_ERROR_LIMITS.message);
  const stack = clip(scrubPersonalData(raw.stack.trim()), CLIENT_ERROR_LIMITS.stack);
  if (isNoise(message, stack)) return null;
  const report: ClientErrorReport = {
    kind: kind === 'console' || !isStaleBuildError(message) ? kind : 'update',
    message,
    page: clip(context.page.split(/[?#]/)[0] || '/', CLIENT_ERROR_LIMITS.page),
  };
  if (stack) report.stack = stack;
  if (context.release) report.release = clip(context.release, CLIENT_ERROR_LIMITS.release);
  if (context.browser) report.browser = clip(context.browser, CLIENT_ERROR_LIMITS.browser);
  return report;
}

/** The same error repeated in a visit is sent once */
export function errorFingerprint(message: string): string {
  return message.replace(/\d+/g, '#').slice(0, 200);
}

/** «{hour since 1970}_{slot}»; firestore.rules accept the hour ±1 of the server's clock */
export function clientErrorDocId(nowMs: number, slot: number): string {
  return `${Math.floor(nowMs / 3_600_000)}_${slot}`;
}
