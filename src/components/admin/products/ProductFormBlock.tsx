import React from 'react';
import { ChevronDown } from 'lucide-react';

/** Blocks of the product form, top to bottom (stage 4 of docs/admin-wholesale-plan.md, variant A) */
export const PRODUCT_FORM_BLOCKS = ['main', 'prices', 'photos', 'variants', 'card'] as const;
export type ProductFormBlockId = (typeof PRODUCT_FORM_BLOCKS)[number];
/** An existing product opens on what is changed most: the name and the prices; the rest shows its summary */
export const EDITED_PRODUCT_OPEN_BLOCKS: ProductFormBlockId[] = ['main', 'prices'];

/**
 * One block of the product form: a heading button and what is filled in, the fields under it. A closed block does not
 * render its fields; «*» — the block has fields the product is not saved without. The summary describes the button
 * rather than naming it: the heading stays «Цены» while the owner types.
 */
export function ProductFormBlock({
  id,
  title,
  summary,
  required = false,
  open,
  onToggle,
  children,
}: {
  id: ProductFormBlockId;
  title: string;
  summary: string;
  required?: boolean;
  open: boolean;
  onToggle: (id: ProductFormBlockId) => void;
  children: React.ReactNode;
}) {
  const panelId = `product-form-block-${id}`;
  return (
    <section aria-labelledby={`${panelId}-title`} className="neu-flat-sm rounded-2xl border border-white/60">
      {/* the button is stretched over the whole row: the summary and the arrow open the block too */}
      <div className="relative min-h-12 px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`${panelId}-title`} className="text-sm font-extrabold text-[#2D3A4E] font-display">
            <button
              type="button"
              onClick={() => onToggle(id)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-describedby={`${panelId}-summary`}
              className="text-left cursor-pointer after:absolute after:inset-0 after:rounded-2xl"
            >
              {title}
              {required && (
                <span className="text-danger" aria-hidden="true">
                  {' '}*
                </span>
              )}
            </button>
          </h4>
          <p id={`${panelId}-summary`} className="text-xs text-[#4E5C70] leading-snug truncate">
            {summary}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-accent shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </div>
      <div id={panelId} hidden={!open} className="px-3.5 pb-3.5 space-y-3">
        {open && children}
      </div>
    </section>
  );
}
