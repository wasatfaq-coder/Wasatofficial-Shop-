import React, { useState } from 'react';
import { ArrowRightLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ADMIN_EMAIL, useAuth } from '../../context/AuthContext';
import { pluralRu } from '../../utils/pluralize';
import { isMissingDatabase, moveToFreeDatabase, rowDiffers, type MoveResult } from '../../utils/databaseMove';

interface AdminDatabaseMoveCardProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const docsWord = (n: number) => pluralRu(n, ['документ', 'документа', 'документов']);
const shownCount = (n: number | null) => (n === null ? '—' : String(n));
const FAILED_SHOWN = 10;

/**
 * «Перенести данные в бесплатную базу» (docs/firestore-free-tier-plan.md, этап 2): копия всех коллекций в базу
 * `(default)` с бесплатной квотой и таблица «коллекция, в старой, в новой». Сайт работает со старой базой, пока владелец
 * не сверит таблицу (этап 3 переключает его).
 */
export const AdminDatabaseMoveCard: React.FC<AdminDatabaseMoveCardProps> = ({ onShowToast }) => {
  const { currentUser } = useAuth();
  const [progress, setProgress] = useState<{ written: number; total: number } | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [result, setResult] = useState<MoveResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // In the new database there are no admins/{uid} documents yet: only the owner's account (rules) can write there
  const isOwnerAccount = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleMove = async () => {
    setIsMoving(true);
    setProblem(null);
    setProgress(null);
    try {
      const moved = await moveToFreeDatabase('overwrite', (written, total) => setProgress({ written, total }));
      setResult(moved);
      const differs = moved.rows.filter(rowDiffers).length;
      if (moved.failed.length || moved.unread.length || differs) {
        onShowToast('Перенос закончен, но таблица не сошлась — строки отмечены в карточке', 'error');
      } else {
        onShowToast(`Перенесено: ${moved.written} ${docsWord(moved.written)}, таблица сошлась`, 'success');
      }
    } catch (err) {
      console.error('Move to the free database failed:', err);
      const text = isMissingDatabase(err)
        ? 'Бесплатной базы ещё нет: создайте её в Firebase Console (Firestore → Create database → ID «(default)») и нажмите снова'
        : 'Не удалось перенести данные. Проверьте соединение и нажмите снова — уже перенесённое просто обновится';
      setProblem(text);
      onShowToast(text, 'error');
    } finally {
      setIsMoving(false);
    }
  };

  const differs = result ? result.rows.filter(rowDiffers) : [];
  const total = (key: 'source' | 'target') => (result ? result.rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) : 0);

  return (
    <div className="neu-flat p-4 sm:p-5 rounded-3xl space-y-3 border border-white/60">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
          <ArrowRightLeft className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-[#2D3A4E]">Бесплатная база данных</h4>
          <p className="text-xs text-[#4E5C70] leading-snug">
            Сейчас магазин работает на базе, где оплачивается каждое чтение. Кнопка скопирует товары, заказы, покупателей
            и переписку в бесплатную базу проекта. Сайт пока остаётся на старой базе, в ней ничего не меняется и не
            удаляется. Нажать можно снова: копия обновится.
          </p>
        </div>
      </div>
      {!isOwnerAccount && (
        <p className="text-xs text-[#4E5C70]">
          В новую базу пока может писать только аккаунт владельца ({ADMIN_EMAIL}): войдите им, чтобы перенести данные.
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleMove}
          disabled={isMoving || !isOwnerAccount}
          className={`h-10 px-4 rounded-2xl text-xs font-extrabold flex items-center gap-2 ${
            isMoving || !isOwnerAccount ? 'neu-button-disabled' : 'neu-button text-accent cursor-pointer'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
          {isMoving ? 'Переносим…' : 'Перенести данные в бесплатную базу'}
        </button>
        <p className="text-xs text-[#4E5C70]" role="status">
          {isMoving
            ? progress
              ? `Записано ${progress.written} из ${progress.total}`
              : 'Читаем старую базу…'
            : ''}
        </p>
      </div>
      {problem && (
        <p className="text-xs font-bold text-danger bg-danger-soft border border-danger/20 rounded-2xl px-3 py-2" role="alert">
          {problem}
        </p>
      )}
      {result && (
        <div className="space-y-2">
          {differs.length === 0 && result.failed.length === 0 && result.unread.length === 0 ? (
            <p className="text-xs font-bold text-success bg-success-soft border border-success/20 rounded-2xl px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              Таблица сошлась: {total('target')} {docsWord(total('target'))} в каждой базе. Сайт можно переключать на
              новую базу.
            </p>
          ) : (
            <p className="text-xs font-bold text-danger bg-danger-soft border border-danger/20 rounded-2xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              Не сошлось: {differs.length} {pluralRu(differs.length, ['строка', 'строки', 'строк'])} таблицы
              {result.failed.length ? `, не записано ${result.failed.length} ${docsWord(result.failed.length)}` : ''}
              {result.unread.length ? `, не прочитано: ${result.unread.join(', ')}` : ''}. Сайт остаётся на старой базе.
            </p>
          )}
          <table className="w-full text-xs text-[#2D3A4E]">
            <caption className="text-left text-xs text-[#4E5C70] pb-1">
              Сверка на {result.finishedAt.toLocaleString('ru-RU')}: документов в каждой коллекции
            </caption>
            <thead>
              <tr className="text-[#4E5C70]">
                <th scope="col" className="text-left font-bold py-1">Коллекция</th>
                <th scope="col" className="text-right font-bold py-1 pl-2">В старой</th>
                <th scope="col" className="text-right font-bold py-1 pl-2">В новой</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const bad = rowDiffers(row);
                return (
                  <tr key={row.name} className={`border-t border-[#2D3A4E]/10 ${bad ? 'text-danger font-bold' : ''}`}>
                    <th scope="row" className="text-left font-normal py-1">
                      {row.title}
                      {bad && row.name === 'admins' && (
                        <span className="block text-[11px]">добавьте в Firebase Console — список под таблицей</span>
                      )}
                      {bad && row.name !== 'admins' && <span className="sr-only"> — не совпадает</span>}
                    </th>
                    <td className="text-right py-1 pl-2 tabular-nums">{shownCount(row.source)}</td>
                    <td className="text-right py-1 pl-2 tabular-nums">{shownCount(row.target)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {result.missingAdmins.length > 0 && (
            <div className="text-xs text-[#4E5C70] space-y-1">
              <p className="font-bold text-danger">
                {pluralRu(result.missingAdmins.length, ['Администратора', 'Администраторов', 'Администраторов'])} нет в новой
                базе — без этого после переключения войдёт в панель только аккаунт владельца:
              </p>
              <ul className="list-disc pl-4 break-all font-mono">
                {result.missingAdmins.map((uid) => (
                  <li key={uid}>{uid}</li>
                ))}
              </ul>
              <p>
                Firebase Console → Firestore → база «(default)» → коллекция admins → «Добавить документ»: ID документа — строка
                из списка, поле role со значением admin. Потом нажмите перенос снова, чтобы сверить таблицу.
              </p>
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="text-xs text-[#4E5C70] space-y-1">
              <p className="font-bold text-danger">Не записано в новую базу:</p>
              <ul className="list-disc pl-4 break-words">
                {result.failed.slice(0, FAILED_SHOWN).map((f) => (
                  <li key={`${f.collection}/${f.id}`}>
                    {f.collection}/{f.id}: {f.error}
                  </li>
                ))}
              </ul>
              {result.failed.length > FAILED_SHOWN && <p>и ещё {result.failed.length - FAILED_SHOWN}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
