/**
 * Errors of database operations (audit 07.10, findings 15, 18, 21): the code of a failure, which failures the owner
 * must hear about, and one error for a failed write that keeps the code and the original. No Firebase imports: the
 * unit tests in functions/test read this file.
 */

/** Code of a database error (`permission-denied`, `unavailable`…), also of an error that wraps it in `cause` */
export function firestoreErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code.replace(/^firestore\//, '');
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The database refused: the rules, the daily quota, a missing index or a broken query. That is for the owner —
 * `console.error` reaches «Аналитика» → «Ошибки на сайте». No network and the like are not: the client waits and
 * tries again by itself, so those stay `console.warn`.
 */
const OWNER_ATTENTION_CODES = new Set(['permission-denied', 'resource-exhausted', 'failed-precondition', 'invalid-argument']);

export function needsOwnerAttention(error: unknown): boolean {
  const code = firestoreErrorCode(error);
  return code !== undefined && OWNER_ATTENTION_CODES.has(code);
}

/**
 * One error for a failed write (finding 21): what and where, the code (`[code=…]`, as the database client writes it),
 * the original in `cause` and its stack under ours. Nothing is logged here — the caller logs it once.
 */
export function firestoreOperationError(error: unknown, operation: string, path: string | null): Error & { code?: string } {
  const original = error instanceof Error ? error.message : String(error);
  const code = firestoreErrorCode(error);
  const wrapped: Error & { code?: string } = new Error(
    `Firestore ${operation}${path ? ` ${path}` : ''}${code ? ` [code=${code}]` : ''}: ${original}`,
    { cause: error }
  );
  if (code) wrapped.code = code;
  if (error instanceof Error && error.stack) wrapped.stack = `${wrapped.stack ?? ''}\nCaused by: ${error.stack}`;
  return wrapped;
}
