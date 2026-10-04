// `bun --preload` for scripts/share-pages.ts in the measure: its requests to the real Firestore go to the local emulator
// instead, and the bytes it receives are counted (the script prints its own count too since stage 1 — the preload
// measures the version before it the same way). Only the emulator: the real database is never reached
const EMULATOR = 'http://127.0.0.1:8080';
const real = globalThis.fetch;
let bytes = 0;
let requests = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://firestore.googleapis.com/')) throw new Error(`Замер ходит только в эмулятор: ${url}`);
  const res = await real(url.replace('https://firestore.googleapis.com', EMULATOR), init);
  const body = await res.arrayBuffer();
  bytes += body.byteLength;
  requests += 1;
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}) as typeof fetch;
process.on('exit', () => console.error(`замер: ${requests} запросов к базе, ${Math.round(bytes / 1024)} КБ`));
