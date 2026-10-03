import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { ModalPortal } from '../ModalPortal';
import { ConfirmDialog } from '../ConfirmDialog';
import { SelectCheckbox } from './SelectCheckbox';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { pluralRu } from '../../utils/pluralize';
import { readExistingIds, restoreDatabase } from '../../utils/firebaseSync';
import {
  BACKUP_COLLECTION_TITLES,
  chunkWrites,
  planRestore,
  RESTORE_SKIPPED,
  type ParsedBackup,
  type RestoreMode,
  type RestoreWrite,
} from '../../utils/backupRestore';

const docsWord = (n: number) => pluralRu(n, ['документ', 'документа', 'документов']);
const toTimestamp = (iso: string) => Timestamp.fromDate(new Date(iso));

const MODES: { value: RestoreMode; title: string; hint: string }[] = [
  {
    value: 'missing',
    title: 'Только недостающие',
    hint: 'Вернуть удалённое: пишутся документы, которых сейчас нет в базе. Существующие не меняются.',
  },
  {
    value: 'overwrite',
    title: 'Как в копии',
    hint: 'Документы из копии заменят те же документы в базе: изменения после даты копии в них пропадут.',
  },
];

interface AdminRestoreDialogProps {
  backup: ParsedBackup | null;
  fileName: string;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * «Восстановить из копии» (аудит 02.10, находка 19): что брать из файла и как — без удаления. Отзывы, голоса
 * и администраторов браузер записать не может (правила) — они показаны, но не выбираются.
 */
export const AdminRestoreDialog: React.FC<AdminRestoreDialogProps> = ({ backup, fileName, onClose, onShowToast }) => {
  const isOpen = Boolean(backup);
  const [mode, setMode] = useState<RestoreMode>('missing');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<'checking' | 'writing' | null>(null);
  const [plan, setPlan] = useState<RestoreWrite[] | null>(null);
  const [written, setWritten] = useState(0);
  const dialog = useDialogA11y(isOpen, () => !busy && onClose(), { closeOnEscape: !busy });

  const collections = useMemo(
    () => (backup ? Object.keys(BACKUP_COLLECTION_TITLES).filter((name) => (backup.collections[name]?.length ?? 0) > 0) : []),
    [backup]
  );
  const restorable = collections.filter((name) => !RESTORE_SKIPPED[name]);

  useEffect(() => {
    if (!isOpen) return;
    setMode('missing');
    setChosen(restorable);
    setPlan(null);
    setWritten(0);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!backup) return null;

  const createdAt = backup.createdAt ? new Date(backup.createdAt) : null;
  const otherDatabase = Boolean(backup.databaseId) && backup.databaseId !== firebaseConfig.firestoreDatabaseId;
  const chosenDocs = chosen.reduce((sum, name) => sum + (backup.collections[name]?.length ?? 0), 0);
  const toggle = (name: string) =>
    setChosen((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const prepare = async () => {
    setBusy('checking');
    try {
      const existing = mode === 'missing' ? await readExistingIds([...chosen, ...(chosen.includes('products') ? ['product_costs'] : [])]) : {};
      const writes = planRestore(backup, chosen, mode, existing, toTimestamp);
      if (writes.length === 0) {
        onShowToast('Всё выбранное из копии уже есть в базе — записывать нечего', 'info');
        return;
      }
      setPlan(writes);
    } catch (err) {
      console.error('Restore check failed:', err);
      onShowToast('Не удалось прочитать базу перед восстановлением. Проверьте соединение', 'error');
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    const writes = plan;
    setPlan(null);
    if (!writes) return;
    setBusy('writing');
    setWritten(0);
    try {
      const total = await restoreDatabase(chunkWrites(writes), setWritten);
      onShowToast(`Восстановлено ${total} ${docsWord(total)} из копии`, 'success');
      onClose();
    } catch (err) {
      console.error('Restore failed:', err);
      onShowToast(
        `Восстановление остановлено: ${err instanceof Error ? err.message : 'ошибка записи'}. Уже записанное осталось в базе — можно повторить в режиме «Только недостающие»`,
        'error'
      );
    } finally {
      setBusy(null);
    }
  };

  const planSummary = plan
    ? Object.entries(
        plan.reduce<Record<string, number>>((acc, w) => ({ ...acc, [w.collection]: (acc[w.collection] ?? 0) + 1 }), {})
      )
        .map(([name, n]) => `${BACKUP_COLLECTION_TITLES[name] ?? name} — ${n}`)
        .join(', ')
    : '';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
        <div onClick={() => !busy && onClose()} className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer" />
        <div
          ref={dialog.ref}
          {...dialog.props}
          className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto neu-modal rounded-3xl p-5 space-y-4 z-10"
        >
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#BAC5D5]/50">
            <h3 id={dialog.titleId} className="text-sm font-extrabold text-[#2D3A4E]">
              Восстановление из копии
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(busy)}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <p className="text-xs text-[#4E5C70] break-words">
            Файл {fileName}
            {createdAt && !Number.isNaN(createdAt.getTime()) && (
              <>, копия от {createdAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
            )}
            . Восстановление ничего не удаляет: документы, которых нет в копии, остаются.
          </p>
          {otherDatabase && (
            <p role="note" className="rounded-xl bg-warning-soft border border-warning/30 p-2.5 text-xs text-[#2D3A4E] flex gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
              Копия сделана из другой базы ({backup.databaseId}). Проверьте, что выбрали нужный файл.
            </p>
          )}

          <div role="radiogroup" aria-label="Как восстановить" className="space-y-1.5">
            {MODES.map((item) => {
              const selected = mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(item.value)}
                  disabled={Boolean(busy)}
                  className={`w-full px-3 py-2 rounded-xl text-left flex items-start gap-2.5 cursor-pointer ${
                    selected ? 'neu-pill-active' : 'neu-button'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${selected ? 'neu-fill-accent' : 'neu-inset'}`}
                    aria-hidden="true"
                  >
                    {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold text-[#2D3A4E]">{item.title}</span>
                    <span className="block text-xs text-[#4E5C70]">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-extrabold text-[#2D3A4E] mb-1.5">Что восстановить</legend>
            {collections.map((name) => {
              const count = backup.collections[name]?.length ?? 0;
              const skipped = RESTORE_SKIPPED[name];
              const checked = chosen.includes(name);
              return (
                <div key={name} className="neu-flat-sm rounded-xl px-3 py-2 flex items-center gap-2.5 min-w-0">
                  {skipped ? (
                    <span className="w-7 shrink-0" aria-hidden="true" />
                  ) : (
                    <SelectCheckbox checked={checked} onToggle={() => !busy && toggle(name)} label={BACKUP_COLLECTION_TITLES[name]} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-bold ${skipped ? 'text-[#4E5C70]' : 'text-[#2D3A4E]'}`}>
                      {BACKUP_COLLECTION_TITLES[name]}
                    </span>
                    {skipped && <span className="block text-[11px] text-[#4E5C70]">Не восстанавливается: {skipped}</span>}
                  </span>
                  <span className="text-[11px] font-bold text-[#4E5C70] shrink-0">
                    {count} {docsWord(count)}
                  </span>
                </div>
              );
            })}
          </fieldset>

          <p className="text-xs text-[#4E5C70]">
            Выбрано документов в копии: {chosenDocs}. В режиме «Только недостающие» запишутся лишь те, которых нет в базе.
          </p>

          {busy === 'writing' && (
            <p role="status" className="text-xs font-bold text-accent flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Записано {written} {docsWord(written)}… Не закрывайте страницу.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(busy)}
              className="h-10 px-4 neu-button rounded-2xl text-xs font-bold text-[#4E5C70] cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={prepare}
              disabled={Boolean(busy) || chosen.length === 0}
              className={`h-10 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer ${
                busy || chosen.length === 0 ? 'neu-button-disabled text-[#4E5C70]' : 'neu-button-accent'
              }`}
            >
              {busy === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
              {busy === 'checking' ? 'Сверяем с базой…' : 'Восстановить'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={plan !== null}
        title={`Записать ${plan?.length ?? 0} ${docsWord(plan?.length ?? 0)} в базу?`}
        tone="neutral"
        confirmLabel="Записать"
        cancelLabel="Не записывать"
        confirmIcon={<RotateCcw className="w-4 h-4" />}
        message={
          <>
            {planSummary}.{' '}
            {mode === 'overwrite'
              ? 'Документы с теми же номерами в базе будут заменены версией из копии.'
              : 'Существующие документы не меняются.'}{' '}
            Сайт покупателей увидит восстановленное сразу.
          </>
        }
        onConfirm={run}
        onClose={() => setPlan(null)}
      />
    </ModalPortal>
  );
};
