import React from 'react';
import { parseLegalMarkup } from '../utils/legalDocs';

/** A legal document from the simple markup (legalDocs.parseLegalMarkup); «[не заполнено: …]» is highlighted */
export const LegalText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseLegalMarkup(text);
  const inline = (value: string) =>
    value.split(/(\[не заполнено: [^\]]+\])/).map((part, i) =>
      part.startsWith('[не заполнено') ? (
        <mark key={i} className="bg-warning-soft text-warning font-semibold rounded px-1">
          {part}
        </mark>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[#2D3A4E]">
      {blocks.map((b, i) =>
        b.type === 'h2' ? (
          <h2 key={i} className="text-base font-extrabold pt-2">
            {inline(b.text)}
          </h2>
        ) : b.type === 'h3' ? (
          <h3 key={i} className="text-sm font-bold pt-1">
            {inline(b.text)}
          </h3>
        ) : b.type === 'ul' ? (
          <ul key={i} className="list-disc pl-5 space-y-1">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {inline(b.text)}
          </p>
        )
      )}
    </div>
  );
};
