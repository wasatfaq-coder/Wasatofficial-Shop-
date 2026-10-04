/**
 * Восстановление базы из файла «Скачать копию базы» (аудит 02.10, находка 19). Здесь — разбор файла и план записей
 * без обращения к базе (тесты — functions/test/backupRestore.test.ts); запись — `restoreDatabase` в firebaseSync.ts.
 *
 * Восстановление ничего не удаляет: документы, которых нет в копии, остаются. Два режима:
 * - «Только недостающие» — пишутся документы, которых сейчас нет в базе (удалённое по ошибке);
 * - «Как в копии» — документы из копии перезаписывают те же документы в базе (изменения после копии теряются).
 */

/** Collections the admin cannot write from the browser (firestore.rules), with the reason shown to the owner */
export const RESTORE_SKIPPED: Record<string, string> = {
  reviews: 'отзыв пишет только его автор',
  review_votes: 'голос «Полезно» пишет только покупатель',
  admins: 'администраторов добавляют только в Firebase Console',
};

/** Human names of the collections in the restore window */
export const BACKUP_COLLECTION_TITLES: Record<string, string> = {
  products: 'Товары',
  product_previews: 'Превью фото товаров',
  product_photos: 'Фото товаров',
  product_costs: 'Себестоимость',
  promos: 'Промокоды',
  settings: 'Настройки витрины',
  banners: 'Баннеры',
  banner_images: 'Картинки баннеров',
  delivery_methods: 'Способы доставки',
  pickup_points: 'Пункты выдачи',
  orders: 'Заказы',
  users: 'Покупатели',
  customer_notes: 'Заметки о покупателях',
  admins: 'Администраторы',
  reviews: 'Отзывы',
  review_votes: 'Голоса «Полезно»',
  chat_messages: 'Сообщения чата',
  chat_images: 'Фото из чата',
  support_threads: 'Диалоги поддержки',
  support_status: 'Статусы диалогов',
  stock_movements: 'Журнал склада',
  promo_uses: 'Использования промокодов',
  payment_templates: 'Шаблоны реквизитов',
};

export type RestoreMode = 'missing' | 'overwrite';

export interface BackupDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface ParsedBackup {
  createdAt: string;
  databaseId: string;
  collections: Record<string, BackupDoc[]>;
}

export interface RestoreWrite {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const DOC_ID = /^[^/]{1,1500}$/;

/** The file of «Скачать копию базы», or the reason it is not one */
export function parseBackup(text: string): ParsedBackup | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'Файл не читается: это не копия базы (нужен .json из «Скачать копию базы»)';
  }
  if (!isPlainObject(raw) || raw.format !== 'wasat-shop-backup') {
    return 'Это не копия базы магазина: нужен файл из «Скачать копию базы»';
  }
  if (raw.version !== 1) return `Копия сделана другой версией сайта (версия ${String(raw.version)}) — её формат не поддерживается`;
  if (!isPlainObject(raw.collections)) return 'В файле нет коллекций базы';

  const collections: Record<string, BackupDoc[]> = {};
  for (const [name, list] of Object.entries(raw.collections)) {
    if (!BACKUP_COLLECTION_TITLES[name]) continue; // a collection this site does not know is left out
    if (!Array.isArray(list)) return `Коллекция «${name}» в файле повреждена`;
    const docs: BackupDoc[] = [];
    for (const entry of list) {
      if (!isPlainObject(entry) || typeof entry.id !== 'string' || !DOC_ID.test(entry.id) || !isPlainObject(entry.data)) {
        return `Коллекция «${name}» в файле повреждена`;
      }
      docs.push({ id: entry.id, data: entry.data });
    }
    collections[name] = docs;
  }
  return {
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    databaseId: typeof raw.databaseId === 'string' ? raw.databaseId : '',
    collections,
  };
}

/** `{ __timestamp: ISO }` of the file back to a date of the database (`toDate` makes a Firestore Timestamp) */
export function fromBackupValue(value: unknown, toDate: (iso: string) => unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => fromBackupValue(v, toDate));
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '__timestamp' && typeof value.__timestamp === 'string') {
      return toDate(value.__timestamp);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromBackupValue(v, toDate)]));
  }
  return value;
}

/**
 * The writes of a restore: the chosen collections without the ones the browser cannot write; in «missing» mode only
 * documents absent now (`existing` — ids per collection). Cost price found inside an old product goes to
 * `product_costs` (rules keep it out of the product), unless the copy or the database already has it there.
 */
export function planRestore(
  backup: ParsedBackup,
  chosen: string[],
  mode: RestoreMode,
  existing: Record<string, Set<string>>,
  toDate: (iso: string) => unknown
): RestoreWrite[] {
  const writes: RestoreWrite[] = [];
  const costIds = new Set((backup.collections.product_costs ?? []).map((d) => d.id));
  const takes = (collection: string, id: string) => mode === 'overwrite' || !existing[collection]?.has(id);

  for (const collection of chosen) {
    if (RESTORE_SKIPPED[collection]) continue;
    for (const doc of backup.collections[collection] ?? []) {
      const data = fromBackupValue(doc.data, toDate) as Record<string, unknown>;
      if (collection === 'products' && 'costPrice' in data) {
        const { costPrice, ...product } = data;
        if (typeof costPrice === 'number' && !costIds.has(doc.id) && takes('product_costs', doc.id)) {
          writes.push({ collection: 'product_costs', id: doc.id, data: { costPrice } });
        }
        if (takes(collection, doc.id)) writes.push({ collection, id: doc.id, data: product });
        continue;
      }
      if (takes(collection, doc.id)) writes.push({ collection, id: doc.id, data });
    }
  }
  return writes;
}

/**
 * Batches of a restore: at most 450 writes (Firestore takes 500) and ≈ 9 МБ (a request takes 10 MiB; a product with
 * photos weighs up to 1 MiB)
 */
export function chunkWrites(writes: RestoreWrite[], maxOps = 450, maxBytes = 9_000_000): RestoreWrite[][] {
  const chunks: RestoreWrite[][] = [];
  let current: RestoreWrite[] = [];
  let bytes = 0;
  for (const write of writes) {
    const size = JSON.stringify(write.data).length + write.id.length + 64;
    if (current.length > 0 && (current.length >= maxOps || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(write);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
