/**
 * Sends errors from customers' screens to the owner (docs/ops-plan.md, stage 2): uncaught errors and promises, screens
 * that failed to draw (main.tsx) and failures the site logs itself (console.error: an order not saved, stock not
 * taken…). E-mails and phones are cut out (clientErrors.ts); one error is sent once per visit, at most 5 per visit,
 * and the rules allow 30 an hour for the whole site. Started from main.tsx, so App.tsx is not involved.
 */
import { IS_PREVIEW_BUILD } from './previewBuild';
import { saveClientError } from './firebaseSync';
import {
  buildReport,
  CLIENT_ERRORS_COLLECTION,
  CLIENT_ERROR_SLOTS,
  CLIENT_ERRORS_PER_VISIT,
  clientErrorDocId,
  consoleText,
  errorFingerprint,
  errorText,
  type ClientErrorKind,
  type ClientErrorReport,
} from './clientErrors';

const RELEASE = `${IS_PREVIEW_BUILD ? 'проверка ' : ''}${import.meta.env.VITE_RELEASE ?? ''}`.trim();

const sent = new Set<string>();
let sending = false;
let started = false;

/**
 * Writes the report into a free slot of this hour. A taken slot is refused by the rules (no overwrite): then the next
 * one, in random order, until a slot is free. Trying only a couple lost real reports once a few were in that hour
 * (a flaky scenario in CI, 04.10). Any other refusal (the hour's clock, no access) ends the attempts.
 */
async function send(report: ClientErrorReport) {
  const slots = Array.from({ length: CLIENT_ERROR_SLOTS }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const hourStart = Date.now();
  for (const slot of slots) {
    try {
      await saveClientError(clientErrorDocId(hourStart, slot), report);
      return;
    } catch (err) {
      // taken slot → the next one; the report is lost only when all 30 of the hour are taken
      if ((err as { code?: string }).code !== 'permission-denied') return;
    }
  }
}

const queue: ClientErrorReport[] = [];

async function drain() {
  sending = true;
  while (queue.length) await send(queue.shift()!);
  sending = false;
}

export function reportClientError(kind: ClientErrorKind, raw: { message: string; stack: string }) {
  if (sent.size >= CLIENT_ERRORS_PER_VISIT) return;
  const report = buildReport(kind, raw, {
    page: window.location.pathname,
    release: RELEASE,
    browser: navigator.userAgent,
  });
  // The database client's own log about a report that was not written is not the site's error
  if (!report || report.message.includes(CLIENT_ERRORS_COLLECTION)) return;
  const key = errorFingerprint(report.message);
  if (sent.has(key)) return;
  sent.add(key);
  queue.push(report);
  if (!sending) void drain();
}

/** A screen failed to draw (createRoot's onCaughtError / onUncaughtError in main.tsx) */
export function reportRenderError(error: unknown, componentStack?: string) {
  const { message, stack } = errorText(error);
  reportClientError('render', { message, stack: [stack, componentStack].filter(Boolean).join('\n') });
}

/** Listens to the page's errors; only the production build reports (the dev server is the developer's own) */
export function startErrorReporter() {
  if (started || !import.meta.env.PROD) return;
  started = true;
  window.addEventListener('error', (event) => {
    const raw = errorText(event.error ?? event.message);
    reportClientError('error', { message: raw.message, stack: raw.stack || `${event.filename}:${event.lineno}` });
  });
  window.addEventListener('unhandledrejection', (event) => reportClientError('rejection', errorText(event.reason)));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      reportClientError('console', consoleText(args));
    } catch {
      // reporting never breaks logging
    }
  };
}
