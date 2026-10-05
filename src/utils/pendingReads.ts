/**
 * Reads the screen on display is waiting for: miniatures of cards, the banner's picture, the product and its photos.
 * Scripts of other screens wait until they are done (docs/performance-plan.md, stage 1): on a slow phone the ≈ 100 КБ of
 * those scripts took the channel from the photos of the first screen. No Firebase here: firebaseSync.ts counts its reads.
 */

let inFlight = 0;
let changedAt = 0;

/** Counts a read until it settles; the promise is returned as is */
export function trackRead<T>(read: Promise<T>): Promise<T> {
  inFlight += 1;
  changedAt = performance.now();
  void read
    .catch(() => {})
    .finally(() => {
      inFlight -= 1;
      changedAt = performance.now();
    });
  return read;
}

/**
 * Resolves when no tracked read has been on its way for `quietMs` (a screen asks for the next read a render after the
 * previous one came: the product, then its previews), or after `maxMs` whatever is still loading
 */
export function whenReadsSettle(quietMs = 600, maxMs = 15_000): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const now = performance.now();
      // quiet since the call too: the cards ask for their miniatures a render after the catalog came
      if ((inFlight === 0 && now - Math.max(changedAt, start) >= quietMs) || now - start >= maxMs) resolve();
      else window.setTimeout(check, 200);
    };
    check();
  });
}
