// «Назад» closes the top window (UX audit 03.10, stage 2, finding 2): windows in the browser history
import { describe, expect, test } from 'bun:test';
import { createWindowHistory, windowDepth } from '../../src/utils/windowHistory';

/** The browser's history of one tab: `go` is asynchronous and ends with popstate, as in the browser */
class FakeHistory {
  entries: unknown[] = [{ wasat: true, idx: 0 }];
  index = 0;
  onPop: (state: unknown) => void = () => {};
  get state() {
    return this.entries[this.index];
  }
  pushState(data: unknown) {
    this.entries = [...this.entries.slice(0, this.index + 1), structuredClone(data)];
    this.index += 1;
  }
  replaceState(data: unknown) {
    this.entries[this.index] = structuredClone(data);
  }
  go(delta: number) {
    setTimeout(() => {
      const target = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
      if (target === this.index) return;
      this.index = target;
      this.onPop(this.state);
    }, 2);
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

function setup(scroll = 0) {
  const history = new FakeHistory();
  const windows = createWindowHistory(history, () => scroll);
  history.onPop = (state) => windows.onPopState(state);
  /** A window as React has it: `close` changes the state, the effect cleanup unregisters it a moment later */
  const openWindow = (opts: { refuses?: boolean; onClose?: () => void } = {}) => {
    const w = { closed: 0, unregister: () => {}, open: true };
    w.unregister = windows.register({
      close: () => {
        w.closed += 1;
        opts.onClose?.();
        if (!opts.refuses) queueMicrotask(() => closeWindow(w));
      },
    });
    return w;
  };
  const closeWindow = (w: { unregister: () => void; open: boolean }) => {
    if (!w.open) return;
    w.open = false;
    w.unregister();
  };
  const depth = () => windowDepth(history.state);
  return { history, windows, openWindow, closeWindow, depth };
}

describe('«Назад» over a window', () => {
  test('an open window adds an entry with the same screen; «Назад» closes it and the screen stays', async () => {
    const { history, openWindow, depth } = setup(420);
    const w = openWindow();
    await settle();
    expect(history.entries).toEqual([
      { wasat: true, idx: 0, scrollY: 420 },
      { wasat: true, idx: 0, scrollY: 420, windows: 1 },
    ]);
    history.go(-1);
    await settle();
    expect(w.closed).toBe(1);
    expect(history.index).toBe(0);
    expect(depth()).toBe(0);
  });

  test('a window closed by its own button takes its entry back: the next «Назад» leaves the screen', async () => {
    const { history, windows, openWindow, closeWindow, depth } = setup();
    const w = openWindow();
    await settle();
    closeWindow(w);
    await Promise.resolve();
    expect(windows.busy()).toBe(true);
    await settle();
    expect(history.index).toBe(0);
    expect(depth()).toBe(0);
    expect(w.closed).toBe(0);
    expect(windows.busy()).toBe(false);
  });

  test('two windows: «Назад» closes the top one, then the one under it', async () => {
    const { history, openWindow, depth } = setup();
    const lower = openWindow();
    await settle();
    const upper = openWindow();
    await settle();
    expect(depth()).toBe(2);
    history.go(-1);
    await settle();
    expect([lower.closed, upper.closed]).toEqual([0, 1]);
    expect(depth()).toBe(1);
    history.go(-1);
    await settle();
    expect([lower.closed, upper.closed]).toEqual([1, 1]);
    expect(depth()).toBe(0);
  });

  test('a jump through the history over two windows closes both', async () => {
    const { history, openWindow } = setup();
    const lower = openWindow();
    const upper = openWindow();
    await settle();
    history.go(-2);
    await settle();
    expect([lower.closed, upper.closed]).toEqual([1, 1]);
    expect(history.index).toBe(0);
  });
});

describe('windows that stay open', () => {
  test('a window that refuses to close (saving) gets its entry back', async () => {
    const { history, windows, openWindow, depth } = setup();
    const w = openWindow({ refuses: true });
    await settle();
    history.go(-1);
    await settle();
    expect(w.closed).toBe(1);
    expect(windows.openCount()).toBe(1);
    expect(depth()).toBe(1);
  });

  test('unsaved changes ask first: the question is a window over the form, «Назад» answers «stay»', async () => {
    const { history, openWindow, closeWindow, depth } = setup();
    let question: ReturnType<typeof openWindow> | null = null;
    const form = openWindow({ refuses: true, onClose: () => (question = openWindow()) });
    await settle();
    history.go(-1);
    await settle();
    expect(question).not.toBeNull();
    expect(depth()).toBe(2);
    // «Назад» again closes the question; the form stays with its entry
    history.go(-1);
    await settle();
    expect(question!.closed).toBe(1);
    expect(form.open).toBe(true);
    expect(depth()).toBe(1);
    // «Закрыть без сохранения» in a new question: both close, the history returns to the screen
    const second = openWindow();
    await settle();
    closeWindow(second);
    closeWindow(form);
    await settle();
    expect(depth()).toBe(0);
    expect(history.index).toBe(0);
  });

  test('a window that replaces another in the same render takes over its entry', async () => {
    const { history, openWindow, closeWindow, depth } = setup();
    const menu = openWindow();
    await settle();
    closeWindow(menu);
    const filters = openWindow();
    await settle();
    expect(history.entries.length).toBe(2);
    expect(depth()).toBe(1);
    history.go(-1);
    await settle();
    expect(filters.closed).toBe(1);
  });
});

describe('the screens wait for the history', () => {
  test('«Вперёд» onto the entry of a closed window steps back to the screen', async () => {
    const { history, openWindow, depth } = setup();
    openWindow();
    await settle();
    history.go(-1);
    await settle();
    history.go(1);
    await settle();
    expect(depth()).toBe(0);
    expect(history.index).toBe(0);
  });

  test('a screen change while a window takes its entry back runs after it', async () => {
    const { windows, openWindow, closeWindow, history } = setup();
    const w = openWindow();
    await settle();
    closeWindow(w);
    await Promise.resolve();
    let ranAt = -1;
    windows.afterTraversal(() => (ranAt = history.index));
    expect(ranAt).toBe(-1);
    await settle();
    expect(ranAt).toBe(0);
    // Nothing under way: right away
    let now = false;
    windows.afterTraversal(() => (now = true));
    expect(now).toBe(true);
  });
});
