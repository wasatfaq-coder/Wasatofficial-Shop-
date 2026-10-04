// Test data goes only to the local Firebase emulators: every request below is to 127.0.0.1, so the scenarios cannot
// write to the shop's real database (it cannot be restored from the repository)
import fs from 'node:fs';

const firebaseConfig = JSON.parse(fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));

const PROJECT = firebaseConfig.projectId;
const DATABASE = firebaseConfig.firestoreDatabaseId;
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const DOCUMENTS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/${DATABASE}/documents`;
/** The free database the shop moves to (docs/firestore-free-tier-plan.md) */
export const FREE_DATABASE = '(default)';
// «owner» is the emulator's admin token: writes skip firestore.rules, as with the Admin SDK
const OWNER = { Authorization: 'Bearer owner' };

type Value = Record<string, unknown>;

/** A JS value in the Firestore REST format; Date becomes a timestamp */
function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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

/**
 * firebase.json lists two databases (the shop's and the free one), and with more than one the emulator loads no rules
 * and allows everything. The scenarios load firestore.rules into each database themselves
 */
export async function loadRules(): Promise<void> {
  const content = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const body = JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } });
  for (const database of [DATABASE, FREE_DATABASE]) {
    await call(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/${database}:securityRules`, { method: 'PUT', body });
  }
}

/** Empties one database of the emulator */
export async function clearDatabase(database = DATABASE): Promise<void> {
  await call(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/${database}/documents`, { method: 'DELETE' });
}

/** Empties the emulator's databases and accounts */
export async function clearEmulators(): Promise<void> {
  await clearDatabase(DATABASE);
  await clearDatabase(FREE_DATABASE);
  await call(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Writes documents as { 'collection/id': data } in one commit */
export async function writeDocs(docs: Record<string, Record<string, unknown>>, database = DATABASE): Promise<void> {
  const name = (path: string) => `projects/${PROJECT}/databases/${database}/documents/${path}`;
  const writes = Object.entries(docs).map(([path, data]) => ({ update: { name: name(path), fields: toFields(data) } }));
  await call(`${FIRESTORE}/v1/projects/${PROJECT}/databases/${database}/documents:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
}

/** Every document of a collection as { id: data } */
export async function listDocs(collection: string, database = DATABASE): Promise<Record<string, Record<string, unknown>>> {
  const docs: Record<string, Record<string, unknown>> = {};
  let pageToken = '';
  do {
    const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/${database}/documents/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const page = (await (await call(url)).json()) as { documents?: { name: string; fields?: Record<string, Value> }[]; nextPageToken?: string };
    for (const d of page.documents ?? []) docs[d.name.split('/').pop()!] = fromFields(d.fields ?? {});
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return docs;
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
