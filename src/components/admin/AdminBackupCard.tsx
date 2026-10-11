import React, { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import firebaseConfig from '../../../firebase-applet-config.json';
import { exportDatabase, loadBackupMark, saveBackupMark } from '../../utils/firebaseSync';
import { pluralRu } from '../../utils/pluralize';
import { daysSinceBackup, parseBackup, type BackupMark, type ParsedBackup } from '../../utils/backupRestore';
import { AdminRestoreDialog } from './AdminRestoreDialog';
import { AdminHint } from './AdminHint';

interface AdminBackupCardProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** A copy is due once a week (the hint says so) */
const BACKUP_DUE_DAYS = 7;

/** «Последняя копия: 3 октября, 14:05 — 8 дней назад» */
function lastCopyText(mark: BackupMark): string {
  const days = daysSinceBackup(mark) ?? 0;
  const when = new Date(mark.lastExportAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const ago = days === 0 ? 'сегодня' : `${days} ${pluralRu(days, ['день', 'дня', 'дней'])} назад`;
  return `Последняя копия: ${when} — ${ago}${mark.complete ? '' : ' (неполная)'}`;
}

/**
 * A copy of the whole database as a JSON file on the owner's computer. Free: it only reads (within the Firestore
 * quota) and nothing is stored in the cloud. The file holds customers' names, phones and addresses.
 */
export const AdminBackupCard: React.FC<AdminBackupCardProps> = ({ onShowToast }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  // undefined — still reading; null — no copy yet (этап 6 плана админки, находка 20)
  const [mark, setMark] = useState<BackupMark | null | undefined>(undefined);
  const [markFailed, setMarkFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBackupMark()
      .then((loaded) => alive && setMark(loaded))
      .catch((err) => {
        console.warn('The date of the last backup was not read:', err);
        if (alive) setMarkFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const [restoring, setRestoring] = useState<{ backup: ParsedBackup; fileName: string } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setIsReading(true);
    try {
      const parsed = parseBackup(await file.text());
      if (typeof parsed === 'string') onShowToast(parsed, 'error');
      else setRestoring({ backup: parsed, fileName: file.name });
    } catch (err) {
      console.error('Backup file was not read:', err);
      onShowToast('Не удалось прочитать файл. Большую копию открывайте с компьютера', 'error');
    } finally {
      setIsReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const backup = await exportDatabase(firebaseConfig.firestoreDatabaseId);
      const docs = Object.values(backup.collections).reduce((sum, list) => sum + list.length, 0);
      const failed = Object.keys(backup.failed);
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wasat-shop-backup-${backup.createdAt.slice(0, 16).replace(':', '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const summary = `${docs} ${pluralRu(docs, ['документ', 'документа', 'документов'])} из ${
        Object.keys(backup.collections).length
      } ${pluralRu(Object.keys(backup.collections).length, ['коллекции', 'коллекций', 'коллекций'])}`;
      setLastResult(`${new Date().toLocaleString('ru-RU')}: ${summary}`);
      // The file is on the device already; a mark that didn't save only loses the reminder, so it doesn't fail the copy
      try {
        await saveBackupMark(docs, failed.length === 0);
        setMark({ lastExportAt: Date.now(), documents: docs, complete: failed.length === 0 });
        setMarkFailed(false);
      } catch (err) {
        console.warn('The date of the backup was not saved:', err);
      }
      if (failed.length) onShowToast(`Копия неполная: не прочитано ${failed.join(', ')}`, 'error');
      else onShowToast(`Копия базы скачана: ${summary}`, 'success');
    } catch (err) {
      console.error('Database export failed:', err);
      onShowToast('Не удалось сделать копию базы. Проверьте соединение и повторите', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="neu-flat p-4 sm:p-5 rounded-3xl space-y-3 border border-white/60">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
          <DatabaseBackup className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h4 className="text-sm font-extrabold text-[#2D3A4E]">Резервная копия базы</h4>
            <AdminHint label="Резервная копия базы">
              Файл со всем магазином на ваш телефон. Делайте раз в неделю, храните тайно.
            </AdminHint>
          </div>
          <p className="text-xs text-[#4E5C70] leading-snug">
            Файл со всеми товарами, заказами, покупателями и перепиской сохранится на этом устройстве. Делайте копию
            раз в неделю и перед большими изменениями. В файле личные данные покупателей — храните его только у себя.
          </p>
        </div>
      </div>
      <BackupAge mark={mark} failed={markFailed} />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className={`h-10 px-4 rounded-2xl text-xs font-extrabold flex items-center gap-2 ${
            isExporting ? 'neu-button-disabled' : 'neu-button text-accent cursor-pointer'
          }`}
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'Готовим копию…' : 'Скачать копию базы'}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isReading}
          className={`h-10 px-4 rounded-2xl text-xs font-extrabold flex items-center gap-2 ${
            isReading ? 'neu-button-disabled' : 'neu-button text-[#2D3A4E] cursor-pointer'
          }`}
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          {isReading ? 'Читаем файл…' : 'Восстановить из копии'}
        </button>
        <AdminHint label="Восстановить из копии" className="-ml-2">
          Вернёт данные из файла копии. Сначала прочтите, чем отличаются два режима.
        </AdminHint>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {lastResult && <p className="text-xs text-[#4E5C70]">Скачано: {lastResult}</p>}
      </div>
      <AdminRestoreDialog
        backup={restoring?.backup ?? null}
        fileName={restoring?.fileName ?? ''}
        onClose={() => setRestoring(null)}
        onShowToast={onShowToast}
      />
    </div>
  );
};

/** The date of the last copy; a warning when there is none or it's older than a week */
const BackupAge: React.FC<{ mark: BackupMark | null | undefined; failed: boolean }> = ({ mark, failed }) => {
  if (failed) return <p className="text-xs text-[#4E5C70]">Не удалось узнать дату последней копии</p>;
  if (mark === undefined) return null;
  const days = daysSinceBackup(mark);
  const due = days === null || days >= BACKUP_DUE_DAYS || mark?.complete === false;
  const text = mark ? lastCopyText(mark) : 'Копию базы ещё не скачивали';
  return (
    <p
      role="status"
      className={`text-xs font-bold rounded-2xl px-3 py-2 ${due ? 'bg-warning-soft text-warning border border-warning/30' : 'text-[#4E5C70]'}`}
    >
      {text}
      {due && '. Скачайте свежую копию'}
    </p>
  );
};
