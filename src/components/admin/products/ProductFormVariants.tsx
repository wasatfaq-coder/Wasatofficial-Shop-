import { Plus, X, Boxes, Minus, RefreshCw, Palette, Ruler } from 'lucide-react';
import { ProductSKU } from '../../../types';
import { generateSkuCode, generateBarcode } from '../../../utils/inventory';
import { colorHexForName, normalizeColorName, readColorCode, splitColorEntry } from '../../../utils/colorCode';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductForm } from './useProductForm';

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '46', '48', '50', '52', '54'];

/** Colours, sizes and the stock of every colour × size, with their articles and barcodes */
export function ProductFormVariants({ form, onShowToast }: { form: ProductForm; onShowToast: AdminProductsTabProps['onShowToast'] }) {
  const {
    editingProduct,
    formCategory,
    formSizes,
    setFormSizes,
    formColors,
    setFormColors,
    formSkus,
    setFormSkus,
    setPendingRemoval,
    customSizeInput,
    setCustomSizeInput,
    customColorName,
    setCustomColorName,
    customColorHex,
    setCustomColorHex,
    customColorHexChosen,
    setCustomColorHexChosen,
    takenBarcodes,
    barcodeForColor,
  } = form;

  // Color management with SKU synchronization
  // A code inside the name («Хаки #556B2F» pasted from a supplier's table) wins over the code field
  const pendingColor = splitColorEntry(customColorName);
  const pendingColorHex = pendingColor.hex ?? readColorCode(customColorHex, { bare: true });
  const customColorHexUnreadable =
    !pendingColor.hex && customColorHex.trim() !== '' && !readColorCode(customColorHex, { bare: true });

  const handleCustomColorNameChange = (value: string) => {
    // a whole code pasted with the name goes to the code field («#55» while typing is not a code yet)
    const entry = splitColorEntry(value, 6);
    if (entry.hex) {
      setCustomColorName(entry.name);
      setCustomColorHex(entry.hex);
      setCustomColorHexChosen(true);
      return;
    }
    setCustomColorName(value);
    const byName = customColorHexChosen ? null : colorHexForName(value);
    if (byName) setCustomColorHex(byName);
  };

  const handleAddCustomColor = () => {
    const cleanName = pendingColor.name.trim();
    const hex = pendingColorHex;
    if (!cleanName || !hex) return;
    if (formColors.some((c) => normalizeColorName(c.name) === normalizeColorName(cleanName))) {
      onShowToast(`Цвет «${cleanName}» уже добавлен`, 'error');
      return;
    }
    const newColors = [...formColors, { name: cleanName, hex }];
    setFormColors(newColors);
    setCustomColorName('');
    setCustomColorHex(hex);
    setCustomColorHexChosen(false);

    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const colorBarcode = generateBarcode(takenBarcodes());
    const newSkus: ProductSKU[] = formSizes.map((size) => ({
      id: `${prodId}-${cleanName}-${size}`,
      color: cleanName,
      size,
      stock: 0,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, cleanName, size, 'WS'),
      barcode: colorBarcode,
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
  };

  const handleRemoveColor = (colorName: string) => {
    if (formColors.length <= 1) {
      onShowToast('У товара должен быть хотя бы один цвет', 'error');
      return;
    }
    const color = formColors.find((c) => c.name === colorName);
    const variants = formSkus.filter((s) => s.color === colorName);
    const stock = variants.reduce((sum, s) => sum + (s.stock || 0), 0);
    setPendingRemoval({
      title: 'Удалить цвет?',
      message: `Вместе с цветом удалятся его вариации (${variants.length}) и их остаток: ${stock} шт.`,
      preview: (
        <>
          <span
            className="w-8 h-8 rounded-full border border-black/15 shrink-0"
            style={{ backgroundColor: color?.hex || '#94A3B8' }}
          />
          <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">{colorName}</p>
        </>
      ),
      run: () => {
        setFormColors((prev) => prev.filter((c) => c.name !== colorName));
        setFormSkus((prev) => prev.filter((s) => s.color !== colorName));
      },
    });
  };

  // Size management with SKU synchronization
  const handleAddCustomSize = () => {
    const size = customSizeInput.trim().toUpperCase();
    if (!size) return;
    if (formSizes.includes(size)) {
      onShowToast(`Размер «${size}» уже в списке`, 'error');
      return;
    }
    const newSizes = [...formSizes, size];
    setFormSizes(newSizes);
    setCustomSizeInput('');

    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const taken = takenBarcodes();
    const newSkus: ProductSKU[] = formColors.map((c) => ({
      id: `${prodId}-${c.name}-${size}`,
      color: c.name,
      size,
      stock: 0,
      skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size, 'WS'),
      barcode: barcodeForColor(c.name, taken),
    }));

    setFormSkus((prev) => [...prev, ...newSkus]);
  };

  const handleTogglePresetSize = (size: string) => {
    if (formSizes.includes(size)) {
      handleRemoveSize(size);
    } else {
      const newSizes = [...formSizes, size];
      setFormSizes(newSizes);

      const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
      const taken = takenBarcodes();
      const newSkus: ProductSKU[] = formColors.map((c) => ({
        id: `${prodId}-${c.name}-${size}`,
        color: c.name,
        size,
        stock: 0,
        skuCode: generateSkuCode({ id: prodId, category: formCategory }, c.name, size, 'WS'),
        barcode: barcodeForColor(c.name, taken),
      }));

      setFormSkus((prev) => [...prev, ...newSkus]);
    }
  };

  const handleRemoveSize = (sizeToRemove: string) => {
    if (formSizes.length <= 1) {
      onShowToast('У товара должен быть хотя бы один размер', 'error');
      return;
    }
    const variants = formSkus.filter((s) => s.size === sizeToRemove);
    const stock = variants.reduce((sum, s) => sum + (s.stock || 0), 0);
    setPendingRemoval({
      title: 'Удалить размер?',
      message: `Вместе с размером удалятся его вариации (${variants.length}) и их остаток: ${stock} шт.`,
      preview: (
        <>
          <span className="h-8 min-w-8 px-2 rounded-xl neu-flat flex items-center justify-center text-xs font-extrabold text-accent shrink-0">
            {sizeToRemove}
          </span>
          <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">Размер {sizeToRemove}</p>
        </>
      ),
      run: () => {
        setFormSizes((prev) => prev.filter((s) => s !== sizeToRemove));
        setFormSkus((prev) => prev.filter((s) => s.size !== sizeToRemove));
      },
    });
  };

  const handleResetAllSkuStock = () => {
    setPendingRemoval({
      title: 'Обнулить остатки?',
      message: `Остаток всех вариаций (${formSkus.length}) станет 0 шт. Сейчас на складе: ${formSkus.reduce(
        (sum, s) => sum + (s.stock || 0),
        0
      )} шт.`,
      confirmLabel: 'Обнулить',
      run: () => {
        setFormSkus((prev) => prev.map((s) => ({ ...s, stock: 0 })));
        onShowToast('Остатки всех вариаций SKU обнулены', 'info');
      },
    });
  };

  const handleRegenerateMissingCodes = () => {
    const prodId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;
    const taken = takenBarcodes();
    setFormSkus((prev) => {
      const next: ProductSKU[] = [];
      for (const s of prev) {
        next.push({
          ...s,
          skuCode: s.skuCode || generateSkuCode({ id: prodId, category: formCategory }, s.color, s.size, 'WS'),
          barcode: s.barcode?.trim() ? s.barcode : barcodeForColor(s.color, taken, [...prev, ...next]),
        });
      }
      return next;
    });
    onShowToast('Артикулы и штрихкоды SKU синхронизированы', 'success');
  };

  return (
    <>
      {/* Right Column: Colors, Sizes, SKU Matrix */}
      <div className="space-y-3.5">
        {/* Colors Section - Unified Inset Container */}
        <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
            <label className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
              <Palette className="w-3.5 h-3.5 text-accent" />
              <span>Цвета товара ({formColors.length})</span>
            </label>
            <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 цвет</span>
          </div>

          {/* Active Colors Chips */}
          <div className="flex flex-wrap gap-1.5">
            {formColors.map((c) => (
              <div
                key={c.name}
                className="neu-flat-sm px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-bold text-[#2D3A4E] border border-white/60"
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/15 shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <span>{c.name}</span>
                {formColors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(c.name)}
                    className="-my-1 -mr-1.5 ml-0.5 w-6 h-6 inline-flex items-center justify-center rounded-lg text-[#4E5C70] hover:text-danger cursor-pointer"
                    title={`Удалить цвет «${c.name}»`}
                    aria-label={`Удалить цвет «${c.name}»`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add Custom Color */}
          <div className="flex flex-col gap-2.5">
            <div data-enter-adds className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_auto] gap-2">
              <input
                type="text"
                value={customColorName}
                onChange={(e) => handleCustomColorNameChange(e.target.value)}
                placeholder="Новый цвет, напр. Хаки"
                aria-label="Название нового цвета"
                className="col-span-2 sm:col-span-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
              />
              <div className="relative min-w-0">
                <input
                  type="text"
                  value={customColorHex}
                  onChange={(e) => {
                    setCustomColorHex(e.target.value);
                    setCustomColorHexChosen(true);
                  }}
                  // the field shows the code it read: « 1e2b37 », «rgb(30, 43, 55)» → «#1E2B37»
                  onBlur={() => {
                    const code = readColorCode(customColorHex, { bare: true });
                    if (code) setCustomColorHex(code);
                  }}
                  placeholder="#HEX"
                  maxLength={40}
                  className="w-full h-9 pl-8 pr-2 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase font-mono"
                  aria-label="Код цвета: HEX или rgb"
                  aria-invalid={customColorHexUnreadable || undefined}
                  aria-describedby={customColorHexUnreadable ? 'product-color-code-error' : undefined}
                />
                <div
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-black/15 shadow-inner"
                  style={{ backgroundColor: pendingColorHex ?? 'transparent' }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomColor}
                disabled={!pendingColor.name.trim() || !pendingColorHex}
                className="h-9 px-3 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
              >
                + Цвет
              </button>
            </div>
            {customColorHexUnreadable && (
              <p id="product-color-code-error" className="text-xs font-semibold text-danger">
                Код цвета не читается. Подойдёт HEX (#1E2B37 или 1E2B37) или rgb(30, 43, 55) — либо выберите
                оттенок ниже.
              </p>
            )}

            {/* Swatch Palette */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {[
                '#FFFFFF',
                '#F3F4F6',
                '#D1D5DB',
                '#9CA3AF',
                '#4B5563',
                '#1F2937',
                '#000000',
                '#EF4444',
                '#F97316',
                '#F59E0B',
                '#10B981',
                '#3B82F6',
                '#6366F1',
                '#8B5CF6',
                '#EC4899',
              ].map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => {
                    setCustomColorHex(hex);
                    setCustomColorHexChosen(true);
                  }}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center p-1 transition-all cursor-pointer ${
                    pendingColorHex === hex ? 'neu-pill-active' : 'neu-button'
                  }`}
                  title={hex}
                  aria-label={`Цвет ${hex}`}
                  aria-pressed={pendingColorHex === hex}
                >
                  <span
                    className="w-full h-full rounded-md border border-black/10"
                    style={{ backgroundColor: hex }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sizes Section - Unified Inset Container */}
        <div className="neu-inset rounded-2xl p-3.5 border border-white/60 space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[#BAC5D5]/30">
            <label className="text-[11px] font-extrabold text-[#2D3A4E] flex items-center gap-1.5 uppercase tracking-wider">
              <Ruler className="w-3.5 h-3.5 text-accent" />
              <span>Размеры товара ({formSizes.length})</span>
            </label>
            <span className="text-[11px] font-semibold text-[#4E5C70]">Мин. 1 размер</span>
          </div>

          {/* Active Sizes */}
          <div className="flex flex-wrap gap-1.5">
            {formSizes.map((s) => (
              <div
                key={s}
                className="neu-flat-sm px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-xs font-extrabold text-accent border border-white/60"
              >
                <span>{s}</span>
                {formSizes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSize(s)}
                    className="-my-1 -mr-1.5 ml-0.5 w-6 h-6 inline-flex items-center justify-center rounded-lg text-[#4E5C70] hover:text-danger cursor-pointer"
                    title={`Удалить размер ${s}`}
                    aria-label={`Удалить размер ${s}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Preset Sizes Bar */}
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <span className="text-[11px] text-[#4E5C70] font-semibold mr-0.5">Сетка:</span>
            {PRESET_SIZES.map((sz) => {
              const isSelected = formSizes.includes(sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleTogglePresetSize(sz)}
                  aria-pressed={isSelected}
                  className={`h-6 min-w-6 px-2 rounded-lg text-[11px] font-extrabold transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'neu-pill-active'
                      : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>

          {/* Add Custom Size */}
          <div data-enter-adds className="flex items-center gap-2 pt-0.5">
            <input
              type="text"
              aria-label="Свой размер"
              value={customSizeInput}
              onChange={(e) => setCustomSizeInput(e.target.value)}
              placeholder="Свой размер, напр. 56"
              className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] uppercase placeholder:normal-case placeholder:text-[#56647A]"
            />
            <button
              type="button"
              onClick={handleAddCustomSize}
              disabled={!customSizeInput.trim()}
              className="h-9 px-3 neu-button rounded-xl text-xs font-extrabold text-accent cursor-pointer shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              + Размер
            </button>
          </div>
        </div>

        {/* SKU Stock Matrix */}
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-x-2 gap-y-1.5">
            <label className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-accent" />
              <span>Остатки SKU ({formSkus.length})</span>
            </label>

            {/* Bulk Adjustments */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleResetAllSkuStock}
                className="h-7 px-2.5 rounded-lg neu-button text-[11px] font-bold text-danger transition-all cursor-pointer whitespace-nowrap"
                title="Обнулить остатки всех вариаций"
              >
                Обнулить
              </button>
              <button
                type="button"
                onClick={handleRegenerateMissingCodes}
                className="h-7 px-2.5 rounded-lg neu-button text-[11px] font-bold text-[#4E5C70] hover:text-accent transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap"
                title="Заполнить пропущенные артикулы и штрихкоды"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Коды</span>
              </button>
            </div>
          </div>

          <div className="neu-inset rounded-2xl p-2 max-h-72 overflow-y-auto space-y-2 text-xs">
            {formSkus.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#4E5C70]">
                Нет вариаций SKU. Добавьте цвет и размер.
              </div>
            ) : (
              formSkus.map((sku, sIdx) => {
                const matchingColor = formColors.find((c) => c.name === sku.color);
                return (
                  <div
                    key={`form-sku-${sku.color}-${sku.size}-${sku.id || sIdx}-${sIdx}`}
                    className="flex flex-wrap items-center justify-between py-2 px-2.5 neu-flat rounded-xl gap-x-2 gap-y-2 border border-white/40"
                  >
                    <div className="min-w-0 flex-1 basis-full sm:basis-0 flex items-start gap-2">
                      <span
                        className="w-3 h-3 mt-0.5 rounded-full border border-black/15 shrink-0"
                        style={{ backgroundColor: matchingColor?.hex || '#94A3B8' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-extrabold text-[#2D3A4E] text-xs truncate">
                            {sku.color}
                          </span>
                          <span className="font-extrabold text-accent text-xs whitespace-nowrap shrink-0">
                            {sku.size}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#4E5C70] font-mono">
                          <span className="whitespace-nowrap">{sku.skuCode}</span>
                          {sku.barcode && <span className="whitespace-nowrap">{sku.barcode}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Stepper controls */}
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setFormSkus((prev) =>
                            prev.map((it, idx) =>
                              idx === sIdx ? { ...it, stock: Math.max(0, (it.stock || 0) - 1) } : it
                            )
                          );
                        }}
                        className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] transition-all cursor-pointer font-bold text-xs"
                        aria-label="Уменьшить остаток"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={sku.stock}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setFormSkus((prev) =>
                            prev.map((it, idx) => (idx === sIdx ? { ...it, stock: val } : it))
                          );
                        }}
                        className="w-12 h-7 text-center neu-inset rounded-lg font-extrabold text-xs text-accent"
                        aria-label={`Остаток ${sku.color}, ${sku.size}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFormSkus((prev) =>
                            prev.map((it, idx) =>
                              idx === sIdx ? { ...it, stock: (it.stock || 0) + 1 } : it
                            )
                          );
                        }}
                        className="w-7 h-7 rounded-lg neu-button flex items-center justify-center text-accent hover:text-accent-strong transition-all cursor-pointer font-bold text-xs"
                        aria-label="Увеличить остаток"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-[11px] font-bold text-[#4E5C70] ml-0.5">шт.</span>

                      {/* Stock status dot */}
                      <span
                        className={`w-2 h-2 rounded-full ml-1 shrink-0 ${
                          sku.stock === 0
                            ? 'bg-danger'
                            : sku.stock < 3
                            ? 'bg-warning'
                            : 'bg-success'
                        }`}
                        title={
                          sku.stock === 0
                            ? 'Нет в наличии'
                            : sku.stock < 3
                            ? 'Мало на складе'
                            : 'В наличии'
                        }
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
