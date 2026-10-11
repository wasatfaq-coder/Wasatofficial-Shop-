import { useEffect, useState } from 'react';
import type { ChatQuickTemplate } from '../../types';
import { subscribeToChatTemplates, updateChatTemplates } from '../../utils/firebaseSync';
import { LEGACY_TEMPLATES_STORAGE_KEY, mergeChatTemplates, normalizeChatTemplates } from '../../utils/chatTemplates';

type ShowToast = (msg: string, type?: 'success' | 'info' | 'error') => void;

/** The browser copy is moved into the database once per visit, by the first chat that opens */
let legacyMoveStarted = false;

function readLegacyTemplates(): ChatQuickTemplate[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_TEMPLATES_STORAGE_KEY);
    return raw === null ? null : normalizeChatTemplates(JSON.parse(raw));
  } catch {
    return null;
  }
}

function forgetLegacyTemplates() {
  try {
    localStorage.removeItem(LEGACY_TEMPLATES_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to forget
  }
}

/**
 * Templates saved before stage 7 in this browser join the database list — inside a transaction, so a second device moving
 * its own at the same time keeps both; the browser copy goes only after the database took it
 */
async function moveLegacyTemplates() {
  const local = readLegacyTemplates();
  if (local === null) return;
  if (local.length > 0) {
    try {
      await updateChatTemplates((current) => mergeChatTemplates(normalizeChatTemplates(current), local));
    } catch (err) {
      // the browser copy stays and is moved on the next visit
      console.error('Chat reply templates from this browser were not moved to the database:', err);
      return;
    }
  }
  forgetLegacyTemplates();
}

/**
 * Reply templates of the support chat (admin audit 09.10, stage 7, finding 4): one list in `settings/chat_templates`
 * for the phone and the computer. `templates` is null until the database answers.
 */
export function useChatTemplates(onShowToast: ShowToast) {
  const [templates, setTemplates] = useState<ChatQuickTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(
    () =>
      subscribeToChatTemplates(
        (items) => {
          const saved = normalizeChatTemplates(items);
          setTemplates(saved);
          setFailed(false);
          if (!legacyMoveStarted) {
            legacyMoveStarted = true;
            void moveLegacyTemplates();
          }
        },
        () => setFailed(true)
      ),
    []
  );

  /**
   * Applies `change` to the list as it is in the database now (a transaction: an edit from another device in the same
   * seconds stays); `false` and an error toast when the database refused
   */
  const save = async (change: (current: ChatQuickTemplate[]) => ChatQuickTemplate[]): Promise<boolean> => {
    try {
      await updateChatTemplates((current) => change(normalizeChatTemplates(current)));
      return true;
    } catch (err) {
      console.error('Chat reply templates were not saved:', err);
      onShowToast('Не сохранено: шаблоны ответов. Проверьте связь и попробуйте ещё раз', 'error');
      return false;
    }
  };

  return { templates, failed, save };
}
