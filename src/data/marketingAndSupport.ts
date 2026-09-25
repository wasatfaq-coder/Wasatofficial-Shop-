import { ChatMessage } from '../types';

// Local greeting that opens every support dialog (not stored in Firestore)
export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    sender: 'bot',
    text: 'Здравствуйте! Я консультант службы поддержки Wasat Shop. Чем я могу помочь вам?',
    timestamp: 'Только что',
  },
];
