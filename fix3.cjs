const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminSupportChatTab.tsx', 'utf8');

const startStr = '            <textarea\n              rows={2}';
const endStr = '      {/* Image Lightbox Modal for Zoom */}';

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

const replacement = `            <textarea
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Напишите ответ покупателю от имени оператора..."
              className="flex-1 px-3.5 py-2.5 neu-inset rounded-2xl text-xs leading-relaxed text-[#2D3A4E] placeholder:text-[#5C6B80]/70 font-medium focus:outline-none bg-[#E3E8EF] resize-none min-h-[48px] max-h-24"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!replyText.trim() && !selectedPhoto}
              className="h-12 px-4 sm:px-5 neu-button-accent rounded-2xl text-white font-black text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4 text-white shrink-0" />
              <span className="whitespace-nowrap">Ответить</span>
            </button>
          </div>
          <div className="text-[10px] text-[#5C6B80] pt-0.5">
            <span className="whitespace-nowrap">
              Нажмите <strong className="text-[#2D3A4E]">Enter</strong> для мгновенной отправки
            </span>
          </div>
        </form>

        {/* Quick sample photo attachments */}
        <div className="neu-flat rounded-2xl p-3 sm:p-4 bg-[#E3E8EF] border border-white/60 shadow-sm flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-extrabold text-[#5C6B80] uppercase tracking-wider mr-1">Быстрые фото:</span>
          {samplePhotos.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedPhoto(p.url)}
              className="neu-button px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-[#5C6B80] hover:text-[#5F6ED0] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('src/components/admin/AdminSupportChatTab.tsx', code);
