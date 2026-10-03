import React, { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { ChatMessage } from '../types';
import { loadChatImage } from '../utils/firebaseSync';

/** The message has a photo: inside it (older messages) or apart in `chat_images` */
export const hasChatPhoto = (msg: Pick<ChatMessage, 'imageUrl' | 'imageId'>) => Boolean(msg.imageUrl || msg.imageId);

/**
 * The photo of a chat message (stage 6, finding 20): kept apart, it is read when the message is shown, from the
 * database of the chat's side (a guest — the guest's sign-in). `children` draws it; a placeholder while it loads.
 */
export const ChatPhoto: React.FC<{
  message: Pick<ChatMessage, 'imageUrl' | 'imageId'>;
  db?: Firestore;
  children: (src: string) => React.ReactNode;
}> = ({ message, db, children }) => {
  const [src, setSrc] = useState<string | null>(message.imageUrl ?? null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (message.imageUrl) {
      setSrc(message.imageUrl);
      return;
    }
    if (!message.imageId) return;
    let alive = true;
    loadChatImage(message.imageId, db).then((data) => {
      if (!alive) return;
      setSrc(data);
      setMissing(!data);
    });
    return () => {
      alive = false;
    };
  }, [message.imageUrl, message.imageId, db]);

  if (src) return <>{children(src)}</>;
  return (
    <div className="w-40 h-32 rounded-xl neu-inset flex items-center justify-center text-[11px] text-[#4E5C70]">
      {missing ? 'Фото недоступно' : 'Фото загружается…'}
    </div>
  );
};
