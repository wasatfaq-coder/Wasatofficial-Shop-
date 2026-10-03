import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

/** Where the catalog subscription is: the empty-catalog text is shown only after the answer came */
export type CatalogStatus = 'loading' | 'ready' | 'error';

/** After this long without an answer the customer is told what is going on */
const SLOW_AFTER_MS = 15_000;

const reload = () => window.location.reload();

/**
 * While the catalog loads: placeholder cards in the grid of the screen (not «Товары появятся здесь»,
 * which made the store look empty for seconds). If it takes long — say so, but do not offer a reload while the data
 * is coming (audit 02.10, finding 28: a reload started the download from scratch, and a big catalog never opened).
 * Without a connection — say that; Firestore goes on by itself when it is back. A failed subscription offers a reload.
 */
export const CatalogLoadState: React.FC<{ status: Exclude<CatalogStatus, 'ready'>; cards?: number }> = ({
  status,
  cards = 4,
}) => {
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [status]);

  if (status === 'error') {
    return (
      <div role="alert" className="neu-inset rounded-3xl p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl neu-flat-sm mx-auto flex items-center justify-center text-warning">
          <WifiOff className="w-6 h-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-bold text-[#2D3A4E]">Не удалось загрузить каталог</p>
        <p className="text-xs text-[#4E5C70]">Проверьте соединение и обновите страницу.</p>
        <button
          type="button"
          onClick={reload}
          className="neu-button rounded-xl px-4 h-10 text-xs font-bold text-accent inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Обновить страницу
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div role="status" className="sr-only">
        Загрузка каталога…
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5" aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="neu-flat rounded-3xl p-2.5 space-y-2.5">
            <div className="aspect-[3/4] rounded-2xl neu-inset animate-pulse" />
            <div className="h-3 rounded-full neu-inset w-4/5 animate-pulse" />
            <div className="h-3 rounded-full neu-inset w-2/5 animate-pulse" />
          </div>
        ))}
      </div>
      {(slow || offline) && (
        <div role="status" className="neu-inset rounded-2xl p-3 flex items-center gap-3">
          {offline && <WifiOff className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />}
          <p className="text-xs text-[#4E5C70]">
            {offline
              ? 'Нет соединения с интернетом. Каталог загрузится сам, когда связь появится.'
              : 'Каталог загружается дольше обычного: фото товаров ещё скачиваются. Страница откроется сама — обновлять не нужно.'}
          </p>
        </div>
      )}
    </div>
  );
};
