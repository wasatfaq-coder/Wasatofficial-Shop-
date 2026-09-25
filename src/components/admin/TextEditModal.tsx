import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  Tag,
  X,
  Check,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import {
  QuickPhrasesData,
  subscribeToQuickPhrases,
  addQuickPhrase,
  deleteQuickPhrase,
} from '../../utils/phrasesSync';

interface TextEditModalProps {
  isOpen: boolean;
  type: 'material' | 'description';
  category?: string;
  title: string;
  subtitle: string;
  initialValue: string;
  onClose: () => void;
  onSave: (newValue: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const CATEGORY_TABS = [
  { id: 'global', label: 'Общие (Все)', icon: Sparkles },
  { id: 'linen', label: 'Лён', icon: Layers },
  { id: 'shirts', label: 'Рубашки', icon: Layers },
  { id: 'tshirts', label: 'Футболки', icon: Layers },
  { id: 'jackets', label: 'Куртки', icon: Layers },
  { id: 'trousers', label: 'Брюки', icon: Layers },
  { id: 'sweatshirts', label: 'Свитшоты', icon: Layers },
  { id: 'suits', label: 'Костюмы', icon: Layers },
  { id: 'accessories', label: 'Аксессуары', icon: Layers },
];

export const TextEditModal: React.FC<TextEditModalProps> = ({
  isOpen,
  type,
  category = 'global',
  title,
  subtitle,
  initialValue,
  onClose,
  onSave,
  onShowToast,
}) => {
  const [draft, setDraft] = useState('');
  const [phrasesData, setPhrasesData] = useState<QuickPhrasesData | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('global');
  const [newPhraseInput, setNewPhraseInput] = useState('');
  const [isAddingPhrase, setIsAddingPhrase] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const newPhraseInputRef = useRef<HTMLInputElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCategoryDropdownOpen]);

  // Subscribe to real-time synchronized quick phrases from Firestore
  useEffect(() => {
    const unsub = subscribeToQuickPhrases((data) => {
      setPhrasesData(data);
    });
    return () => unsub();
  }, []);

  // Update initial value and preferred category tab on modal open
  useEffect(() => {
    if (isOpen) {
      setDraft(initialValue);
      setIsAddingPhrase(false);
      setNewPhraseInput('');

      // Auto-set category tab matching the product category if present
      if (category && category !== 'all') {
        const found = CATEGORY_TABS.find((t) => t.id === category);
        if (found) {
          setActiveCategoryTab(category);
        } else {
          setActiveCategoryTab('global');
        }
      } else {
        setActiveCategoryTab('global');
      }

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isOpen, initialValue, category]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Current active phrases list based on mode (material vs description & category)
  const currentPhrases = useMemo(() => {
    if (!phrasesData) return [];

    if (type === 'material') {
      return phrasesData.materials || [];
    }

    if (activeCategoryTab === 'global') {
      return phrasesData.global || [];
    }

    return phrasesData.byCategory[activeCategoryTab] || [];
  }, [phrasesData, type, activeCategoryTab]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: string) => {
    if (type === 'material') {
      setDraft(preset);
      if (onShowToast) onShowToast('Состав ткани применен', 'info');
    } else {
      setDraft((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return preset;
        // Avoid duplicating exact same line
        if (trimmed.includes(preset)) return trimmed;
        return `${trimmed}\n${preset}`;
      });
      if (onShowToast) onShowToast('Фраза добавлена в описание', 'info');
    }
  };

  const handleAddNewPhrase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPhraseInput.trim();
    if (!trimmed) return;

    try {
      const target = type === 'material' ? 'material' : activeCategoryTab;
      await addQuickPhrase(target, trimmed);
      setNewPhraseInput('');
      setIsAddingPhrase(false);
      if (onShowToast) {
        onShowToast(
          type === 'material'
            ? 'Новый пресет состава ткани успешно сохранен'
            : 'Новая быстрая фраза синхронизирована для всех товаров',
          'success'
        );
      }
    } catch (err) {
      console.error(err);
      if (onShowToast) onShowToast('Ошибка сохранения фразы', 'error');
    }
  };

  const handleDeletePhrase = async (phraseToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const target = type === 'material' ? 'material' : activeCategoryTab;
      await deleteQuickPhrase(target, phraseToDelete);
      if (onShowToast) {
        onShowToast('Фраза удалена из базы быстрых фраз', 'info');
      }
    } catch (err) {
      console.error(err);
      if (onShowToast) onShowToast('Ошибка удаления фразы', 'error');
    }
  };

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl neu-flat rounded-3xl bg-[#E3E8EF] p-5 sm:p-6 border border-white/80 space-y-4.5 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-[#5F6ED0] shrink-0">
              {type === 'material' ? <Tag className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-[#2D3A4E] tracking-tight">{title}</h3>
                <span className="text-[10px] font-black text-[#5F6ED0] bg-[#5F6ED0]/10 px-2 py-0.5 rounded-md neu-flat-sm">
                  {type === 'material' ? 'Состав полотна' : 'Каталог акцентов'}
                </span>
              </div>
              <p className="text-[11px] font-bold text-[#5C6B80] truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
            title="Закрыть окно (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Middle Section: Category Filter + Inset Quick Phrases Box */}
        <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
          {/* Category Dropdown for Descriptions in Neomorphic Style */}
          {type === 'description' && (
            <div className="space-y-1.5" ref={categoryDropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-[#5C6B80] uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-[#5F6ED0]" />
                  <span>Категория одежды:</span>
                </label>
                <span className="text-[10px] font-bold text-[#5F6ED0]">
                  Синхронизировано со всеми карточками
                </span>
              </div>

              {/* Neomorphic Dropdown Button */}
              {(() => {
                const selectedTab =
                  CATEGORY_TABS.find((t) => t.id === activeCategoryTab) || CATEGORY_TABS[0];
                const selectedCount =
                  selectedTab.id === 'global'
                    ? phrasesData?.global.length || 0
                    : phrasesData?.byCategory[selectedTab.id]?.length || 0;
                const SelectedIcon = selectedTab.icon;

                return (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                      className="w-full px-3.5 py-2.5 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-between text-left transition-all cursor-pointer border border-white/50 hover:border-white/80 active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-xl neu-button bg-[#E3E8EF] flex items-center justify-center text-[#5F6ED0] shrink-0">
                          <SelectedIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-xs font-black text-[#2D3A4E] truncate">
                            {selectedTab.label}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-lg font-black bg-[#5F6ED0]/15 text-[#5F6ED0]">
                            {selectedCount}{' '}
                            {selectedCount === 1
                              ? 'акцент'
                              : selectedCount >= 2 && selectedCount <= 4
                              ? 'акцента'
                              : 'акцентов'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#5C6B80] pl-2 shrink-0">
                        <span className="text-[10px] font-bold text-[#5F6ED0]">Выбрать</span>
                        <ChevronDown
                          className={`w-4 h-4 text-[#5F6ED0] transition-transform duration-200 ${
                            isCategoryDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Dropdown Menu Popup */}
                    {isCategoryDropdownOpen && (
                      <div className="absolute top-full mt-1.5 left-0 right-0 z-40 neu-flat rounded-2xl bg-[#E3E8EF] border border-white/80 p-1.5 shadow-2xl space-y-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                        {CATEGORY_TABS.map((tab) => {
                          const isSelected = activeCategoryTab === tab.id;
                          const count =
                            tab.id === 'global'
                              ? phrasesData?.global.length || 0
                              : phrasesData?.byCategory[tab.id]?.length || 0;
                          const TabIcon = tab.icon;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setActiveCategoryTab(tab.id);
                                setIsCategoryDropdownOpen(false);
                                setIsAddingPhrase(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'neu-button-accent text-white shadow-md'
                                  : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <TabIcon
                                  className={`w-3.5 h-3.5 ${
                                    isSelected ? 'text-white' : 'text-[#5F6ED0]'
                                  }`}
                                />
                                <span className="truncate">{tab.label}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                                    isSelected
                                      ? 'bg-white/25 text-white'
                                      : 'neu-inset bg-[#E3E8EF] text-[#5C6B80]'
                                  }`}
                                >
                                  {count}
                                </span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Recessed Inset Container for Quick Phrases & Accents */}
          <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] border border-white/60 space-y-2.5">
            {/* Action Bar inside Inset */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-[#BAC5D5]/40">
              <span className="text-[11px] font-black text-[#2D3A4E] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#5F6ED0]" />
                <span>
                  {type === 'material'
                    ? 'Пресеты состава ткани:'
                    : activeCategoryTab === 'global'
                    ? 'Общие фразы для всех категорий:'
                    : `Акценты категории «${CATEGORY_TABS.find((t) => t.id === activeCategoryTab)?.label || activeCategoryTab}»:`}
                </span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManageMode(!isManageMode)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    isManageMode
                      ? 'bg-rose-500/15 text-rose-700 font-extrabold'
                      : 'text-[#5C6B80] hover:text-[#2D3A4E]'
                  }`}
                  title="Режим удаления фраз"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{isManageMode ? 'Готово' : 'Удалить фразы'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPhrase(!isAddingPhrase);
                    if (!isAddingPhrase) {
                      setTimeout(() => newPhraseInputRef.current?.focus(), 50);
                    }
                  }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#5F6ED0]/15 text-[#5F6ED0] hover:bg-[#5F6ED0]/25 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Добавить свою</span>
                </button>
              </div>
            </div>

            {/* Inline Add Phrase Input Form */}
            {isAddingPhrase && (
              <form
                onSubmit={handleAddNewPhrase}
                className="neu-flat rounded-xl p-2.5 bg-[#E3E8EF] border border-white/80 space-y-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between text-[10px] font-bold text-[#5C6B80]">
                  <span>
                    Новая фраза для:{' '}
                    <strong className="text-[#5F6ED0]">
                      {type === 'material'
                        ? 'Состав ткани'
                        : CATEGORY_TABS.find((t) => t.id === activeCategoryTab)?.label}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingPhrase(false)}
                    className="text-[#5C6B80] hover:text-rose-600"
                  >
                    Отмена
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={newPhraseInputRef}
                    type="text"
                    value={newPhraseInput}
                    onChange={(e) => setNewPhraseInput(e.target.value)}
                    placeholder={
                      type === 'material'
                        ? 'Например: 95% хлопок, 5% эластан'
                        : 'Например: Дышащая текстура, анатомический крой...'
                    }
                    className="flex-1 h-8 px-3 neu-inset rounded-lg text-xs text-[#2D3A4E] focus:outline-none bg-[#E3E8EF] placeholder:text-[#5C6B80]/60"
                  />
                  <button
                    type="submit"
                    disabled={!newPhraseInput.trim()}
                    className="h-8 px-3 rounded-lg neu-button-accent text-white text-xs font-bold active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Добавить</span>
                  </button>
                </div>
              </form>
            )}

            {/* List of Phrases Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1 pb-1">
              {currentPhrases.length === 0 ? (
                <div className="w-full py-4 text-center text-xs font-bold text-[#5C6B80]">
                  Фразы для этой категории пока не добавлены.{' '}
                  <button
                    type="button"
                    onClick={() => setIsAddingPhrase(true)}
                    className="text-[#5F6ED0] underline hover:text-[#4A58B8] cursor-pointer ml-1"
                  >
                    Добавить первую
                  </button>
                </div>
              ) : (
                currentPhrases.map((phrase, idx) => {
                  const isSelected = draft.includes(phrase);
                  return (
                    <div
                      key={idx}
                      className={`group inline-flex items-center rounded-xl text-[11px] font-bold transition-all ${
                        isSelected
                          ? 'neu-button-accent text-white shadow-xs'
                          : 'neu-button text-[#2D3A4E] hover:text-[#5F6ED0]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(phrase)}
                        className="px-2.5 py-1.5 text-left cursor-pointer active:scale-95 flex items-center gap-1"
                      >
                        <span>{type === 'material' ? phrase : `+ ${phrase}`}</span>
                      </button>

                      {/* Instant Delete Button on Chip */}
                      {(isManageMode || true) && (
                        <button
                          type="button"
                          onClick={(e) => handleDeletePhrase(phrase, e)}
                          className={`p-1.5 pr-2 rounded-r-xl transition-opacity cursor-pointer ${
                            isManageMode
                              ? 'text-rose-600 hover:text-rose-700 opacity-100'
                              : isSelected
                              ? 'text-white/70 hover:text-white opacity-0 group-hover:opacity-100'
                              : 'text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100'
                          }`}
                          title="Удалить фразу из базы"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Inset Footer Helper Note */}
            <div className="pt-2 border-t border-[#BAC5D5]/35 text-[10px] font-semibold text-[#5C6B80] flex items-center justify-between">
              <span>Нажмите на фразу, чтобы добавить её в текст</span>
            </div>
          </div>

          {/* Editor Input / Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-[#2D3A4E] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#5F6ED0]" />
                <span>{type === 'material' ? 'Полный текст состава ткани:' : 'Текст описания:'}</span>
              </label>
              {draft && (
                <button
                  type="button"
                  onClick={() => setDraft('')}
                  className="px-2.5 py-1 rounded-lg neu-button text-[10px] font-bold text-rose-600 hover:text-rose-700 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  title="Очистить поле ввода"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Очистить</span>
                </button>
              )}
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                rows={type === 'material' ? 3 : 5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  type === 'material'
                    ? 'Например: 100% органический лен с эффектом Stonewash'
                    : 'Введите детальное описание товара, особенности кроя, сезонность и уход...'
                }
                className="w-full px-4 py-3 neu-inset rounded-2xl text-xs sm:text-sm font-semibold text-[#2D3A4E] focus:outline-none bg-[#E3E8EF] resize-none leading-relaxed placeholder:text-[#5C6B80]/50 border border-white/40"
              />
            </div>

            {/* Word & Symbol count counter bar */}
            <div className="flex items-center justify-between text-[10px] font-bold text-[#5C6B80] px-1 flex-wrap gap-1">
              <span>
                Слов: <strong className="text-[#2D3A4E]">{wordCount}</strong> • Символов:{' '}
                <strong className="text-[#2D3A4E]">{draft.length}</strong>
              </span>
              <span className="text-[#5F6ED0]">
                Нажмите «Сохранить изменения» для применения
              </span>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#BAC5D5]/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSave(draft.trim())}
            className="flex-1 py-2.5 px-4 neu-button-accent rounded-xl text-xs font-black text-white active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
          >
            <Check className="w-4 h-4" />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>
    </div>
  );
};
