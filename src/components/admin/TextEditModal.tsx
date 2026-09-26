import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  X,
  Check,
  Plus,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import {
  QuickPhrasesData,
  subscribeToQuickPhrases,
  addQuickPhrase,
  deleteQuickPhrase,
} from '../../utils/phrasesSync';
import type { StoreCategory } from '../../types';
import { ModalPortal } from '../ModalPortal';
import { categoryIcon } from '../../utils/categories';

interface TextEditModalProps {
  isOpen: boolean;
  category?: string;
  /** Categories from Admin → «Категории»: the phrase sets offered for descriptions */
  categories?: StoreCategory[];
  /** Name of the product's category when it is not in the list */
  categoryLabel?: string;
  title: string;
  subtitle: string;
  initialValue: string;
  onClose: () => void;
  onSave: (newValue: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/** Names of the phrase sets stored before categories were set in the admin panel */
const LEGACY_SET_LABELS: Record<string, string> = {
  linen: 'Лен',
  shirts: 'Рубашки',
  tshirts: 'Футболки',
  jackets: 'Куртки',
  trousers: 'Брюки',
  sweatshirts: 'Свитшоты',
  suits: 'Костюмы',
  accessories: 'Аксессуары',
};

type PhraseSetGroup = 'global' | 'store' | 'other';

interface PhraseSet {
  id: string;
  label: string;
  group: PhraseSetGroup;
  icon: React.ComponentType<{ className?: string }>;
}

const GROUP_TITLES: Record<PhraseSetGroup, string> = {
  global: 'Для всех товаров',
  store: 'Категории магазина',
  other: 'Другие наборы фраз',
};

const pluralAccents = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'акцент';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'акцента';
  return 'акцентов';
};

/** Last phrases snapshot: a reopened window shows them at once instead of growing after load */
let cachedPhrases: QuickPhrasesData | null = null;

/** Opening animation length: the text field is focused after it, so the window does not jump */
const OPEN_ANIMATION_MS = 200;

export const TextEditModal: React.FC<TextEditModalProps> = ({
  isOpen,
  category = 'global',
  categories = [],
  categoryLabel,
  title,
  subtitle,
  initialValue,
  onClose,
  onSave,
  onShowToast,
}) => {
  const [draft, setDraft] = useState('');
  const [phrasesData, setPhrasesData] = useState<QuickPhrasesData | null>(cachedPhrases);
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
      cachedPhrases = data;
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

      // Open on the product's category (it is always in the list of phrase sets)
      setActiveCategoryTab(category && category !== 'all' ? category : 'global');
      setIsManageMode(false);

      // On phones focus would open the keyboard mid-animation and resize the window: the text is
      // focused by a tap there. Elsewhere — after the animation, without scrolling the window.
      if (window.matchMedia?.('(pointer: coarse)').matches) return;
      const timer = window.setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus({ preventScroll: true });
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
      }, OPEN_ANIMATION_MS);
      return () => window.clearTimeout(timer);
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

  // Phrase sets, top to bottom: common phrases → the store's categories (Admin → «Категории»,
  // plus the product's own category) → sets saved earlier for other categories
  const phraseSets = useMemo<PhraseSet[]>(() => {
    const sets: PhraseSet[] = [{ id: 'global', label: 'Общие фразы', group: 'global', icon: Sparkles }];
    const has = (id: string) => sets.some((set) => set.id === id);
    for (const c of categories) {
      sets.push({ id: c.id, label: c.name, group: 'store', icon: categoryIcon(c) });
    }
    if (category && category !== 'all' && !has(category)) {
      sets.push({
        id: category,
        label: categoryLabel || LEGACY_SET_LABELS[category] || category,
        group: 'store',
        icon: categoryIcon({ id: category }),
      });
    }
    for (const id of Object.keys(phrasesData?.byCategory ?? {})) {
      if (!has(id)) {
        sets.push({ id, label: LEGACY_SET_LABELS[id] || id, group: 'other', icon: categoryIcon({ id }) });
      }
    }
    return sets;
  }, [categories, category, categoryLabel, phrasesData]);

  const phraseCount = (id: string) =>
    id === 'global' ? phrasesData?.global.length ?? 0 : phrasesData?.byCategory[id]?.length ?? 0;
  const activeSet = phraseSets.find((set) => set.id === activeCategoryTab) ?? phraseSets[0];

  // Phrases of the selected set
  const currentPhrases = useMemo(() => {
    if (!phrasesData) return [];

    if (activeCategoryTab === 'global') {
      return phrasesData.global || [];
    }

    return phrasesData.byCategory[activeCategoryTab] || [];
  }, [phrasesData, activeCategoryTab]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: string) => {
    setDraft((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return preset;
      // Avoid duplicating exact same line
      if (trimmed.includes(preset)) return trimmed;
      return `${trimmed}\n${preset}`;
    });
    if (onShowToast) onShowToast('Фраза добавлена в описание', 'info');
  };

  const handleAddNewPhrase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPhraseInput.trim();
    if (!trimmed) return;

    try {
      await addQuickPhrase(activeCategoryTab, trimmed);
      setNewPhraseInput('');
      setIsAddingPhrase(false);
      if (onShowToast) {
        onShowToast('Новая быстрая фраза синхронизирована для всех товаров', 'success');
      }
    } catch (err) {
      console.error(err);
      if (onShowToast) onShowToast('Ошибка сохранения фразы', 'error');
    }
  };

  const handleDeletePhrase = async (phraseToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteQuickPhrase(activeCategoryTab, phraseToDelete);
      if (onShowToast) {
        onShowToast('Фраза удалена из базы быстрых фраз', 'info');
      }
    } catch (err) {
      console.error(err);
      if (onShowToast) onShowToast('Ошибка удаления фразы', 'error');
    }
  };

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const targetLabel = activeSet.label;
  const ActiveIcon = activeSet.icon;

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[130] bg-[#2D3A4E]/55 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl neu-modal rounded-3xl p-4 sm:p-6 border border-white/80 space-y-4 animate-in zoom-in-95 fade-in duration-200 h-[88dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header: icon, title with its tag, subtitle; close button in the corner */}
        <div className="flex items-start justify-between gap-3 border-b border-[#BAC5D5]/50 pb-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-accent shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-[#2D3A4E] tracking-tight leading-tight">{title}</h3>
                <span className="text-[11px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                  Каталог акцентов
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[#4E5C70] leading-snug">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer shrink-0"
            title="Закрыть окно (Esc)"
            aria-label="Закрыть окно (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable middle: phrase set picker, phrases, text */}
        <div className="space-y-3.5 overflow-y-auto -mx-1 px-1 pb-1 flex-1 min-h-0">
          {/* Phrase set picker */}
          <div className="space-y-1.5" ref={categoryDropdownRef}>
            <div className="space-y-0.5">
              <label className="text-[11px] font-black text-[#2D3A4E] uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Категория одежды</span>
              </label>
              <p className="text-[11px] font-semibold text-[#4E5C70] leading-snug">
                Фразы общие для всех товаров выбранной категории
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                aria-haspopup="listbox"
                aria-expanded={isCategoryDropdownOpen}
                className={`w-full h-12 pl-2 pr-3 rounded-2xl neu-inset bg-[#E3E8EF] flex items-center justify-between gap-2 text-left transition-all cursor-pointer ${
                  isCategoryDropdownOpen ? 'ring-2 ring-accent/40' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl neu-button bg-[#E3E8EF] flex items-center justify-center text-accent shrink-0">
                    <ActiveIcon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-[#2D3A4E] truncate">{activeSet.label}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-lg font-black bg-accent/10 text-accent whitespace-nowrap shrink-0">
                    {phraseCount(activeSet.id)} {pluralAccents(phraseCount(activeSet.id))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="hidden sm:inline text-[11px] font-bold text-accent">Выбрать</span>
                  <ChevronDown
                    className={`w-4 h-4 text-accent transition-transform duration-200 ${
                      isCategoryDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Menu: groups in order, the selected set pressed in */}
              {isCategoryDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute top-full mt-2 left-0 right-0 z-50 neu-dropdown rounded-2xl bg-[#E3E8EF] border border-white/80 p-1.5 max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  {(['global', 'store', 'other'] as PhraseSetGroup[]).map((group) => {
                    const sets = phraseSets.filter((set) => set.group === group);
                    if (sets.length === 0) return null;
                    return (
                      <div key={group} className="py-1 first:pt-0 last:pb-0">
                        <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-black uppercase tracking-wider text-[#4E5C70]">
                          {GROUP_TITLES[group]}
                        </p>
                        <div className="space-y-1">
                          {sets.map((set) => {
                            const isSelected = activeCategoryTab === set.id;
                            const SetIcon = set.icon;
                            return (
                              <button
                                key={set.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setActiveCategoryTab(set.id);
                                  setIsCategoryDropdownOpen(false);
                                  setIsAddingPhrase(false);
                                }}
                                className={`w-full h-10 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                  isSelected ? 'neu-pill-active' : 'text-[#2D3A4E] hover:bg-[#BAC5D5]/20'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <SetIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                                  <span className="truncate">{set.label}</span>
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] min-w-6 px-1.5 py-0.5 rounded-md font-black text-center bg-accent/10 text-accent">
                                    {phraseCount(set.id)}
                                  </span>
                                  {isSelected ? (
                                    <Check className="w-3.5 h-3.5 text-accent" />
                                  ) : (
                                    <span className="w-3.5 h-3.5" aria-hidden="true" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Phrases: title, actions, the list */}
          <div className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3">
            <div className="space-y-2.5 pb-2.5 border-b border-[#BAC5D5]/40">
              <p className="text-[11px] font-black text-[#2D3A4E] flex items-start gap-1.5 leading-snug">
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-px" />
                <span>
                  {activeSet.id === 'global'
                    ? 'Общие фразы для всех категорий'
                    : `Акценты категории «${activeSet.label}»`}
                </span>
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPhrase(!isAddingPhrase);
                    if (!isAddingPhrase) {
                      setTimeout(() => newPhraseInputRef.current?.focus(), 50);
                    }
                  }}
                  aria-pressed={isAddingPhrase}
                  className={`h-8 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    isAddingPhrase ? 'neu-pill-active' : 'neu-button text-accent'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить свою</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManageMode(!isManageMode)}
                  aria-pressed={isManageMode}
                  className={`h-8 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    isManageMode ? 'neu-button-danger' : 'neu-button text-[#4E5C70] hover:text-[#2D3A4E]'
                  }`}
                  title="Режим удаления фраз"
                >
                  {isManageMode ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{isManageMode ? 'Готово' : 'Удалить фразы'}</span>
                </button>
              </div>
            </div>

            {/* Inline add form */}
            {isAddingPhrase && (
              <form
                onSubmit={handleAddNewPhrase}
                className="neu-flat-sm rounded-xl p-2.5 bg-[#E3E8EF] space-y-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#4E5C70]">
                  <span className="min-w-0 truncate">
                    Новая фраза: <strong className="text-accent">{targetLabel}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingPhrase(false)}
                    className="shrink-0 text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={newPhraseInputRef}
                    type="text"
                    value={newPhraseInput}
                    onChange={(e) => setNewPhraseInput(e.target.value)}
                    placeholder="Например: дышащая ткань"
                    className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] bg-[#E3E8EF] placeholder:text-[#56647A]"
                  />
                  <button
                    type="submit"
                    disabled={!newPhraseInput.trim()}
                    className="h-9 px-3 rounded-xl neu-button text-accent text-xs font-bold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить</span>
                  </button>
                </div>
              </form>
            )}

            {/* Phrases (padding keeps the raised shadows from being cut by the scroll box) */}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1.5 -mx-1.5">
              {!phrasesData ? (
                <div className="w-full py-4 text-center text-xs font-bold text-[#4E5C70]">Загружаем фразы…</div>
              ) : currentPhrases.length === 0 ? (
                <div className="w-full py-4 text-center text-xs font-bold text-[#4E5C70]">
                  Фразы для этой категории пока не добавлены.{' '}
                  <button
                    type="button"
                    onClick={() => setIsAddingPhrase(true)}
                    className="text-accent underline hover:text-accent-strong cursor-pointer ml-1"
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
                      className={`inline-flex items-stretch max-w-full rounded-xl text-[11px] font-bold transition-all ${
                        isSelected ? 'neu-pill-active' : 'neu-button text-[#2D3A4E] hover:text-accent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(phrase)}
                        disabled={isManageMode}
                        className="min-w-0 px-3 py-2 text-left leading-snug cursor-pointer disabled:cursor-default"
                      >
                        {`+ ${phrase}`}
                      </button>

                      {/* Delete: only in the delete mode, so a tap on the phrase never removes it */}
                      {isManageMode && (
                        <button
                          type="button"
                          onClick={(e) => handleDeletePhrase(phrase, e)}
                          className="px-2.5 rounded-r-xl text-danger hover:bg-danger-soft border-l border-[#BAC5D5]/50 flex items-center cursor-pointer"
                          title="Удалить фразу из базы"
                          aria-label={`Удалить фразу «${phrase}»`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p className="pt-2.5 border-t border-[#BAC5D5]/40 text-[11px] font-semibold text-[#4E5C70]">
              {isManageMode ? 'Нажмите ×, чтобы удалить фразу из базы' : 'Нажмите на фразу, чтобы добавить ее в текст'}
            </p>
          </div>

          {/* Text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-black text-[#2D3A4E] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>Текст описания</span>
              </label>
              {draft && (
                <button
                  type="button"
                  onClick={() => setDraft('')}
                  className="h-7 px-2.5 rounded-lg neu-button-danger text-[11px] font-bold active:scale-95 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  title="Очистить поле ввода"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Очистить</span>
                </button>
              )}
            </div>

            <textarea
              ref={textareaRef}
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Введите детальное описание товара, особенности кроя, сезонность и уход..."
              className="w-full px-4 py-3 neu-inset rounded-2xl text-xs sm:text-sm font-semibold text-[#2D3A4E] bg-[#E3E8EF] resize-none leading-relaxed placeholder:text-[#56647A]"
            />

            <p className="text-[11px] font-bold text-[#4E5C70] px-1">
              Слов: <strong className="text-[#2D3A4E]">{wordCount}</strong> • Символов:{' '}
              <strong className="text-[#2D3A4E]">{draft.length}</strong>
            </p>
          </div>
        </div>

        {/* Footer: equal heights, the main action takes the remaining width */}
        <div className="flex items-center gap-2.5 pt-3 border-t border-[#BAC5D5]/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 shrink-0 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSave(draft.trim())}
            className="h-11 flex-1 min-w-0 px-4 neu-button-accent rounded-xl text-xs font-black text-white whitespace-nowrap active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>Сохранить изменения</span>
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
