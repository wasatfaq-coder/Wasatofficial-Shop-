import React, { useEffect, useMemo, useState } from 'react';
import { AdminHint } from './AdminHint';
import { Bug, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { deleteClientErrors, deleteClientErrorsBefore, subscribeToClientErrors } from '../../utils/firebaseSync';
import { CLIENT_ERRORS_KEEP_DAYS, type ClientErrorKind, type StoredClientError } from '../../utils/clientErrors';
import { CLIENT_ERROR_KIND_LABELS, groupClientErrors } from '../../utils/clientErrorGroups';
import { pluralRu } from '../../utils/pluralize';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHOWN_GROUPS = 5;

const kindChip: Record<ClientErrorKind, string> = {
  error: 'bg-danger-soft text-danger border-danger/25',
  rejection: 'bg-danger-soft text-danger border-danger/25',
  render: 'bg-danger-soft text-danger border-danger/25',
  console: 'bg-warning-soft text-warning border-warning/25',
  update: 'bg-warning-soft text-warning border-warning/25',
};

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'только что';

/**
 * «Ошибки на сайте» (docs/ops-plan.md, stage 2): what failed on customers' screens, grouped — how often, on which
 * pages, devices and versions. Reads the log only while the card is open; reports older than 14 days are removed
 * when it opens.
 */
export const AdminSiteErrorsCard: React.FC<{
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}> = ({ onShowToast }) => {
  const [errors, setErrors] = useState<StoredClientError[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    deleteClientErrorsBefore(Date.now() - CLIENT_ERRORS_KEEP_DAYS * DAY_MS).catch((err) =>
      console.warn('Old error reports were not removed:', err)
    );
    return subscribeToClientErrors(
      (list) => {
        setErrors(list);
        setFailed(false);
      },
      (err) => {
        console.warn('Error log subscription failed:', err);
        setFailed(true);
      }
    );
  }, []);

  const groups = useMemo(() => groupClientErrors(errors ?? []), [errors]);
  const lastDay = useMemo(() => {
    const since = Date.now() - DAY_MS;
    return (errors ?? []).filter((e) => !e.createdAt || e.createdAt >= since).length;
  }, [errors]);

  const clear = async () => {
    setConfirmClear(false);
    try {
      await deleteClientErrors((errors ?? []).map((e) => e.id));
      onShowToast('Журнал ошибок очищен', 'success');
    } catch (err) {
      console.error('Error log was not cleared:', err);
      onShowToast('Не удалось очистить журнал ошибок', 'error');
    }
  };

  const total = errors?.length ?? 0;
  const summary = failed
    ? 'Журнал ошибок не загрузился. Обновите страницу'
    : errors === null
      ? 'Загрузка…'
      : total === 0
        ? `За ${CLIENT_ERRORS_KEEP_DAYS} дней ошибок у покупателей не было`
        : `За сутки: ${lastDay} · за ${CLIENT_ERRORS_KEEP_DAYS} дней: ${total} ${pluralRu(total, ['запись', 'записи', 'записей'])}`;
  const visible = showAll ? groups : groups.slice(0, SHOWN_GROUPS);

  return (
    <section aria-labelledby="site-errors-title" className="neu-flat rounded-2xl p-4 space-y-3 border border-white/60">
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-xl neu-inset flex items-center justify-center shrink-0 ${lastDay ? 'text-danger' : 'text-accent'}`}>
          <Bug className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 id="site-errors-title" className="text-sm font-extrabold text-[#2D3A4E]">
              Ошибки на сайте
            </h3>
            <AdminHint label="Ошибки на сайте">Сбои, которые случились у покупателей. Если пусто — всё работает</AdminHint>
          </div>
          <p className="text-xs text-[#4E5C70]" aria-live="polite">
            {summary}
          </p>
        </div>
        {total > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="h-9 px-3 rounded-xl neu-button-danger text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Очистить
          </button>
        )}
      </div>

      {groups.length > 0 && (
        <ul className="space-y-2">
          {visible.map((group) => (
            <li key={group.key} className="neu-inset rounded-xl p-3 space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${kindChip[group.kind]}`}>
                  {CLIENT_ERROR_KIND_LABELS[group.kind]}
                </span>
                <span className="text-[11px] text-[#4E5C70]">
                  {group.count} {pluralRu(group.count, ['раз', 'раза', 'раз'])} · последний {when(group.lastAt)}
                </span>
              </div>
              <p className="text-xs font-bold text-[#2D3A4E] break-words">{group.message}</p>
              <p className="text-[11px] text-[#4E5C70] break-words">
                {[
                  group.pages.slice(0, 3).join(', ') + (group.pages.length > 3 ? ` и ещё ${group.pages.length - 3}` : ''),
                  group.browsers.slice(0, 2).join(', '),
                  group.releases.length ? `версия ${group.releases.slice(0, 2).join(', ')}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {group.stack && (
                <details className="text-[11px] text-[#4E5C70]">
                  <summary className="cursor-pointer text-accent font-bold w-fit">Подробности для разработчика</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{group.stack}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.length > SHOWN_GROUPS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="neu-button rounded-xl h-9 px-4 text-xs font-bold text-accent cursor-pointer"
        >
          {showAll ? 'Свернуть' : `Показать все (${groups.length})`}
        </button>
      )}
      {total > 0 && (
        <p className="text-[11px] text-[#4E5C70]">
          Почта и телефоны покупателей в журнал не попадают. В час записывается не больше 30 ошибок, записи старше{' '}
          {CLIENT_ERRORS_KEEP_DAYS} дней удаляются сами. Если ошибка повторяется, перешлите её Claude в проекте.
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        title="Очистить журнал ошибок?"
        message={`В журнале ${total} ${pluralRu(total, ['запись', 'записи', 'записей'])}, они удалятся. Новые ошибки будут записываться как обычно.`}
        confirmLabel="Очистить"
        onConfirm={clear}
        onClose={() => setConfirmClear(false)}
      />
    </section>
  );
};
