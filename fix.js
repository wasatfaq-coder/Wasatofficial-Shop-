const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminSupportChatTab.tsx', 'utf8');

const brokenPart = `className="relative group rounded-xl overflow-hidden block border border-white/40        {/* Quick Answer Category Selector & Fast Injection Buttons */}`;

const fix = `className="relative group rounded-xl overflow-hidden block border border-white/40 shadow-sm cursor-pointer"
                        >
                          <img
                            src={msg.imageUrl}
                            alt="Прикрепленное фото"
                            className="max-h-48 w-auto rounded-xl object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[10px] font-bold">
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Увеличить фото</span>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick Answer Category Selector & Fast Injection Buttons */}`;

code = code.replace(brokenPart, fix);

// there is also some duplicated form code at the bottom.
fs.writeFileSync('src/components/admin/AdminSupportChatTab.tsx', code);
