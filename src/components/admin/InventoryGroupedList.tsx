import React, { useMemo } from 'react';
import { AlertTriangle, Check, ChevronDown, FolderOpen, Printer, XCircle } from 'lucide-react';
import type { Product, ProductSKU, StoreCategory } from '../../types';
import { articleCode, articleGroupKey, skuKey } from '../../shared/barcode';
import { categoryIcon } from '../../utils/categories';
import { productImage } from '../../utils/productImage';
import { pluralRu } from '../../utils/pluralize';
import type { LabelTarget } from './AdminLabelGenerator';

export type InventoryGrouping = 'category' | 'model' | 'flat';

export interface InventoryRow {
  product: Product;
  sku: ProductSKU;
}

interface ArticleGroup {
  key: string;
  color: string;
  article: string;
  rows: InventoryRow[];
}

interface ModelGroup {
  product: Product;
  articles: ArticleGroup[];
  rows: InventoryRow[];
}

interface CategoryGroup {
  id: string;
  name: string;
  icon: React.FC<{ className?: string }>;
  models: ModelGroup[];
  rows: InventoryRow[];
}

const NO_CATEGORY = '__none';

/** Units, variations, low and sold-out variations of some rows */
function summarize(rows: InventoryRow[], lowStockThreshold: number) {
  let units = 0;
  let low = 0;
  let out = 0;
  for (const { sku } of rows) {
    units += sku.stock;
    if (sku.stock === 0) out++;
    else if (sku.stock <= lowStockThreshold) low++;
  }
  return { units, variants: rows.length, low, out };
}

/** Model → articles (product + colour, one barcode) → sizes, in the order of the product's variations */
function groupModels(rows: InventoryRow[]): ModelGroup[] {
  const models = new Map<string, ModelGroup>();
  for (const row of rows) {
    let model = models.get(row.product.id);
    if (!model) {
      model = { product: row.product, articles: [], rows: [] };
      models.set(row.product.id, model);
    }
    model.rows.push(row);
    const key = articleGroupKey(row.product.id, row.sku.color);
    let article = model.articles.find((a) => a.key === key);
    if (!article) {
      article = { key, color: row.sku.color, article: articleCode(row.product, row.sku.color) || row.sku.skuCode || '', rows: [] };
      model.articles.push(article);
    }
    article.rows.push(row);
  }
  return [...models.values()].sort((a, b) => a.product.title.localeCompare(b.product.title, 'ru'));
}

/** Categories in the order of Admin → «Категории»; unknown ones by name, «Без категории» last */
function groupCategories(rows: InventoryRow[], categories: StoreCategory[]): CategoryGroup[] {
  const byId = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const id = row.product.category || NO_CATEGORY;
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  const order = (id: string) => {
    if (id === NO_CATEGORY) return Number.MAX_SAFE_INTEGER;
    const i = categories.findIndex((c) => c.id === id);
    return i === -1 ? categories.length : i;
  };
  return [...byId.entries()]
    .map(([id, list]) => {
      const known = categories.find((c) => c.id === id);
      const name = id === NO_CATEGORY ? 'Без категории' : known?.name || list[0].product.categoryLabel || id;
      return {
        id,
        name,
        icon: id === NO_CATEGORY ? (FolderOpen as React.FC<{ className?: string }>) : categoryIcon(known ?? { id }),
        models: groupModels(list),
        rows: list,
      };
    })
    .sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name, 'ru'));
}

/** Low / sold-out counters of a group; nothing when all is in order */
const StockFlags: React.FC<{ low: number; out: number }> = ({ low, out }) => (
  <>
    {low > 0 && (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-warning whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
        мало: {low}
      </span>
    )}
    {out > 0 && (
      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-danger whitespace-nowrap">
        <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
        нет: {out}
      </span>
    )}
  </>
);

/** Checkbox for a group: ticked, partly ticked («mixed») or empty */
const GroupCheck: React.FC<{ state: boolean | 'mixed'; onToggle: () => void; label: string }> = ({ state, onToggle, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={state}
    aria-label={label}
    onClick={onToggle}
    className="shrink-0 cursor-pointer"
  >
    <span
      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
        state ? 'neu-fill-accent text-white' : 'neu-inset'
      }`}
    >
      {state === true && <Check className="w-3.5 h-3.5" />}
      {state === 'mixed' && <span className="w-2.5 h-0.5 rounded-full bg-white" />}
    </span>
  </button>
);

interface InventoryGroupedListProps {
  rows: InventoryRow[];
  grouping: Exclude<InventoryGrouping, 'flat'>;
  categories: StoreCategory[];
  lowStockThreshold: number;
  /** Groups the admin opened or closed against the default (`cat:{id}`, `model:{productId}`) */
  toggled: Set<string>;
  onToggle: (id: string) => void;
  /** A search or a filter is on: models open to show what matched */
  expandMatches: boolean;
  selectedKeys: Set<string>;
  onSelect: (keys: string[], selected: boolean) => void;
  onLabels: (targets: LabelTarget[]) => void;
  /** One size of an article: its stock stepper and label button */
  renderVariant: (row: InventoryRow) => React.ReactNode;
}

/**
 * «Склад и SKU» grouped: category → model → article (colour, one barcode) → sizes.
 * Categories and models fold; a group's checkbox selects all its variations for labels.
 */
export const InventoryGroupedList: React.FC<InventoryGroupedListProps> = ({
  rows,
  grouping,
  categories,
  lowStockThreshold,
  toggled,
  onToggle,
  expandMatches,
  selectedKeys,
  onSelect,
  onLabels,
  renderVariant,
}) => {
  const tree = useMemo(
    () =>
      grouping === 'category'
        ? groupCategories(rows, categories)
        : [{ id: '__all', name: '', icon: FolderOpen as React.FC<{ className?: string }>, models: groupModels(rows), rows }],
    [rows, grouping, categories]
  );

  const keysOf = (list: InventoryRow[]) => list.map(({ product, sku }) => skuKey(product.id, sku.id));
  const checkState = (list: InventoryRow[]): boolean | 'mixed' => {
    const keys = keysOf(list);
    const n = keys.filter((k) => selectedKeys.has(k)).length;
    return n === 0 ? false : n === keys.length ? true : 'mixed';
  };
  const toggleGroup = (list: InventoryRow[]) => onSelect(keysOf(list), checkState(list) !== true);
  const targets = (list: InventoryRow[]) => list.map(({ product, sku }) => ({ productId: product.id, skuId: sku.id }));
  const summary = (list: InventoryRow[]) => summarize(list, lowStockThreshold);

  const renderModel = (model: ModelGroup) => {
    const id = `model:${model.product.id}`;
    // A model is closed until opened; a search or filter opens it to show the matching sizes
    const open = expandMatches !== toggled.has(id);
    const s = summary(model.rows);
    const panelId = `inv-${model.product.id}`;
    return (
      <li key={model.product.id} className="neu-inset rounded-2xl p-2.5 sm:p-3 space-y-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <GroupCheck
            state={checkState(model.rows)}
            onToggle={() => toggleGroup(model.rows)}
            label={`Выбрать для этикеток все варианты: ${model.product.title}`}
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onToggle(id)}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer rounded-xl"
          >
            <span className="w-10 h-12 rounded-xl overflow-hidden neu-flat-sm shrink-0">
              <img src={productImage(model.product)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block text-xs font-extrabold text-[#2D3A4E] truncate">{model.product.title}</span>
              <span className="block text-[11px] font-semibold text-[#4E5C70]">
                {model.articles.length} {pluralRu(model.articles.length, ['артикул', 'артикула', 'артикулов'])} ·{' '}
                {s.variants} {pluralRu(s.variants, ['вариант', 'варианта', 'вариантов'])} ·{' '}
                <span className="font-extrabold text-[#2D3A4E]">{s.units} шт.</span>
              </span>
              <span className="flex items-center gap-2 flex-wrap">
                <StockFlags low={s.low} out={s.out} />
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`w-4 h-4 text-[#4E5C70] shrink-0 transition-transform ${open ? 'rotate-180 text-accent' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => onLabels(targets(model.rows))}
            className="h-8 px-2.5 rounded-xl neu-button text-[11px] font-bold text-[#4E5C70] hover:text-accent flex items-center gap-1 cursor-pointer shrink-0"
            aria-label={`Этикетки: ${model.product.title}`}
            title="Этикетки всех вариантов модели"
          >
            <Printer className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Этикетки</span>
          </button>
        </div>

        {open && (
          <div id={panelId} className="space-y-2.5">
            {model.articles.map((article) => (
              <div key={article.key} className="neu-flat-sm rounded-xl p-2 sm:p-2.5 space-y-1.5">
                <div className="flex items-center gap-2 min-w-0 px-0.5">
                  <GroupCheck
                    state={checkState(article.rows)}
                    onToggle={() => toggleGroup(article.rows)}
                    label={`Выбрать для этикеток: ${model.product.title}, ${article.color}`}
                  />
                  <span className="text-[11px] font-extrabold text-[#2D3A4E] truncate">{article.color || 'Без цвета'}</span>
                  {article.article && (
                    <span className="text-[11px] font-mono font-bold text-[#4E5C70] truncate">{article.article}</span>
                  )}
                  <span className="ml-auto text-[11px] font-extrabold text-[#2D3A4E] whitespace-nowrap">
                    {summary(article.rows).units} шт.
                  </span>
                </div>
                <ul className="space-y-1.5" aria-label={`Размеры: ${model.product.title}, ${article.color}`}>
                  {article.rows.map((row) => (
                    <li key={skuKey(row.product.id, row.sku.id)}>{renderVariant(row)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </li>
    );
  };

  if (grouping === 'model') {
    return <ul className="space-y-2">{tree[0].models.map(renderModel)}</ul>;
  }

  return (
    <div className="space-y-3">
      {tree.map((cat) => {
        const id = `cat:${cat.id}`;
        const open = !toggled.has(id);
        const s = summary(cat.rows);
        const Icon = cat.icon;
        const panelId = `inv-cat-${cat.id}`;
        return (
          <section key={cat.id} className="neu-flat rounded-2xl p-2.5 sm:p-3 space-y-2.5" aria-label={`Категория «${cat.name}»`}>
            <div className="flex items-center gap-2.5">
              <GroupCheck
                state={checkState(cat.rows)}
                onToggle={() => toggleGroup(cat.rows)}
                label={`Выбрать для этикеток всю категорию «${cat.name}»`}
              />
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggle(id)}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer rounded-xl"
              >
                <span className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-[#2D3A4E] shrink-0">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-[#2D3A4E] truncate">{cat.name}</span>
                  <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] font-semibold text-[#4E5C70]">
                    <span>
                      {cat.models.length} {pluralRu(cat.models.length, ['модель', 'модели', 'моделей'])} · {s.variants}{' '}
                      {pluralRu(s.variants, ['вариант', 'варианта', 'вариантов'])} ·{' '}
                      <span className="font-extrabold text-[#2D3A4E]">{s.units} шт.</span>
                    </span>
                    <StockFlags low={s.low} out={s.out} />
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`w-4 h-4 text-[#4E5C70] shrink-0 transition-transform ${open ? 'rotate-180 text-accent' : ''}`}
                />
              </button>
            </div>
            {open && (
              <ul id={panelId} className="space-y-2">
                {cat.models.map(renderModel)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
