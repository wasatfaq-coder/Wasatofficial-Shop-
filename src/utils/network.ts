/**
 * Waiting for the database without a network (audit 07.10, finding 12). A Firestore write neither resolves nor fails
 * while there is no connection — it waits in memory, and a closed tab loses it. No Firebase imports: the unit tests in
 * functions/test read this file.
 */

/** The checkout waits this long for the order to be saved, then tells the buyer to check «Мои заказы» first */
export const ORDER_SAVE_TIMEOUT_MS = 20_000;

/** The browser knows it is offline. `navigator.onLine === true` does not promise a connection, `false` is certain */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export type Settled<T> = { timedOut: false; value: T } | { timedOut: true };

/** The promise's value if it comes within `ms`; a rejection passes through. The promise itself goes on after a timeout */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Runs `attempt` until it succeeds: again after each of `delays` ms; after the last one its error is thrown.
 * `shouldStop` ends the retries (the result is no longer needed) — then it rejects with the last error.
 */
export async function retryWithDelays<T>(
  attempt: () => Promise<T>,
  delays: readonly number[],
  options: { shouldStop?: () => boolean; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let i = 0; i <= delays.length; i++) {
    if (i > 0) {
      await sleep(delays[i - 1]);
      if (options.shouldStop?.()) break;
    }
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
