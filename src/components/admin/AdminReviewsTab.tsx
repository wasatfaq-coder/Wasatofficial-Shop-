import React, { useMemo, useState } from 'react';
import { BadgeCheck, Check, Search, Star, X } from 'lucide-react';
import type { StorefrontSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../ConfirmDialog';
import { ModalPortal } from '../ModalPortal';
import { NeumorphicSwitch } from '../NeumorphicSwitch';
import {
  buildAdminReviewRows,
  countByStatus,
  decisionTime,
  filterAdminReviews,
  REVIEW_STATUS_LABELS,
  type AdminReviewRatingFilter,
  type AdminReviewRow,
  type AdminReviewStatusFilter,
} from '../../utils/adminReviews';
import { deleteReviewAsAdmin, saveReviewModerationToFirestore } from '../../utils/firebaseSync';
import { reviewVersion } from '../../utils/reviewModeration';
import { MODERATION_REASON_MAX, type ReviewVisibility } from '../../utils/reviewModeration';
import { pluralRu } from '../../utils/pluralize';
import { useAdminReviews } from '../../utils/useAdminReviews';
import { useDialogA11y } from '../../utils/useDialogA11y';
import { usePagedList } from '../../utils/usePagedList';
import { AdminShowMore } from './AdminShowMore';

interface AdminReviewsTabProps {
  settings: StorefrontSettings;
  /** Resolves true once the database took the change (`handleUpdateStorefrontSettings`) */
  onUpdateSettings?: (settings: StorefrontSettings) => Promise<boolean> | boolean | void;
  /** The catalog: the product titles of the list */
  products: { id: string; title: string }[];
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const STATUS_CHIPS: { id: AdminReviewStatusFilter; label: string }[] = [
  { id: 'pending', label: REVIEW_STATUS_LABELS.pending },
  { id: 'published', label: REVIEW_STATUS_LABELS.published },
  { id: 'rejected', label: REVIEW_STATUS_LABELS.rejected },
  { id: 'all', label: 'Все' },
];

const RATING_CHIPS: AdminReviewRatingFilter[] = ['all', 5, 4, 3, 2, 1];

const STATUS_BADGE: Record<ReviewVisibility, string> = {
  pending: 'neu-tone-warning text-text-primary',
  published: 'neu-tone-success text-text-primary',
  rejected: 'neu-tone-danger text-text-primary',
};

const BADGE_LABEL: Record<ReviewVisibility, string> = {
  pending: 'На проверке',
  published: 'Опубликован',
  rejected: 'Отклонён',
};

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span role="img" aria-label={`Оценка ${rating} из 5`} className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        aria-hidden="true"
        className={`w-3.5 h-3.5 ${star <= rating ? 'fill-warning text-warning' : 'text-text-secondary'}`}
      />
    ))}
  </span>
);

/** «Отклонить»: the reason is optional, the author sees it under the review */
const RejectDialog: React.FC<{
  row: AdminReviewRow | null;
  onConfirm: (row: AdminReviewRow, reason: string) => void;
  onClose: () => void;
}> = ({ row, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  // the dialog keeps the review it was opened for while it closes
  const shown = React.useRef<AdminReviewRow | null>(null);
  if (row) shown.current = row;
  const dialog = useDialogA11y(Boolean(row), onClose);
  React.useEffect(() => {
    if (row) setReason('');
  }, [row]);
  if (!row) return null;
  const review = shown.current?.review ?? row.review;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-text-primary/50 backdrop-blur-xs">
        <div
          ref={dialog.ref}
          {...dialog.props}
          className="neu-modal rounded-3xl p-5 max-w-md w-full space-y-3 text-text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id={dialog.titleId} className="text-base font-extrabold">Отклонить отзыв?</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-text-secondary cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            Отзыв {review.authorName} исчезнет у других покупателей и из рейтинга. Автор увидит, что он отклонён, и причину, если вы её напишете.
          </p>
          <div className="space-y-1">
            <label htmlFor="review-reject-reason" className="block text-xs font-bold">Причина (необязательно)</label>
            <textarea
              id="review-reject-reason"
              data-autofocus
              rows={3}
              maxLength={MODERATION_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: отзыв не про товар"
              className="w-full p-3 rounded-xl neu-inset text-xs text-text-primary placeholder:text-text-muted resize-y"
            />
            <p className="text-[11px] text-text-secondary text-right">{reason.length} / {MODERATION_REASON_MAX}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 neu-button rounded-xl text-xs font-extrabold text-text-primary cursor-pointer">
              Отмена
            </button>
            <button
              type="button"
              onClick={() => onConfirm(row, reason.trim())}
              className="flex-1 h-10 neu-button-danger rounded-xl text-xs font-extrabold cursor-pointer"
            >
              Отклонить
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

/**
 * «Отзывы»: every review of the shop with the owner's decision — «На проверке», «Опубликованы», «Отклонены» — and the
 * switch «Проверять отзывы перед публикацией». A decision is `review_moderation/{reviewId}` (src/utils/reviewModeration.ts);
 * the authors' own `reviews` documents are not touched, except by «Удалить».
 */
export const AdminReviewsTab: React.FC<AdminReviewsTabProps> = ({ settings, onUpdateSettings, products, onShowToast }) => {
  const { currentUser } = useAuth();
  const { reviews, decisions, loaded, failed } = useAdminReviews();
  const premoderation = settings.reviewPremoderation === true;
  const [status, setStatus] = useState<AdminReviewStatusFilter>('pending');
  const [rating, setRating] = useState<AdminReviewRatingFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toReject, setToReject] = useState<AdminReviewRow | null>(null);
  const [toDelete, setToDelete] = useState<AdminReviewRow | null>(null);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [confirmPremoderation, setConfirmPremoderation] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  const rows = useMemo(
    () => buildAdminReviewRows(reviews, decisions, products, premoderation),
    [reviews, decisions, products, premoderation]
  );
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const filtered = useMemo(() => filterAdminReviews(rows, { status, rating, query }), [rows, status, rating, query]);
  const { visible, showMore } = usePagedList(filtered, `${status}|${rating}|${query}`);

  const statusCount = (id: AdminReviewStatusFilter) => (id === 'all' ? rows.length : counts[id]);
  const pendingFiltered = useMemo(() => filtered.filter((r) => r.status === 'pending'), [filtered]);

  const handlePublishAllPending = async () => {
    if (pendingFiltered.length === 0 || bulkPublishing) return;
    setBulkPublishing(true);
    try {
      await Promise.all(
        pendingFiltered.map((row) =>
          saveReviewModerationToFirestore({
            id: row.review.id,
            productId: row.review.productId,
            status: 'published',
            at: decisionTime(row.review),
            reviewedVersion: reviewVersion(row.review),
            ...(currentUser?.email ? { by: currentUser.email } : {}),
          })
        )
      );
      onShowToast(
        `Опубликовано ${pendingFiltered.length} ${pluralRu(pendingFiltered.length, ['отзыв', 'отзыва', 'отзывов'])}`,
        'success'
      );
    } catch (err) {
      console.error('Bulk review publish failed:', err);
      onShowToast('Не удалось опубликовать все отзывы', 'error');
    } finally {
      setBulkPublishing(false);
    }
  };

  const decide = async (row: AdminReviewRow, next: 'published' | 'rejected', reason?: string) => {
    setBusyId(row.review.id);
    try {
      await saveReviewModerationToFirestore({
        id: row.review.id,
        productId: row.review.productId,
        status: next,
        ...(reason ? { reason } : {}),
        at: decisionTime(row.review),
        // the decision is for the text the owner sees now: another version of the review waits again
        reviewedVersion: reviewVersion(row.review),
        ...(currentUser?.email ? { by: currentUser.email } : {}),
      });
      onShowToast(next === 'published' ? 'Отзыв опубликован' : 'Отзыв отклонён', 'success');
    } catch (err) {
      console.error('Review moderation failed:', err);
      onShowToast('Не сохранено: не удалось записать решение по отзыву', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const row = toDelete;
    if (!row) return;
    setToDelete(null);
    setBusyId(row.review.id);
    try {
      await deleteReviewAsAdmin(row.review.id);
      onShowToast('Отзыв удалён', 'info');
    } catch (err) {
      console.error('Review delete failed:', err);
      onShowToast('Не сохранено: не удалось удалить отзыв', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Reviews customers see now without the owner's decision: with checking on they would all hide at once (review 11.10,
  // finding 3), so turning it on publishes them first — only new and changed reviews wait for the owner
  const undecidedShown = useMemo(() => rows.filter((row) => !row.decision && row.status === 'published'), [rows]);

  const handleSwitch = async (next: boolean) => {
    if (!onUpdateSettings) return;
    if (next && undecidedShown.length > 0 && !confirmPremoderation) {
      setConfirmPremoderation(true);
      return;
    }
    setConfirmPremoderation(false);
    setSavingSwitch(true);
    try {
      if (next && undecidedShown.length > 0) {
        try {
          await Promise.all(
            undecidedShown.map((row) =>
              saveReviewModerationToFirestore({
                id: row.review.id,
                productId: row.review.productId,
                status: 'published',
                at: decisionTime(row.review),
                reviewedVersion: reviewVersion(row.review),
                ...(currentUser?.email ? { by: currentUser.email } : {}),
              })
            )
          );
        } catch (err) {
          console.error('Publishing the shown reviews before checking failed:', err);
          onShowToast('Не сохранено: проверка не включена — не удалось отметить показанные отзывы опубликованными', 'error');
          return;
        }
      }
      const saved = await onUpdateSettings({ ...settings, reviewPremoderation: next });
      if (saved !== false) {
        onShowToast(next ? 'Отзывы будут появляться после вашей проверки' : 'Отзывы будут появляться сразу', 'success');
      }
    } finally {
      setSavingSwitch(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-extrabold text-text-primary font-display">Отзывы</h3>

      <section aria-label="Проверка отзывов" className="neu-flat rounded-2xl p-4 flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="review-premoderation" className="block text-sm font-extrabold text-text-primary">
            Проверять отзывы перед публикацией
          </label>
          <p className="text-xs text-text-secondary">
            {premoderation
              ? 'Новый или изменённый отзыв видит только его автор, пока вы не нажмёте «Опубликовать». Уже опубликованные остаются.'
              : 'Отзывы появляются у покупателей сразу. Любой можно скрыть кнопкой «Отклонить».'}
          </p>
        </div>
        <NeumorphicSwitch
          id="review-premoderation"
          checked={premoderation}
          onChange={handleSwitch}
          label="Проверять отзывы перед публикацией"
          disabled={savingSwitch || !onUpdateSettings}
        />
      </section>

      {failed ? (
        <p role="alert" className="rounded-2xl neu-tone-danger p-3 text-xs font-bold text-text-primary">
          Не удалось загрузить отзывы. Обновите страницу.
        </p>
      ) : !loaded ? (
        <p role="status" className="py-8 text-center text-xs font-bold text-text-secondary">Загружаем отзывы…</p>
      ) : rows.length === 0 ? (
        <p role="status" className="neu-inset rounded-2xl p-3 text-xs text-text-secondary">
          Отзывов пока нет. Покупатель может оставить отзыв после получения заказа с этим товаром.
        </p>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Найти отзыв"
                placeholder="Автор, текст, товар или номер заказа"
                className="w-full h-10 pl-9 pr-3 neu-inset rounded-xl text-xs text-text-primary"
              />
            </div>
            <div role="radiogroup" aria-label="Какие отзывы показать" className="flex flex-wrap gap-1.5">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="radio"
                  aria-checked={status === chip.id}
                  onClick={() => setStatus(chip.id)}
                  className={`min-h-8 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                    status === chip.id ? 'neu-pill-active font-extrabold' : 'neu-button text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {chip.label} ({statusCount(chip.id)})
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Оценка" className="flex flex-wrap gap-1.5">
              {RATING_CHIPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={value === 'all' ? 'Любая оценка' : `Оценка ${value} из 5`}
                  onClick={() => setRating(value)}
                  className={`min-h-8 px-3 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1 ${
                    rating === value ? 'neu-pill-active font-extrabold' : 'neu-button text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {value === 'all' ? (
                    'Любая оценка'
                  ) : (
                    <>
                      {value}
                      <Star className="w-3 h-3 fill-warning text-warning" aria-hidden="true" />
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-text-secondary" role="status">
              {filtered.length} {pluralRu(filtered.length, ['отзыв', 'отзыва', 'отзывов'])}
            </p>
            {pendingFiltered.length > 1 && (
              <button
                type="button"
                disabled={bulkPublishing}
                onClick={() => void handlePublishAllPending()}
                className={`h-8 px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 ${
                  bulkPublishing ? 'neu-button-disabled' : 'neu-button text-accent cursor-pointer'
                }`}
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {bulkPublishing
                    ? 'Публикуем…'
                    : `Опубликовать все на проверке (${pendingFiltered.length})`}
                </span>
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-text-secondary">
              {status === 'pending' && !query && rating === 'all'
                ? 'Нет отзывов, которые ждут проверки'
                : 'Ничего не найдено. Измените поиск или фильтры'}
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((row) => {
                const { review } = row;
                const busy = busyId === review.id;
                return (
                  <li key={review.id} className="neu-flat rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-sm font-extrabold text-text-primary min-w-0 break-words">{row.productTitle}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap ${STATUS_BADGE[row.status]}`}>
                        {BADGE_LABEL[row.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-text-secondary">
                      <span className="font-bold text-text-primary">{review.authorName}</span>
                      <Stars rating={review.rating} />
                      <span>{review.date}</span>
                    </div>
                    {review.orderId ? (
                      <p className="text-[11px] font-bold text-success flex items-center gap-1">
                        <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Покупка подтверждена · заказ № {review.orderId}
                      </p>
                    ) : (
                      <p className="text-[11px] font-bold text-text-secondary">Без привязки к заказу</p>
                    )}
                    {(review.sizePurchased || review.colorPurchased) && (
                      <p className="text-xs text-text-secondary">
                        {[review.sizePurchased && `Размер: ${review.sizePurchased}`, review.colorPurchased && `Цвет: ${review.colorPurchased}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-text-primary leading-relaxed whitespace-pre-line break-words">{review.comment}</p>
                    {review.pros && (
                      <p className="text-xs text-text-primary break-words">
                        <span className="font-extrabold text-success">Достоинства: </span>
                        {review.pros}
                      </p>
                    )}
                    {review.cons && (
                      <p className="text-xs text-text-primary break-words">
                        <span className="font-extrabold text-danger">Недостатки: </span>
                        {review.cons}
                      </p>
                    )}
                    {row.status === 'rejected' && row.decision?.reason && (
                      <p className="text-xs text-text-primary break-words">
                        <span className="font-extrabold">Причина отказа: </span>
                        {row.decision.reason}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {row.status !== 'published' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide(row, 'published')}
                          aria-label={`Опубликовать отзыв: ${review.authorName}, ${row.productTitle}`}
                          className={`h-9 px-4 rounded-xl text-xs font-extrabold ${busy ? 'neu-button-disabled' : 'neu-button-accent text-white cursor-pointer'}`}
                        >
                          Опубликовать
                        </button>
                      )}
                      {row.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setToReject(row)}
                          aria-label={`Отклонить отзыв: ${review.authorName}, ${row.productTitle}`}
                          className={`h-9 px-4 rounded-xl text-xs font-extrabold ${busy ? 'neu-button-disabled' : 'neu-button text-text-primary cursor-pointer'}`}
                        >
                          Отклонить
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setToDelete(row)}
                        aria-label={`Удалить отзыв: ${review.authorName}, ${row.productTitle}`}
                        className={`h-9 px-4 rounded-xl text-xs font-extrabold ${busy ? 'neu-button-disabled' : 'neu-button-danger cursor-pointer'}`}
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <AdminShowMore shown={visible.length} total={filtered.length} onShowMore={showMore} />
        </>
      )}

      <RejectDialog
        row={toReject}
        onClose={() => setToReject(null)}
        onConfirm={(row, reason) => {
          setToReject(null);
          void decide(row, 'rejected', reason);
        }}
      />

      <ConfirmDialog
        isOpen={confirmPremoderation}
        title="Включить проверку отзывов?"
        tone="neutral"
        confirmIcon={<Check className="w-3.5 h-3.5" aria-hidden="true" />}
        confirmLabel="Включить"
        message={`Отзывы, которые покупатели видят сейчас (${undecidedShown.length}), останутся на сайте — они будут отмечены «Опубликован». Новые и изменённые отзывы появятся после вашей проверки.`}
        onConfirm={() => void handleSwitch(true)}
        onClose={() => setConfirmPremoderation(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Удалить отзыв?"
        message="Отзыв исчезнет навсегда, рейтинг товара пересчитается. Автор сможет написать новый."
        preview={
          toDelete && (
            <div className="space-y-1 text-left min-w-0">
              <p className="text-xs font-extrabold text-text-primary break-words">
                {toDelete.review.authorName} · {toDelete.productTitle}
              </p>
              <Stars rating={toDelete.review.rating} />
              <p className="text-xs text-text-secondary break-words line-clamp-3">{toDelete.review.comment}</p>
            </div>
          )
        }
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
};
