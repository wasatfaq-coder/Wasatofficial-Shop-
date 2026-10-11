import React from 'react';

interface AdminExampleProps {
  /** Жирная первая строка после «Пример: » */
  title: string;
  /** Каждая строка — отдельный абзац */
  lines: string[];
  /** Необязательная мелкая приписка под строками */
  note?: string;
}

/**
 * Живой пример под формой админки: считается из значений формы, поэтому
 * вызывающий передаёт строки только тогда, когда все нужные поля заполнены.
 * Пустой список строк — ничего не рисуем.
 */
export const AdminExample: React.FC<AdminExampleProps> = ({ title, lines, note }) => {
  if (lines.length === 0) return null;
  return (
    <div role="note" aria-label="Пример" className="rounded-2xl p-3 neu-inset space-y-1">
      <p className="text-xs font-bold text-[#2D3A4E]">Пример: «{title}»</p>
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-[#4E5C70]">
          {line}
        </p>
      ))}
      {note && <p className="text-[11px] text-[#4E5C70]">{note}</p>}
    </div>
  );
};
