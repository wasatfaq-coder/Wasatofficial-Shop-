import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { IS_PREVIEW_BUILD } from '../utils/previewBuild';

/** On the preview of a pull request only: this copy of the site reads and writes the store's real data */
export const PreviewBanner: React.FC = () => {
  if (!IS_PREVIEW_BUILD) return null;
  return (
    <div role="note" className="bg-warning-soft border-b border-warning/40 px-4 py-2 text-center">
      <p className="max-w-3xl mx-auto text-xs font-bold text-warning flex items-center justify-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Проверочная версия сайта с настоящими данными магазина: заказы и изменения в админке сохраняются по-настоящему.
      </p>
    </div>
  );
};
