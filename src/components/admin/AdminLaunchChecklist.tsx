import React from 'react';
import { Check, ChevronRight, Rocket } from 'lucide-react';
import type { LaunchStep } from '../../utils/launchChecklist';
import type { AdminTab } from './adminSections';
import { pluralRu } from '../../utils/pluralize';

/**
 * «Запуск магазина»: the first thing an owner sees in the panel while something needed for the first sale is
 * missing. Each step opens its section. Hidden once everything is filled in.
 */
export const AdminLaunchChecklist: React.FC<{ steps: LaunchStep[]; onOpenTab: (tab: AdminTab) => void }> = ({
  steps,
  onOpenTab,
}) => {
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <section aria-labelledby="launch-checklist-title" className="neu-flat rounded-2xl p-4 space-y-3 border border-white/60">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0">
          <Rocket className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="launch-checklist-title" className="text-sm font-extrabold text-[#2D3A4E]">
            Запуск магазина
          </h3>
          <p className="text-xs text-[#4E5C70]">
            Для первой продажи осталось {left} {pluralRu(left, ['шаг', 'шага', 'шагов'])} из {steps.length}
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onOpenTab(step.tab)}
              className="w-full neu-button rounded-xl p-2.5 flex items-center gap-2.5 text-left cursor-pointer"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-extrabold ${
                  step.done ? 'bg-success text-white' : 'neu-inset text-[#2D3A4E]'
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-bold ${step.done ? 'text-[#4E5C70] line-through' : 'text-[#2D3A4E]'}`}>
                  {step.title}
                  <span className="sr-only">{step.done ? ' — готово' : ' — не сделано'}</span>
                </span>
                {!step.done && <span className="block text-[11px] text-[#4E5C70]">{step.hint}</span>}
              </span>
              <ChevronRight className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
