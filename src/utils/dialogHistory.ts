import { readHistoryState, type HistoryEntryState } from './navigation';

/**
 * Open windows in the browser history: «Назад» (the button, the Android gesture) closes the top window
 * and keeps the screen.
 * - while windows are open, the screen's entry has entries of theirs above it: the same address and
 *   state, `dialog` = how many windows are open at that entry;
 * - «Назад» lands on an entry below: the windows above it close, the screen stays (`handleDialogPopState`);
 * - a window closed otherwise (×, the backdrop, Escape, a button) takes its entry back with `history.go`,
 *   so no extra «Назад» is left; when the screen changes at the same moment, the new screen takes that
 *   entry instead (`takeDialogEntriesForScreen` in the route sync of `App.tsx`);
 * - a window that does not close on «Назад» (unsaved changes, a request in flight) gets its entry back.
 * Entries are counted, not tied to windows: «Назад» always closes the top-most window.
 */

interface OpenDialog {
  close: () => void;
  /** «Назад» asked it to close and it has not closed yet */
  closingByBack: boolean;
}

const dialogs: OpenDialog[] = [];
/** Window entries above the screen's entry */
let entries = 0;
/** A `history.go` of ours is under way: its popstate is not the visitor's */
let ownTraversal = false;
let ownTraversalTimer: ReturnType<typeof setTimeout> | undefined;
let scheduled = false;

const wanted = () => dialogs.filter((d) => !d.closingByBack).length;

/** Entries follow the open windows. Runs after React's effects, so a screen change in the same commit goes first */
function reconcile() {
  scheduled = false;
  if (ownTraversal) return;
  const target = wanted();
  if (target > entries) {
    const state = readHistoryState(window.history.state);
    if (!state) return;
    // The screen's scroll for «Назад» from the next screen, if a window's entry gives way to it
    if (entries === 0) window.history.replaceState({ ...state, scrollY: window.scrollY } satisfies HistoryEntryState, '');
    const base = readHistoryState(window.history.state) ?? state;
    while (entries < target) {
      entries += 1;
      window.history.pushState({ ...base, dialog: entries } satisfies HistoryEntryState, '');
    }
  } else if (target < entries) {
    ownTraversal = true;
    // In case the popstate never comes: the visitor's next «Назад» must not be swallowed
    clearTimeout(ownTraversalTimer);
    ownTraversalTimer = setTimeout(() => {
      ownTraversal = false;
    }, 1000);
    window.history.go(target - entries);
    entries = target;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(reconcile);
}

/** A window opened (`useDialogA11y`); the returned function is called when it closes */
export function openDialogEntry(close: () => void): () => void {
  const dialog: OpenDialog = { close, closingByBack: false };
  dialogs.push(dialog);
  schedule();
  return () => {
    const index = dialogs.indexOf(dialog);
    if (index !== -1) dialogs.splice(index, 1);
    schedule();
  };
}

/**
 * The screen changes while a window's entry is on top: the new screen replaces that entry (true) instead
 * of a new one, and windows still open get entries above the new screen
 */
export function takeDialogEntriesForScreen(): boolean {
  if (ownTraversal || entries === 0) return false;
  entries = 0;
  schedule();
  return true;
}

/**
 * Browser «Назад» / «Вперед». true — it only closed windows (or was a step of ours): the screen stays.
 * `screenIdx` — the shop history position of the screen on display.
 */
export function handleDialogPopState(state: unknown, screenIdx: number): boolean {
  if (ownTraversal) {
    ownTraversal = false;
    clearTimeout(ownTraversalTimer);
    schedule();
    return true;
  }
  const entry = readHistoryState(state);
  const depth = entry?.dialog ?? 0;
  const sameScreen = entry !== null && entry.idx === screenIdx;
  // Another screen (a step back over several entries, a link): every window closes
  const toClose = dialogs.filter((d) => !d.closingByBack).slice(sameScreen ? depth : 0).reverse();
  for (const dialog of toClose) dialog.closingByBack = true;
  for (const dialog of toClose) dialog.close();
  entries = depth;
  if (toClose.length > 0) {
    // A window that stayed open (asks to save changes, waits for a request) gets its entry back
    setTimeout(() => {
      for (const dialog of toClose) dialog.closingByBack = false;
      schedule();
    }, 300);
  }
  // «Вперед» to the entry of a window that is closed: nothing to show there, a step back
  schedule();
  return sameScreen && (toClose.length > 0 || depth > 0);
}
