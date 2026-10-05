/**
 * Перенос данных магазина в бесплатную базу `(default)` (docs/firestore-free-tier-plan.md, этапы 2–3): у именованной
 * базы бесплатной квоты нет, у `(default)` — 50 000 чтений в сутки. Сессия администратора читает все коллекции
 * `BACKUP_COLLECTIONS` старой базы и пишет их в новую; в старой ничего не меняется и не удаляется. Код только для
 * админки (карточка в «Витрине»). Документы новой базы считаются чтением (`readExistingIds`), а не запросом подсчёта:
 * `getCountFromServer` добавил бы ≈ 0,6 КБ gzip в главный бандл покупателя (код Firestore общий для всех чанков).
 */
import { collection, doc, Firestore, getDocs, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, firestoreDatabase } from '../firebase';
import { BACKUP_COLLECTIONS, exportDatabase, readExistingIds } from './firebaseSync';
import {
  BACKUP_COLLECTION_TITLES,
  chunkWrites,
  MOVE_CREATE_ONLY,
  planMove,
  type BackupDoc,
  type RestoreMode,
  type RestoreWrite,
} from './backupRestore';
import { CATALOG_INDEX_COLLECTION, PRODUCT_THUMBS_COLLECTION } from './catalogIndex';

export const FREE_DATABASE_ID = '(default)';

/**
 * Collections outside the backup that the new database needs from its first visitor: the light catalog index and
 * the card miniatures. They are derived from the products (the admin's session rebuilds them), but without a copy the
 * catalog would be empty until the owner opens the site. Copied as they are (the index holds bytes, which the backup
 * format does not keep). The error log (`client_errors`) is not moved: the rules let only the browser that hit the
 * error write it, and the new database starts a fresh log.
 */
const DERIVED_COLLECTIONS: Record<string, string> = {
  [CATALOG_INDEX_COLLECTION]: 'Индекс каталога',
  [PRODUCT_THUMBS_COLLECTION]: 'Миниатюры карточек',
};

export interface CopyFailure {
  collection: string;
  id: string;
  error: string;
}

/**
 * Writes a copy into another database (the move to the free database): batch by batch like `restoreDatabase`, but a
 * refused batch is retried one document at a time, so one refused document does not stop the rest. Nothing is deleted.
 */
export async function copyIntoDatabase(
  chunks: RestoreWrite[][],
  targetDb: Firestore,
  onProgress: (written: number) => void
): Promise<{ written: number; failed: CopyFailure[] }> {
  let written = 0;
  const failed: CopyFailure[] = [];
  for (const chunk of chunks) {
    const batch = writeBatch(targetDb);
    for (const write of chunk) batch.set(doc(targetDb, write.collection, write.id), write.data);
    try {
      await batch.commit();
      written += chunk.length;
    } catch {
      for (const write of chunk) {
        try {
          await setDoc(doc(targetDb, write.collection, write.id), write.data);
          written += 1;
        } catch (error) {
          failed.push({ collection: write.collection, id: write.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    onProgress(written);
  }
  return { written, failed };
}

export interface MoveRow {
  name: string;
  title: string;
  /** Documents in the old database; null — not counted */
  source: number | null;
  target: number | null;
}

export interface MoveResult {
  rows: MoveRow[];
  /** Administrators (`admins/{uid}`) of the old database missing in the new one: the owner adds them in the Console */
  missingAdmins: string[];
  written: number;
  failed: CopyFailure[];
  /** Collections of the old database the session could not read */
  unread: string[];
  finishedAt: Date;
}

/** The free database is not created yet: Firestore answers «The database (default) does not exist» */
export function isMissingDatabase(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === 'not-found' || /does not exist/i.test(message ?? '');
}

/** A row differs: the owner sees it before switching the site to the new database */
export const rowDiffers = (row: MoveRow) => row.source === null || row.target === null || row.source !== row.target;

/**
 * «overwrite» — «Перенести данные»: новая база получает документы как в старой (повторный перенос обновляет копию);
 * «missing» — «Докопировать новое»: только то, чего в новой базе ещё нет. `onProgress` — записано из запланированного.
 * Ошибка чтения новой базы (например, её ещё нет) — исключение до первой записи.
 */
export async function moveToFreeDatabase(
  mode: RestoreMode,
  onProgress: (written: number, total: number) => void
): Promise<MoveResult> {
  const target = firestoreDatabase(FREE_DATABASE_ID);
  const derived = Object.keys(DERIVED_COLLECTIONS);
  const existing = await readExistingIds(mode === 'missing' ? [...BACKUP_COLLECTIONS, ...derived] : MOVE_CREATE_ONLY, target);
  const copy = await exportDatabase(firebaseConfig.firestoreDatabaseId, db);
  const writes = planMove(
    { createdAt: copy.createdAt, databaseId: copy.databaseId, collections: copy.collections as Record<string, BackupDoc[]> },
    mode,
    existing,
    (iso) => Timestamp.fromDate(new Date(iso))
  );
  const derivedCounts: Record<string, number | null> = {};
  for (const name of derived) {
    try {
      const snapshot = await getDocs(collection(db, name));
      derivedCounts[name] = snapshot.size;
      for (const d of snapshot.docs) {
        if (mode === 'overwrite' || !existing[name]?.has(d.id)) writes.push({ collection: name, id: d.id, data: d.data() });
      }
    } catch (error) {
      console.warn(`Collection ${name} was not read:`, error);
      derivedCounts[name] = null;
      copy.failed[name] = error instanceof Error ? error.message : String(error);
    }
  }
  onProgress(0, writes.length);
  const { written, failed } = await copyIntoDatabase(chunkWrites(writes), target, (n) => onProgress(n, writes.length));
  // «В старой» — что прочитано из старой базы для переноса, «в новой» — что в ней после записи
  const moved = await readExistingIds([...BACKUP_COLLECTIONS, ...derived], target);
  const titles: Record<string, string> = { ...BACKUP_COLLECTION_TITLES, ...DERIVED_COLLECTIONS };
  return {
    rows: [...BACKUP_COLLECTIONS, ...derived].map((name) => ({
      name,
      title: titles[name] ?? name,
      source: name in derivedCounts ? derivedCounts[name] : copy.collections[name]?.length ?? null,
      target: moved[name]?.size ?? null,
    })),
    missingAdmins: (copy.collections.admins ?? []).map((d) => d.id).filter((id) => !moved.admins?.has(id)),
    written,
    failed,
    unread: Object.keys(copy.failed),
    finishedAt: new Date(),
  };
}
