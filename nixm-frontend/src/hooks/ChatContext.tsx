// ChatContext.tsx
import { exists, loadMessages, StoredMessage } from '@/lib/db/messages';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { useCryptoContext } from '@/hooks/CryptoContext';
import { IncomingMessage, MSG_DATA } from '@/lib/websocket/protocol';
import { randomUUID } from 'node:crypto';

type ChatMeta = {
  userId: string;
  lastMessage: string; // plaintext превью
  lastActivity: number;
  unreadCount: number;
};

type ChatMessage = {
  messageId: string;
  from: string;
  text: string; // расшифрованный plaintext
  timestamp: number;
  status: StoredMessage['status'];
  direction: 'sent' | 'received';
};

type ChatContextType = {
  chats: Map<string, ChatMeta>;
  activeMessages: ChatMessage[];
  currentChatId: string | null;
  openChat: (userId: string) => Promise<void>;
  sendMessage: (userId: string, text: string) => Promise<void>;
  loadMoreHistory: (
    userId: string,
    cursor: number,
  ) => Promise<{ hasMore: boolean }>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const ctx: ChatContextType = useMemo(() => ({}), [value]);

  const { myDeviceId } = useAuth();
  const { encryptMessage, decryptMessage } = useCryptoContext();

  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);

  const chatsRef = useRef<Map<string, ChatMeta>>(new Map());

  const [userId, setUserId] = useState<string | null>(null);
  const [chatsVersion, setChatsVersion] = useState(0);
  const forceUpdateChats = () => setChatsVersion(v => v + 1);

  const decryptBatch = async (
    stored: StoredMessage[],
  ): Promise<ChatMessage[]> => {
    if (!myDeviceId) return [];

    const results: ChatMessage[] = [];

    for (const msg of stored) {
      try {
        const text = await decryptMessage(msg.from, myDeviceId, {
          iv: msg.iv,
          data: msg.ciphertext,
        });
        results.push({
          messageId: msg.messageId,
          from: msg.from,
          text,
          timestamp: msg.timestamp,
          status: msg.status,
          direction: msg.direction,
        });
      } catch {
        // Не смогли расшифровать — пропускаем, не роняем весь батч
        console.warn('Failed to decrypt message', msg.messageId);
      }
    }

    return results;
  };

  const loadMoreHistory = async (userId: string, cursor: number) => {
    const stored = await loadMessages(userId, 50, cursor);
    if (stored.length === 0) return { hasMore: false };

    const decrypted = await decryptBatch(stored);
    setActiveMessages(prev => [...decrypted, ...prev]);

    return { hasMore: stored.length === 50 };
  };

  const openChat = useCallback(async (userId: string) => {
    setUserId(userId);

    // Сбрасываем счётчик
    chatsRef.current.set(userId, {
      ...chatsRef.current.get(userId)!,
      unreadCount: 0,
    });
    forceUpdateChats();

    // Грузим последние 50 — без cursor, это хвост
    const stored = await loadMessages(userId, 50);
    const decrypted = await decryptBatch(stored);
    setActiveMessages(decrypted);
  }, []);

  const handleIncomingMessage = async (wsData: IncomingMessage) => {
    if (wsData.type !== MSG_DATA) {
      return;
    }

    if (await exists(wsData.messageId)) {
      return;
    }

    const decrypted = en;
  };

  return <ChatContext.Provider value={ctx}>{children}</ChatContext.Provider>;
}

export function useMyContext(): ChatContextType {
  const ctx = useContext(ChatContext);

  if (!ctx) {
    throw new Error('useChatContext must be used within ChatProvider');
  }

  return ctx;
}
