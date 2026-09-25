const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminInventoryTab.tsx', 'utf8');

const target = `                <div className="relative">
                  <select
                    value={opSelectedProductId}
                    onChange={(e) => {
                      setOpSelectedProductId(e.target.value);
                      setOpSelectedSkuIndex(0);
                    }}
                    className="w-full py-2 pl-3 pr-8 neu-inset rounded-xl font-bold text-xs text-[#2D3A4E] bg-transparent focus:outline-none appearance-none truncate"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#5C6B80]">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                  Вариация (Цвет / Размер / SKU)
                </label>
                <div className="relative">
                  <select
                    value={opSelectedSkuIndex}
                    onChange={(e) => setOpSelectedSkuIndex(Number(e.target.value))}
                    className="w-full py-2 pl-3 pr-8 neu-inset rounded-xl font-bold text-xs text-[#2D3A4E] bg-transparent focus:outline-none appearance-none truncate"
                  >
                    {selectedProductSkus.map((s, idx) => (
                      <option key={idx} value={idx}>
                        {s.color} / {s.size} ({s.skuCode}) — Остаток: {s.stock} шт.
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#5C6B80]">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>`;

const replacement = `                <NeumorphicSelect
                  value={opSelectedProductId}
                  onChange={(val) => {
                    setOpSelectedProductId(val);
                    setOpSelectedSkuIndex(0);
                  }}
                  options={products.map((p) => ({
                    value: p.id,
                    label: p.title,
                  }))}
                  variant="inset"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[11px] font-bold text-[#5C6B80] mb-1 truncate">
                  Вариация (Цвет / Размер / SKU)
                </label>
                <NeumorphicSelect
                  value={opSelectedSkuIndex.toString()}
                  onChange={(val) => setOpSelectedSkuIndex(Number(val))}
                  options={selectedProductSkus.map((s, idx) => ({
                    value: idx.toString(),
                    label: \`\${s.color} / \${s.size} (\${s.skuCode}) — Остаток: \${s.stock} шт.\`,
                  }))}
                  variant="inset"
                />`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/admin/AdminInventoryTab.tsx', code);
