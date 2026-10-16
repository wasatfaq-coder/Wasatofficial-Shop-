import React, { useState } from 'react';
import { Check, Grid, Minus, Plus, RotateCcw, ShoppingBag } from 'lucide-react';
import type { CartItem, Product } from '../types';
import {
  sizePackCompositionText,
  sizePackPieces,
  sizePackPrice,
  sizePackTitle,
  type SizePack,
} from '../shared/sizePacks';
import type { WholesaleOffer } from '../utils/wholesaleOffer';
import {
  matrixCellKey,
  maxSizePacksForCell,
  maxWholesalePacksForCell,
  summarizePackMatrix,
  summarizeWholesaleMatrix,
} from '../utils/wholesaleMatrix';

interface WholesaleMatrixPickerProps {
  product: Product;
  mode: 'wholesale' | 'pack';
  offer: WholesaleOffer;
  sizePacks: SizePack[];
  cartItems: CartItem[];
  preorderMode?: boolean;
  onAddWholesaleLine: (product: Product, color: string, size: string, quantity: number, wholesale?: boolean) => boolean | void;
  onAddPackLine?: (product: Product, packId: string, color: string, packs: number) => boolean;
}

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export const WholesaleMatrixPicker: React.FC<WholesaleMatrixPickerProps> = ({
  product,
  mode,
  offer,
  sizePacks,
  cartItems,
  preorderMode = false,
  onAddWholesaleLine,
  onAddPackLine,
}) => {
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [addedFeedback, setAddedFeedback] = useState(false);

  const setCell = (color: string, second: string, value: number, max: number) => {
    const key = matrixCellKey(color, second);
    const clamped = Math.max(0, Math.min(Math.floor(value), max));
    setDraft((prev) => {
      if (clamped === 0) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: clamped };
    });
  };

  const addRowOnePack = (color: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (mode === 'wholesale') {
        for (const sz of product.sizes ?? []) {
          const max = maxWholesalePacksForCell(product, color, sz, cartItems, preorderMode);
          if (max <= 0) continue;
          const key = matrixCellKey(color, sz);
          const cur = Math.floor(Number(next[key]) || 0);
          if (cur < max) next[key] = cur + 1;
        }
      } else {
        for (const pack of sizePacks) {
          const max = maxSizePacksForCell(product, pack, color, sizePacks, cartItems, next);
          if (max <= 0) continue;
          const key = matrixCellKey(color, pack.id);
          const cur = Math.floor(Number(next[key]) || 0);
          if (cur < max) next[key] = cur + 1;
        }
      }
      return next;
    });
  };

  const clearDraft = () => setDraft({});

  const wholesaleSummary =
    mode === 'wholesale' ? summarizeWholesaleMatrix(product, offer, cartItems, draft, preorderMode) : null;
  const packSummary = mode === 'pack' ? summarizePackMatrix(product, sizePacks, cartItems, draft) : null;

  const selectedPacks = mode === 'wholesale' ? wholesaleSummary!.selectedPacks : packSummary!.selectedPacks;
  const selectedPieces = mode === 'wholesale' ? wholesaleSummary!.selectedPieces : packSummary!.selectedPieces;
  const totalPrice = mode === 'wholesale' ? wholesaleSummary!.totalPrice : packSummary!.totalPrice;

  const handleCommitMatrix = () => {
    if (selectedPacks <= 0) return;
    let anyAdded = false;
    if (mode === 'wholesale' && wholesaleSummary) {
      for (const line of wholesaleSummary.lines) {
        if (onAddWholesaleLine(product, line.color, line.size, line.quantity, true) !== false) {
          anyAdded = true;
        }
      }
    } else if (mode === 'pack' && packSummary && onAddPackLine) {
      for (const line of packSummary.lines) {
        if (onAddPackLine(product, line.pack.id, line.color, line.packs) !== false) {
          anyAdded = true;
        }
      }
    }
    if (anyAdded) {
      setDraft({});
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 1200);
    }
  };

  const unitLabel = mode === 'pack' || offer.packSize > 1 ? 'уп.' : 'шт.';

  return (
    <div className="neu-flat-sm rounded-2xl p-3.5 space-y-3" data-testid="wholesale-matrix-picker">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-text-primary">
          <Grid className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          <span>
            {mode === 'wholesale'
              ? `Таблица-шахматка (${offer.packSize > 1 ? `упаковками по ${offer.packSize} шт.` : 'штуками'})`
              : 'Таблица-шахматка ростовок по цветам'}
          </span>
        </div>
        {selectedPacks > 0 && (
          <button
            type="button"
            onClick={clearDraft}
            className="min-h-8 px-2.5 py-1 rounded-xl neu-button inline-flex items-center gap-1 text-[11px] font-bold text-text-secondary hover:text-danger cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Сбросить выбор</span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-text-secondary leading-snug">
        {mode === 'wholesale'
          ? 'Укажите количество сразу по нескольким цветам и размерам и добавьте весь набор в корзину одним нажатием.'
          : 'Выберите количество ростовок сразу по нескольким цветам и добавьте их в корзину одним нажатием.'}
      </p>

      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        {mode === 'wholesale' ? (
          <table className="w-full border-collapse text-xs min-w-[320px]" aria-label="Шахматка цветов и размеров оптом">
            <thead>
              <tr className="neu-divider-b text-text-secondary">
                <th className="py-1.5 pr-2 text-left font-bold">Цвет</th>
                {(product.sizes ?? []).map((sz) => (
                  <th key={sz} className="py-1.5 px-1.5 text-center font-extrabold text-text-primary whitespace-nowrap">
                    {sz}
                  </th>
                ))}
                <th className="py-1.5 pl-1.5 text-right font-bold whitespace-nowrap">Ряд</th>
              </tr>
            </thead>
            <tbody>
              {(product.colors ?? []).map((c) => {
                const rowHasAvailable = (product.sizes ?? []).some(
                  (sz) => maxWholesalePacksForCell(product, c.name, sz, cartItems, preorderMode) > 0
                );
                return (
                  <tr key={c.name} className="neu-divider-b last:neu-divider-b-0">
                    <td className="py-2 pr-2 font-bold text-text-primary whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/15"
                          style={{ backgroundColor: c.hex }}
                          aria-hidden="true"
                        />
                        <span className="truncate max-w-[110px]" title={c.name}>
                          {c.name}
                        </span>
                      </div>
                    </td>
                    {(product.sizes ?? []).map((sz) => {
                      const max = maxWholesalePacksForCell(product, c.name, sz, cartItems, preorderMode);
                      const key = matrixCellKey(c.name, sz);
                      const val = Math.min(Math.floor(Number(draft[key]) || 0), max);
                      if (max <= 0) {
                        return (
                          <td key={sz} className="py-2 px-1 text-center text-[11px] text-text-secondary">
                            нет
                          </td>
                        );
                      }
                      return (
                        <td key={sz} className="py-1.5 px-1 text-center align-middle">
                          {val === 0 ? (
                            <button
                              type="button"
                              onClick={() => setCell(c.name, sz, 1, max)}
                              aria-label={`Добавить ${c.name}, размер ${sz}`}
                              className="min-w-[54px] h-9 px-2 rounded-xl neu-button text-xs font-bold text-text-primary hover:text-accent inline-flex flex-col items-center justify-center leading-tight cursor-pointer"
                            >
                              <span>+</span>
                              <span className="text-[11px] font-medium text-text-secondary tabular-nums">до {max}</span>
                            </button>
                          ) : (
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <div className="inline-flex items-center neu-inset rounded-xl p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setCell(c.name, sz, val - 1, max)}
                                  aria-label={`Уменьшить ${c.name}, размер ${sz}`}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-primary hover:text-accent cursor-pointer"
                                >
                                  <Minus className="w-3 h-3 stroke-[2.5]" />
                                </button>
                                <span className="min-w-[22px] text-center text-xs font-extrabold text-accent tabular-nums">
                                  {val}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCell(c.name, sz, val + 1, max)}
                                  disabled={val >= max}
                                  aria-label={`Увеличить ${c.name}, размер ${sz}`}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                    val >= max
                                      ? 'text-text-secondary cursor-not-allowed'
                                      : 'text-text-primary hover:text-accent cursor-pointer'
                                  }`}
                                >
                                  <Plus className="w-3 h-3 stroke-[2.5]" />
                                </button>
                              </div>
                              <span className="text-[11px] text-text-secondary tabular-nums">из {max}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1.5 pl-1.5 text-right">
                      {rowHasAvailable && (
                        <button
                          type="button"
                          onClick={() => addRowOnePack(c.name)}
                          title={`Добавить по 1 ${unitLabel} каждого доступного размера цвета ${c.name}`}
                          className="min-h-8 h-8 px-2.5 rounded-xl neu-button text-[11px] font-bold text-accent whitespace-nowrap cursor-pointer"
                        >
                          +1 ряд
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-xs min-w-[300px]" aria-label="Шахматка ростовок по цветам">
            <thead>
              <tr className="neu-divider-b text-text-secondary">
                <th className="py-1.5 pr-2 text-left font-bold">Цвет</th>
                {sizePacks.map((pack) => {
                  const price = sizePackPrice(product, pack);
                  return (
                    <th key={pack.id} className="py-1.5 px-2 text-center font-bold text-text-primary">
                      <div className="font-extrabold">{sizePackTitle(pack)}</div>
                      <div className="text-[11px] font-medium text-text-secondary">{sizePackCompositionText(pack)}</div>
                      {price !== undefined && (
                        <div className="text-[11px] font-extrabold text-accent tabular-nums">
                          {rub(price)}/уп. ({sizePackPieces(pack)} шт.)
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(product.colors ?? []).map((c) => (
                <tr key={c.name} className="neu-divider-b last:neu-divider-b-0">
                  <td className="py-2 pr-2 font-bold text-text-primary whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/15"
                        style={{ backgroundColor: c.hex }}
                        aria-hidden="true"
                      />
                      <span className="truncate max-w-[110px]" title={c.name}>
                        {c.name}
                      </span>
                    </div>
                  </td>
                  {sizePacks.map((pack) => {
                    const max = maxSizePacksForCell(product, pack, c.name, sizePacks, cartItems, draft);
                    const key = matrixCellKey(c.name, pack.id);
                    const val = Math.min(Math.floor(Number(draft[key]) || 0), max);
                    if (max <= 0 && val === 0) {
                      return (
                        <td key={pack.id} className="py-2 px-2 text-center text-[11px] text-text-secondary">
                          нет
                        </td>
                      );
                    }
                    return (
                      <td key={pack.id} className="py-1.5 px-2 text-center align-middle">
                        {val === 0 ? (
                          <button
                            type="button"
                            onClick={() => setCell(c.name, pack.id, 1, max)}
                            aria-label={`Добавить ${sizePackTitle(pack)}, цвет ${c.name}`}
                            className="min-w-[64px] h-9 px-2.5 rounded-xl neu-button text-xs font-bold text-text-primary hover:text-accent inline-flex flex-col items-center justify-center leading-tight cursor-pointer"
                          >
                            <span>+ 1 уп.</span>
                            <span className="text-[11px] font-medium text-text-secondary tabular-nums">макс. {max}</span>
                          </button>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <div className="inline-flex items-center neu-inset rounded-xl p-0.5">
                              <button
                                type="button"
                                onClick={() => setCell(c.name, pack.id, val - 1, max)}
                                aria-label={`Уменьшить ${sizePackTitle(pack)}, цвет ${c.name}`}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-primary hover:text-accent cursor-pointer"
                              >
                                <Minus className="w-3 h-3 stroke-[2.5]" />
                              </button>
                              <span className="min-w-[26px] text-center text-xs font-extrabold text-accent tabular-nums">
                                {val} уп.
                              </span>
                              <button
                                type="button"
                                onClick={() => setCell(c.name, pack.id, val + 1, max)}
                                disabled={val >= max}
                                aria-label={`Увеличить ${sizePackTitle(pack)}, цвет ${c.name}`}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  val >= max
                                    ? 'text-text-secondary cursor-not-allowed'
                                    : 'text-text-primary hover:text-accent cursor-pointer'
                                }`}
                              >
                                <Plus className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            </div>
                            <span className="text-[11px] text-text-secondary tabular-nums">макс. {max} уп.</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Live summary and batch Add to Cart */}
      <div className="pt-2 neu-divider-t space-y-2">
        {selectedPacks > 0 ? (
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs tabular-nums">
            <span className="text-text-secondary">
              Выбрано:{' '}
              <strong className="text-text-primary">
                {selectedPacks} {unitLabel}
              </strong>
              {(mode === 'pack' || offer.packSize > 1) && ` (${selectedPieces} шт.)`}
              {mode === 'wholesale' && wholesaleSummary?.appliedStep && (
                <span className="text-accent font-bold">
                  {' '}
                  · ступень {wholesaleSummary.appliedStep.discount} ({rub(wholesaleSummary.effectiveUnitPrice)}/шт.)
                </span>
              )}
            </span>
            <span className="font-extrabold text-text-primary text-sm">{rub(totalPrice)}</span>
          </div>
        ) : (
          <p className="text-[11px] text-text-secondary">
            Нажмите «+» в нужных ячейках таблицы, чтобы собрать партию из нескольких цветов и размеров.
          </p>
        )}

        {mode === 'wholesale' && wholesaleSummary && wholesaleSummary.minPacksRemaining > 0 && (
          <p className="text-[11px] font-bold text-text-secondary tabular-nums">
            Минимальная партия этой модели — {offer.minPacks} {unitLabel} (осталось выбрать ещё {wholesaleSummary.minPacksRemaining}{' '}
            {unitLabel}).
          </p>
        )}

        <button
          type="button"
          onClick={handleCommitMatrix}
          disabled={selectedPacks === 0 || addedFeedback}
          className={`w-full py-2.5 px-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
            addedFeedback
              ? 'neu-button-success text-white cursor-default'
              : selectedPacks === 0
              ? 'neu-button-disabled'
              : 'neu-button text-accent hover:text-text-primary cursor-pointer'
          }`}
        >
          {addedFeedback ? (
            <>
              <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
              <span>Набор добавлен в корзину!</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              <span className="tabular-nums">
                {selectedPacks > 0
                  ? `Добавить набор в корзину (${selectedPacks} ${unitLabel} · ${rub(totalPrice)})`
                  : 'Выберите позиции в таблице'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
