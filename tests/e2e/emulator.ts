// Test data goes only to the local Firebase emulators: every request below is to 127.0.0.1, so the scenarios cannot
// write to the shop's real database (it cannot be restored from the repository)
import fs from 'node:fs';

const firebaseConfig = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));

const PROJECT = firebaseConfig.projectId;
const DATABASE = firebaseConfig.firestoreDatabaseId;
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const DOCUMENTS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/${DATABASE}/documents`;
// «owner» is the emulator's admin token: writes skip firestore.rules, as with the Admin SDK
const OWNER = { Authorization: 'Bearer owner' };

type Value = Record<string, unknown>;

/** A JS value in the Firestore REST format; Date becomes a timestamp */
function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (v instanceof Uint8Array) return { bytesValue: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  switch (typeof v) {
    case 'string':
      return { stringValue: v };
    case 'boolean':
      return { booleanValue: v };
    case 'number':
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'object':
      return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
    default:
      throw new Error(`Unsupported value in test data: ${typeof v}`);
  }
}

function toFields(o: Record<string, unknown>): Record<string, Value> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toValue(v)]));
}

function fromValue(v: Value): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, Value> }).fields ?? {});
  return undefined;
}

function fromFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...OWNER, 'Content-Type': 'application/json', ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res;
}

/** Fails fast with a hint when the emulators are not running (`bun run test:e2e` starts them) */
export async function assertEmulatorsRunning(): Promise<void> {
  for (const url of [FIRESTORE, AUTH]) {
    try {
      await fetch(url);
    } catch {
      throw new Error(`Нет эмулятора Firebase на ${url}. Запускайте сценарии командой bun run test:e2e`);
    }
  }
}

/** Empties the emulator's database and accounts */
export async function clearEmulators(): Promise<void> {
  await call(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/${DATABASE}/documents`, { method: 'DELETE' });
  await call(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Writes documents as { 'collection/id': data } in one commit */
export async function writeDocs(docs: Record<string, Record<string, unknown>>): Promise<void> {
  const name = (path: string) => `projects/${PROJECT}/databases/${DATABASE}/documents/${path}`;
  const writes = Object.entries(docs).map(([path, data]) => ({ update: { name: name(path), fields: toFields(data) } }));
  await call(`${DOCUMENTS}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
}

/** Reads one document, or null when there is none */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DOCUMENTS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return fromFields(((await res.json()) as { fields?: Record<string, Value> }).fields ?? {});
}

/** Documents of a collection whose field equals the value */
export async function queryDocs(collection: string, field: string, value: unknown): Promise<Record<string, unknown>[]> {
  const res = await call(`${DOCUMENTS}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } },
      },
    }),
  });
  const rows = (await res.json()) as { document?: { fields?: Record<string, Value> } }[];
  return rows.filter((r) => r.document).map((r) => fromFields(r.document!.fields ?? {}));
}
