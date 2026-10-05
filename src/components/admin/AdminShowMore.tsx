import React from 'react';
import { ADMIN_PAGE_SIZE } from '../../utils/usePagedList';

/** «Показано 20 из 1 800 · Показать ещё 20» under a long admin list (usePagedList) */
export const AdminShowMore: React.FC<{ shown: number; total: number; onShowMore: () => void }> = ({ shown, total, onShowMore }) => {
  if (shown >= total) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-xs text-[#4E5C70]">
        Показано {shown} из {total}
      </p>
      <button
        type="button"
        onClick={onShowMore}
        className="neu-button rounded-2xl h-11 px-6 text-sm font-extrabold text-accent cursor-pointer"
      >
        Показать ещё {Math.min(ADMIN_PAGE_SIZE, total - shown)}
      </button>
    </div>
  );
};
