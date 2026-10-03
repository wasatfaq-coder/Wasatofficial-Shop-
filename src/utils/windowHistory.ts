/**
 * «Назад» closes the top window, not the screen under it (UX audit 03.10, stage 2, finding 2).
 *
 * Every open window (`useDialogA11y`) adds an entry to the browser history over the screen's entry, with the same
 * address. «Назад» (the browser button, the Android gesture) pops it: the window closes as on Escape, the screen
 * stays. A window closed any other way (its ×, the backdrop, Escape, the page itself) takes its entry back with
 * `history.go`, so the next «Назад» leaves the screen as before.
 *
 * Entries are counted, not named: `windows: n` in an entry's state is the n-th window over the screen. After each
 * change the history is brought to the open windows (`reconcile`): fewer entries — push, more — go back. So a window
 * that refuses to close (unsaved changes ask first, saving in progress) gets its entry back, and a window that
 * replaces another one in the same render (the side menu opens the filters) takes over its entry.
 *
 * The screens' own history (`App.tsx`) cooperates: a popstate to the same screen entry is not a screen change, a
 * screen change from a window replaces the window's entry, and a screen change while our `history.go` is under way
 * waits for it (`afterTraversal`).
 */

interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  go(delta: number): void;
}

interface OpenWindow {
  /** Back was pressed over this window: close it the way Escape does */
  close: () => void;
}

/** A popstate of our own `history.go` normally comes within milliseconds; after this we stop waiting for it */
const TRAVERSAL_TIMEOUT_MS = 1000;

/** How many windows were open over the screen in this history entry */
export function windowDepth(state: unknown): number {
  const n = state && typeof state === 'object' ? (state as { windows?: unknown }).windows : undefined;
  return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
}

export function createWindowHistory(
  history: HistoryLike,
  scrollY: () => number = () => 0,
  now: () => number = () => Date.now()
) {
  const open: OpenWindow[] = [];
  let traversalSince = 0;
  let queued = false;
  let waiting: (() => void)[] = [];

  /** Our own `history.go` is under way: its popstate is not a «Назад» */
  const busy = () => traversalSince > 0 && now() - traversalSince < TRAVERSAL_TIMEOUT_MS;

  const runWaiting = () => {
    const callbacks = waiting;
    waiting = [];
    callbacks.forEach((cb) => cb());
  };

  function reconcile() {
    queued = false;
    if (busy()) return;
    const depth = windowDepth(history.state);
    if (depth > open.length) {
      traversalSince = now();
      history.go(open.length - depth);
      // No popstate (the entry is gone): do not hold the screens forever
      setTimeout(() => {
        if (traversalSince && !busy()) {
          traversalSince = 0;
          runWaiting();
          schedule();
        }
      }, TRAVERSAL_TIMEOUT_MS + 50);
      return;
    }
    if (depth < open.length) {
      const { windows: _windows, ...entry } = (history.state ?? {}) as Record<string, unknown>;
      // The screen's scroll, for «Назад» to it after a screen change from the window
      const screen = depth === 0 ? { ...entry, scrollY: scrollY() } : entry;
      if (depth === 0) history.replaceState(screen, '');
      for (let n = depth + 1; n <= open.length; n++) history.pushState({ ...screen, windows: n }, '');
    }
  }

  /** After the current render: windows opened and closed in one render cancel out */
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(reconcile);
  }

  /** Registers an open window; the returned function is called when it closes */
  function register(entry: OpenWindow): () => void {
    open.push(entry);
    schedule();
    return () => {
      const index = open.lastIndexOf(entry);
      if (index !== -1) open.splice(index, 1);
      schedule();
    };
  }

  function onPopState(state: unknown) {
    const depth = windowDepth(state);
    if (busy()) {
      traversalSince = 0;
    } else {
      // «Назад» (or a jump through the history) over open windows: they close from the top
      for (let i = open.length - 1; i >= depth; i--) open[i]?.close();
    }
    // After every popstate listener (the screens' one too) has seen this entry
    setTimeout(() => {
      runWaiting();
      schedule();
    }, 0);
  }

  /** Runs `cb` once our own `history.go` has finished (right away if none is under way) */
  function afterTraversal(cb: () => void) {
    if (busy()) waiting.push(cb);
    else cb();
  }

  return { register, onPopState, busy, afterTraversal, openCount: () => open.length };
}

let browserHistory: ReturnType<typeof createWindowHistory> | null = null;

function browser() {
  if (!browserHistory) {
    browserHistory = createWindowHistory(window.history, () => window.scrollY);
    const instance = browserHistory;
    window.addEventListener('popstate', (e) => instance.onPopState(e.state));
  }
  return browserHistory;
}

/** A window opened: «Назад» closes it with `close`. Returns the function to call when it closes */
export function registerWindow(close: () => void): () => void {
  return browser().register({ close });
}

/** Our own `history.go` is under way (a window just closed): the screens wait with a new address */
export function isWindowHistoryBusy(): boolean {
  return browserHistory?.busy() ?? false;
}

export function afterWindowHistory(cb: () => void) {
  if (browserHistory) browserHistory.afterTraversal(cb);
  else cb();
}
