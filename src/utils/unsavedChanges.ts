import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Unsaved changes in the admin panel. A form reports its edits with `useUnsavedChanges(dirty, label)`;
 * the panel (`useUnsavedRegistry`) asks «Закрыть без сохранения?» before it closes, before another tab
 * replaces the form, and the browser warns before the page is left.
 */

interface UnsavedRegistry {
  set: (id: string, label: string | null) => void;
}

export const UnsavedChangesContext = createContext<UnsavedRegistry | null>(null);

/** Owner side: the context value and the labels of the forms with edits right now */
export function useUnsavedRegistry() {
  const entries = useRef(new Map<string, string>());
  const [, setVersion] = useState(0);
  const registry = useMemo<UnsavedRegistry>(
    () => ({
      set(id, label) {
        const had = entries.current.has(id);
        if (label) entries.current.set(id, label);
        else entries.current.delete(id);
        if (had !== Boolean(label)) setVersion((v) => v + 1);
      },
    }),
    []
  );
  /** Unique labels, e.g. ['Форма товара', 'Витрина'] */
  const unsavedLabels = useCallback(() => [...new Set(entries.current.values())], []);
  return { registry, unsavedLabels, hasUnsaved: entries.current.size > 0 };
}

/** Form side: while `dirty`, the panel knows that `label` has unsaved edits */
export function useUnsavedChanges(dirty: boolean, label: string) {
  const registry = useContext(UnsavedChangesContext);
  const id = useId();
  useEffect(() => {
    if (!registry || !dirty) return;
    registry.set(id, label);
    return () => registry.set(id, null);
  }, [registry, dirty, label, id]);
}

/** Top-level fields of two objects (or items of two arrays) differ. Edits replace a field, so references are enough */
export function shallowChanged(a: object | null | undefined, b: object | null | undefined): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) if (!Object.is(ra[key], rb[key])) return true;
  return false;
}

/**
 * Same data, whatever the key order or the object identity (a document read back from Firestore is a new
 * object with its own key order). A missing field and `undefined` are the same: Firestore drops undefined.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) if (!sameValue(ra[key], rb[key])) return false;
  return true;
}

/**
 * true when `values` changed since the form opened. `key` names what is open (null — nothing):
 * the values are remembered when it becomes non-null or changes, e.g. `editingProduct?.id ?? 'new'`.
 */
export function useChangedSince(key: string | null, values: readonly unknown[]): boolean {
  const [baseline, setBaseline] = useState<{ key: string; values: readonly unknown[] } | null>(null);
  // Remembered only when the form opens (the values are left out of the dependencies on purpose)
  useEffect(() => {
    setBaseline(key === null ? null : { key, values });
  }, [key]);
  if (key === null || !baseline || baseline.key !== key) return false;
  return shallowChanged(baseline.values, values);
}
