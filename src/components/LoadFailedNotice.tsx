import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

const reload = () => window.location.reload();

/**
 * The data of the screen did not load (audit 07.10, findings 15, 20): said in place of an empty list, with a reload —
 * a failed subscription does not come back by itself. The tinted box has no `neu-*` (they override the background).
 */
export const LoadFailedNotice: React.FC<{ title: string; text?: string; className?: string }> = ({
  title,
  text = 'Проверьте соединение и обновите страницу.',
  className = '',
}) => (
  <div role="alert" className={`rounded-2xl p-3.5 neu-tone-warning flex items-start gap-3 text-left ${className}`}>
    <WifiOff className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-2">
      <p className="text-xs font-extrabold text-text-primary">{title}</p>
      <p className="text-xs text-text-primary">{text}</p>
      <button
        type="button"
        onClick={reload}
        className="neu-button rounded-xl px-3.5 h-9 text-xs font-bold text-accent inline-flex items-center gap-1.5 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        Обновить страницу
      </button>
    </div>
  </div>
);
