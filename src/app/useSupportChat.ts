import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ChatMessage, PromoCode, SupportStatus, UserProfile } from '../types';
import {
  ChatIdentity,
  createGuestChatIdentity,
  db,
  forgetGuestChatIdentity,
  restoreGuestChatIdentity,
} from '../firebase';
import {
  subscribeToChatMessages,
  handOverGuestData,
  syncAllPromosToFirestore,
  saveChatMessageToFirestore,
  clearChatMessagesInFirestore,
  chatMessageOrder,
  applyChatMessageChange,
  applyChatMessageChangeLocally,
  ChatMessageChange,
  subscribeToSupportStatus,
} from '../utils/firebaseSync';
import { pluralRu } from '../utils/pluralize';
import { firestoreErrorCode } from '../utils/firestoreErrors';
import { forgetGuestOrders } from './guestOrders';
import type { AddToast, Persist } from './useToasts';

// v2: the chat is per customer now; don't show the old shared-chat cache
const CHAT_CACHE_STORAGE_KEY = 'manstyle_chat_messages_v2';

// Unique across customers: messages are create-only for customers (see firestore.rules)
function newChatMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


type SupportChatOptions = {
  authLoading: boolean;
  isAdmin: boolean;
  currentUser: User | null;
  userProfile: UserProfile;
  promos: PromoCode[];
  setPromos: React.Dispatch<React.SetStateAction<PromoCode[]>>;
  addToast: AddToast;
  persist: Persist;
};

/**
 * The support chat: the customer's own thread (a guest's — from an anonymous sign-in), every thread for the admin,
 * the delivery state of sent messages and the move of a guest's orders and chat to the account after a sign-in.
 */
export function useSupportChat({
  authLoading,
  isAdmin,
  currentUser,
  userProfile,
  promos,
  setPromos,
  addToast,
  persist,
}: SupportChatOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_CACHE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Delivery state of the customer's own chat messages (a failed one stays on screen with «повторить»)
  const [pendingChatIds, setPendingChatIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failedChatMessages, setFailedChatMessages] = useState<ChatMessage[]>([]);
  const [chatIdentity, setChatIdentity] = useState<ChatIdentity | null>(null);

  // Only a customer's own thread is cached (it opens at once next time). The admin's chat — every customer's
  // messages and staff notes — never stays in this browser (audit 02.10, finding 24)
  React.useEffect(() => {
    try {
      if (isAdmin) localStorage.removeItem(CHAT_CACHE_STORAGE_KEY);
      else localStorage.setItem(CHAT_CACHE_STORAGE_KEY, JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages, isAdmin]);

  // Signed out: the chat of that account leaves this browser (only locally — nothing is written)
  const signedInUidRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (authLoading) return;
    const uid = currentUser?.uid ?? null;
    if (signedInUidRef.current && !uid) {
      setChatMessages([]);
      try {
        localStorage.removeItem(CHAT_CACHE_STORAGE_KEY);
      } catch {}
    }
    signedInUidRef.current = uid;
  }, [authLoading, currentUser]);

  // 1c. Support chat identity: signed-in customers chat as themselves, guests reuse
  // an anonymous chat session if they started one earlier (created on first message).
  React.useEffect(() => {
    if (authLoading) return;
    if (currentUser) {
      setChatIdentity({ uid: currentUser.uid, db, isGuest: false });
      return;
    }
    let cancelled = false;
    setChatIdentity(null);
    restoreGuestChatIdentity().then((identity) => {
      if (!cancelled) setChatIdentity(identity);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser]);

  // 1c'. A guest signed in with Google: the orders and the chat of the guest's anonymous sign-in move to the account
  // (audit 02.10, finding 26). Both sides agree in this browser (rules), then the guest's session ends
  React.useEffect(() => {
    if (authLoading || !currentUser || isAdmin) return;
    let cancelled = false;
    restoreGuestChatIdentity().then(async (guest) => {
      if (cancelled || !guest || guest.uid === currentUser.uid) return;
      try {
        const { orderIds, messages } = await handOverGuestData(guest, currentUser.uid);
        forgetGuestOrders(orderIds);
        await forgetGuestChatIdentity();
        const parts = [
          orderIds.length > 0 ? `${orderIds.length} ${pluralRu(orderIds.length, ['заказ', 'заказа', 'заказов'])}` : '',
          messages > 0 ? 'переписка с магазином' : '',
        ].filter(Boolean);
        if (parts.length > 0) addToast(`Перенесено в ваш аккаунт то, что было без входа: ${parts.join(' и ')}`, 'success');
      } catch (err) {
        // the guest's orders stay visible from this browser; the move is tried again at the next sign-in
        console.error('Guest orders and chat were not moved to the account:', err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1d. Chat messages: admins see every thread, customers only their own
  React.useEffect(() => {
    if (authLoading) return;
    if (isAdmin) {
      return subscribeToChatMessages((loadedMsgs) => setChatMessages(loadedMsgs));
    }
    if (chatIdentity) {
      return subscribeToChatMessages((loadedMsgs) => setChatMessages(loadedMsgs), undefined, {
        threadId: chatIdentity.uid,
        db: chatIdentity.db,
      });
    }
    setChatMessages([]);
  }, [authLoading, isAdmin, chatIdentity]);

  // 1e. Status of the customer's own dialog, set by the staff (shown in «Служба заботы»)
  const [supportStatus, setSupportStatus] = useState<SupportStatus | null>(null);
  React.useEffect(() => {
    setSupportStatus(null);
    if (!chatIdentity) return;
    return subscribeToSupportStatus(chatIdentity.uid, chatIdentity.db, setSupportStatus);
  }, [chatIdentity]);

  // Support chat: the customer writes to the store's staff (no automatic replies)
  const deliverChatMessage = async (msg: ChatMessage, targetDb: ChatIdentity['db']) => {
    setPendingChatIds((prev) => new Set(prev).add(msg.id));
    setFailedChatMessages((prev) => prev.filter((m) => m.id !== msg.id));
    try {
      await saveChatMessageToFirestore(msg, targetDb);
    } catch (err) {
      console.error('Chat message was not sent:', err);
      setFailedChatMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
      addToast('Сообщение не отправлено. Проверьте соединение и нажмите «повторить»', 'error');
    } finally {
      setPendingChatIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
    }
  };

  /** false: the message could not be sent at all (the text stays in the field) */
  const handleSendMessageFromUser = async (text: string, imageUrl?: string): Promise<boolean> => {
    // Each customer has a private thread; guests get an anonymous chat identity on first message
    let identity = chatIdentity;
    if (!identity) {
      try {
        identity = await createGuestChatIdentity();
        setChatIdentity(identity);
      } catch (err) {
        console.error('Guest chat sign-in failed:', err);
        const code = (err as { code?: string })?.code;
        // Anonymous sign-in disabled in Firebase Console → guests must use Google sign-in
        const anonymousDisabled = code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation';
        addToast(
          anonymousDisabled
            ? 'Чтобы написать в поддержку, войдите через Google в разделе «Профиль»'
            : 'Не удалось подключиться к чату. Проверьте соединение и попробуйте еще раз.',
          'error'
        );
        return false;
      }
    }

    const userMsg: ChatMessage = {
      id: newChatMessageId(),
      sender: 'user',
      text,
      imageUrl,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      threadId: identity.uid,
      threadName: userProfile.name || userProfile.email || currentUser?.email || 'Гость',
    };
    setChatMessages((prev) => [...prev, userMsg]);
    void deliverChatMessage(userMsg, identity.db);
    return true;
  };

  const handleRetryChatMessage = (messageId: string) => {
    const msg = failedChatMessages.find((m) => m.id === messageId);
    const identity = chatIdentity;
    if (!msg || !identity) return;
    void deliverChatMessage(msg, identity.db);
  };

  /**
   * Edit / «удалить у себя» / «удалить у всех». The customer uses their chat identity's database
   * (rules allow own messages within 15 minutes), staff the main one. Local state first, rolled back on error.
   */
  const handleChangeChatMessage = async (change: ChatMessageChange, asStaff = false): Promise<boolean> => {
    if (!asStaff && failedChatMessages.some((m) => m.id === change.id)) {
      // never reached the server: only the local copy exists
      if (change.type !== 'edit') {
        setFailedChatMessages((prev) => prev.filter((m) => m.id !== change.id));
        setChatMessages((prev) => prev.filter((m) => m.id !== change.id));
      }
      return true;
    }
    const targetDb = asStaff ? undefined : chatIdentity?.db;
    if (!asStaff && !targetDb) return false;
    const before = chatMessages;
    setChatMessages((prev) => applyChatMessageChangeLocally(prev, change));
    try {
      await applyChatMessageChange(change, targetDb);
      return true;
    } catch (err) {
      setChatMessages(before);
      // only the rules' refusal means «15 minutes passed» (finding 18); anything else is not the buyer's doing
      const lateForCustomer = !asStaff && firestoreErrorCode(err) === 'permission-denied';
      if (lateForCustomer) console.warn('Chat message change refused (15 minutes passed):', err);
      else console.error('Chat message change failed:', err);
      addToast(
        lateForCustomer
          ? 'Изменить или удалить сообщение можно в течение 15 минут после отправки'
          : 'Не удалось изменить сообщение. Проверьте соединение и повторите',
        'error'
      );
      return false;
    }
  };

  const handleSendMessageAsAdmin = (
    text: string,
    imageUrl?: string,
    promoCard?: ChatMessage['promoCard'],
    tag?: ChatMessage['tag'],
    isInternalNote?: boolean,
    productCard?: ChatMessage['productCard'],
    orderStatusUpdate?: ChatMessage['orderStatusUpdate'],
    thread?: Pick<ChatMessage, 'threadId' | 'threadName'>
  ) => {
    const adminMsg: ChatMessage = {
      id: newChatMessageId(),
      ...thread,
      sender: 'admin',
      text,
      imageUrl,
      promoCard,
      tag,
      isInternalNote,
      productCard,
      orderStatusUpdate,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, adminMsg]);
    void persist('сообщение в чате', saveChatMessageToFirestore(adminMsg));

    // If a promo code was generated from the chat, automatically register it into the promos pool so the client can use it!
    if (promoCard) {
      const exists = promos.some((p) => p.code.toUpperCase() === promoCard.code.toUpperCase());
      if (!exists) {
        const newPromo: PromoCode = {
          id: `promo-care-${Date.now()}`,
          code: promoCard.code.toUpperCase(),
          title: `Компенсация (${promoCard.code.toUpperCase()})`,
          discountPercent: promoCard.discountType === 'percent' ? promoCard.discountValue : 0,
          discountValue: promoCard.discountValue,
          discountType: promoCard.discountType,
          description: promoCard.description || 'Персональный промокод от службы заботы',
          minOrderAmount: 0,
          active: true,
          // no invented deadline: without a date the code works until it is used
          ...(promoCard.expiryDate ? { expiresAt: promoCard.expiryDate } : {}),
          usedCount: 0,
          usageLimit: 1,
        };
        const updated = [newPromo, ...promos];
        setPromos(updated);
        void persist('промокод из чата', syncAllPromosToFirestore([newPromo]));
      }
    }
  };

  /** threadId: undefined — whole chat, null — legacy messages without a thread, string — one customer */
  const handleClearChat = async (threadId?: string | null) => {
    // Cleared on screen only after the database deleted the messages: otherwise they would come back
    if (!(await persist('очистка чата', clearChatMessagesInFirestore(threadId)))) return;
    setChatMessages((prev) =>
      threadId === undefined ? [] : prev.filter((m) => (m.threadId ?? null) !== threadId)
    );
    addToast(threadId === undefined ? 'История чата поддержки очищена' : 'Диалог очищен', 'info');
  };

  // Admins load every thread; in the storefront chat they only see their own
  const ownThread = isAdmin ? chatMessages.filter((m) => m.threadId === currentUser?.uid) : chatMessages;
  // Failed messages are not in Firestore: keep them on screen (in send order) until they are retried
  const customerChatMessages = [
    ...ownThread.filter((m) => !failedChatMessages.some((f) => f.id === m.id)),
    ...failedChatMessages,
  ].sort((a, b) => chatMessageOrder(a) - chatMessageOrder(b));


  return {
    chatMessages,
    setChatMessages,
    chatIdentity,
    setChatIdentity,
    supportStatus,
    pendingChatIds,
    failedChatMessages,
    customerChatMessages,
    handleSendMessageFromUser,
    handleRetryChatMessage,
    handleChangeChatMessage,
    handleSendMessageAsAdmin,
    handleClearChat,
  };
}
