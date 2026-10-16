import React from 'react';
import { Award, Crown, Scissors, ShieldCheck, Sparkles } from 'lucide-react';
import type { StorefrontSectionProps } from './storefrontForm';
import { StorefrontCard, StorefrontTextField, type StorefrontTextKey } from './StorefrontFields';

/** Подсказки в пустых пунктах гарантий; в настройки не записываются */
const GUARANTEE_EXAMPLES = [
  '100% оригинальность и сертификация каждого изделия.',
  'Расширенная гарантия качества на швы и фурнитуру.',
  'Примерка перед оплатой и лёгкий возврат без лишних вопросов.',
];

/** Меняет пункт гарантии по номеру; пустые пункты в конце списка не хранятся */
export function withGuaranteeItem(list: string[] | undefined, index: number, value: string): string[] {
  const next = [...(list ?? [])];
  while (next.length <= index) next.push('');
  next[index] = value;
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  return next;
}

const SERVICES = [
  { n: 1, title: 'conciergeService1Title', desc: 'conciergeService1Desc' },
  { n: 2, title: 'conciergeService2Title', desc: 'conciergeService2Desc' },
  { n: 3, title: 'conciergeService3Title', desc: 'conciergeService3Desc' },
] as const satisfies readonly { n: number; title: StorefrontTextKey; desc: StorefrontTextKey }[];

/** «Тексты о бренде»: консьерж и услуги, философия, материалы, крой и гарантии — то, что покупатель читает в окне «Бренд и реквизиты» */
export const StorefrontBrandSection: React.FC<StorefrontSectionProps> = ({ settings, patch }) => {
  const field = { settings, patch };
  const updateGuarantee = (index: number, value: string) =>
    patch({ brandGuaranteesList: withGuaranteeItem(settings.brandGuaranteesList, index, value) });

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Пустой текст покупателю не показывается: в окне будет «Не настроено», пока вы не заполните его.
      </p>

      <StorefrontCard title="Консьерж: описание и услуги" icon={<Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <StorefrontTextField
          {...field}
          name="conciergeDescription"
          label="Описание консьерж-сервиса"
          rows={3}
          hint="Текст первого экрана окна «Бренд и реквизиты»: что входит в личное обслуживание."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SERVICES.map(({ n, title, desc }) => (
            <div key={n} className="neu-inset rounded-2xl p-3 space-y-2.5">
              <h5 className="text-xs font-extrabold text-text-primary">Услуга {n}</h5>
              <StorefrontTextField
                {...field}
                name={title}
                label={`Услуга ${n}: заголовок`}
              />
              <StorefrontTextField
                {...field}
                name={desc}
                label={`Услуга ${n}: описание`}
                rows={3}
              />
            </div>
          ))}
        </div>
      </StorefrontCard>

      <StorefrontCard title="Философия бренда" icon={<Crown className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <StorefrontTextField {...field} name="brandPhilosophyTitle" label="Философия: заголовок" />
        <StorefrontTextField {...field} name="brandPhilosophyText" label="Философия: текст" rows={4} />
      </StorefrontCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StorefrontCard title="Материалы и ткани" icon={<Award className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
          <StorefrontTextField {...field} name="brandMaterialsTitle" label="Материалы: заголовок" />
          <StorefrontTextField {...field} name="brandMaterialsText" label="Материалы: описание" rows={4} />
        </StorefrontCard>
        <StorefrontCard title="Крой и пошив" icon={<Scissors className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
          <StorefrontTextField {...field} name="brandCraftsmanshipTitle" label="Крой: заголовок" />
          <StorefrontTextField {...field} name="brandCraftsmanshipText" label="Крой: описание" rows={4} />
        </StorefrontCard>
      </div>

      <StorefrontCard title="Гарантии" icon={<ShieldCheck className="w-3.5 h-3.5 text-success" aria-hidden="true" />}>
        <StorefrontTextField
          {...field}
          name="brandGuaranteesTitle"
          label="Гарантии: заголовок"
          placeholder="Например: Стандарты подлинности и гарантии"
        />
        <div className="space-y-2">
          <p className="text-xs font-bold text-text-secondary">Пункты гарантий (до 3, пустые не показываются)</p>
          {GUARANTEE_EXAMPLES.map((example, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-md neu-flat-sm flex items-center justify-center text-success font-bold text-[11px] shrink-0"
                aria-hidden="true"
              >
                ✓
              </span>
              <input
                type="text"
                value={settings.brandGuaranteesList?.[i] ?? ''}
                onChange={(e) => updateGuarantee(i, e.target.value)}
                placeholder={`Например: ${example}`}
                aria-label={`Пункт гарантии ${i + 1}`}
                className="flex-1 min-w-0 px-3 py-2 neu-inset rounded-xl text-xs text-text-primary"
              />
            </div>
          ))}
        </div>
      </StorefrontCard>
    </div>
  );
};
