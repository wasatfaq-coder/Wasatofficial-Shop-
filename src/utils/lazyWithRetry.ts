/**
 * Screens and admin sections are separate chunks. After the site is published again (or on a flaky network) the old
 * address of a chunk can fail: «Failed to fetch dynamically imported module». Instead of «Сайт обновился» at once, a
 * failed load is retried once, then the page is reloaded once (new build → new addresses); only a second failure in
 * a short time goes to the error boundary. Prefetch uses the plain loaders and stays silent.
 */
import { createElement, lazy, type ComponentType } from 'react';
import { errorText, isStaleBuildError } from './clientErrors';

export const CHUNK_RELOAD_KEY = 'manstyle_chunk_reload_at';
/** No second reload for the same reason within this time: a reload loop on a really broken site is worse than the error screen */
export const CHUNK_RELOAD_WINDOW_MS = 30_000;
export const CHUNK_RETRY_DELAY_MS = 600;

export type ChunkFailureAction = 'retry' | 'reload' | 'rethrow';

/**
 * What to do with a failed dynamic import. attempt — how many times it has already been retried (0 for the first failure).
 * lastReloadAt — ms of the previous reload for this reason, or null.
 */
export function decideChunkFailure(input: {
  message: string;
  attempt: number;
  lastReloadAt: number | null;
  now: number;
}): ChunkFailureAction {
  if (!isStaleBuildError(input.message)) return 'rethrow';
  if (input.attempt < 1) return 'retry';
  const recently = input.lastReloadAt !== null && input.now - input.lastReloadAt >= 0 && input.now - input.lastReloadAt < CHUNK_RELOAD_WINDOW_MS;
  return recently ? 'rethrow' : 'reload';
}

function readLastReload(): number | null {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** false — the mark could not be written (storage blocked): then no reload, or it would loop */
function markReload(now: number): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs a dynamic import with one retry and one guarded page reload; the reload never resolves (the page goes away) */
export async function importWithRetry<T>(load: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await load();
    } catch (error) {
      const now = Date.now();
      const action = decideChunkFailure({ message: errorText(error).message, attempt, lastReloadAt: readLastReload(), now });
      if (action === 'retry') {
        attempt += 1;
        await wait(CHUNK_RETRY_DELAY_MS);
        continue;
      }
      if (action === 'reload' && markReload(now)) {
        console.warn('A screen chunk failed to load, reloading the page once:', error);
        location.reload();
        return new Promise<T>(() => {});
      }
      throw error;
    }
  }
}

const resetters: Array<() => void> = [];

/** React.lazy keeps a rejected load forever; «Повторить» in a boundary makes the failed ones load again */
export function resetFailedLazies(): void {
  resetters.forEach((reset) => reset());
}

/** React.lazy with retry and reload (see the file's header). The returned component re-imports after resetFailedLazies() */
export function lazyWithRetry<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  let failed = false;
  const make = () =>
    lazy(() =>
      importWithRetry(load).catch((error: unknown) => {
        failed = true;
        throw error;
      })
    );
  let Inner = make();
  resetters.push(() => {
    if (failed) {
      failed = false;
      Inner = make();
    }
  });
  const Lazy = (props: P) => createElement(Inner as ComponentType<P>, props);
  return Lazy;
}
