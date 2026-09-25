const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminProductsTab.tsx', 'utf8');

const target = `                      <div className="relative">
                        <select
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          className="w-full pl-3 pr-8 py-2.5 neu-inset rounded-xl text-xs font-bold text-[#2D3A4E] focus:outline-none bg-transparent appearance-none truncate"
                        >
                          {CATEGORY_OPTIONS.filter((c) => c.id !== 'all').map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#5C6B80]">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>`;

const replacement = `                      <NeumorphicSelect
                        value={formCategory}
                        onChange={(val) => setFormCategory(val)}
                        options={CATEGORY_OPTIONS.filter((c) => c.id !== 'all').map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                        variant="inset"
                      />`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/admin/AdminProductsTab.tsx', code);
