// ChatContext.tsx
import {
  exists,
  loadMessages,
  saveMessage,
  StoredMessage,
} from '@/lib/db/messages';
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
import { arrayBufferToBase64 } from '@/lib/crypto';
import { api } from '@/lib/api/api';

type ChatMeta = {
  userId: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

type ChatMessage = {
  messageId: string;
  from: string;
  text: string;
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
  handleIncomingMessage: (wsData: IncomingMessage) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { myDeviceId, me } = useAuth();
  const { encryptMessage, decryptMessage } = useCryptoContext();

  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const chatsRef = useRef<Map<string, ChatMeta>>(new Map());
  const currentChatIdRef = useRef<string | null>(null);

  const [, setChatsVersion] = useState(0);
  const forceUpdateChats = () => setChatsVersion(v => v + 1);

  const decryptBatch = useCallback(
    async (stored: StoredMessage[]): Promise<ChatMessage[]> => {
      if (!myDeviceId) return [];

      const results: ChatMessage[] = [];

      for (const msg of stored) {
        try {
          // Для входящих — расшифровываем ключом отправителя
          // Для исходящих — ключ собеседника (to), т.к. мы шифровали для него
          const peerId = msg.direction === 'received' ? msg.from : msg.to;

          const text = await decryptMessage(peerId, myDeviceId, {
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
          console.warn('Failed to decrypt message', msg.messageId);
        }
      }

      return results;
    },
    [myDeviceId, decryptMessage],
  );

  const loadMoreHistory = useCallback(
    async (userId: string, cursor: number): Promise<{ hasMore: boolean }> => {
      const stored = await loadMessages(userId, 50, cursor);
      if (stored.length === 0) return { hasMore: false };

      const decrypted = await decryptBatch(stored);
      setActiveMessages(prev => [...decrypted, ...prev]);

      return { hasMore: stored.length === 50 };
    },
    [decryptBatch],
  );

  const openChat = useCallback(
    async (userId: string) => {
      setCurrentChatId(userId);
      currentChatIdRef.current = userId;

      const meta = chatsRef.current.get(userId);
      chatsRef.current.set(userId, {
        userId,
        lastMessage: meta?.lastMessage ?? '',
        lastActivity: meta?.lastActivity ?? Date.now(),
        unreadCount: 0,
      });
      forceUpdateChats();

      const stored = await loadMessages(userId, 50);
      const decrypted = await decryptBatch(stored);
      setActiveMessages(decrypted);
    },
    [decryptBatch],
  );

  const sendMessage = useCallback(
    async (userId: string, text: string) => {
      if (!me?.id || !myDeviceId) throw new Error('Not authenticated');

      const messageId = crypto.randomUUID();
      const timestamp = Date.now();

      // Шифруем для каждого устройства получателя
      const encrypted = await encryptMessage(userId, text);

      // Берём payload для нашего девайса — чтобы сохранить в IDB и уметь расшифровать потом
      const myPayload = encrypted.find(e => e.deviceId === myDeviceId);

      if (!myPayload) {
        // Нас нет в списке устройств получателя (нормально если у нас одно устройство)
        // Сохраняем первый попавшийся — или можно шифровать отдельно для себя
        console.warn(
          'Own device not found in encrypted list, storing first payload',
        );
      }

      const storagePayload = myPayload ?? encrypted[0];

      const stored: StoredMessage = {
        messageId,
        from: String(me.id),
        to: userId,
        direction: 'sent',
        ciphertext: storagePayload.encryptedPayload.data,
        iv: storagePayload.encryptedPayload.iv,
        timestamp,
        status: 'pending',
      };

      await saveMessage(stored);

      // Оптимистично добавляем в стейт
      const optimistic: ChatMessage = {
        messageId,
        from: String(me.id),
        text,
        timestamp,
        status: 'pending',
        direction: 'sent',
      };

      if (currentChatIdRef.current === userId) {
        setActiveMessages(prev => [...prev, optimistic]);
      }

      // Обновляем мету чата
      chatsRef.current.set(userId, {
        userId,
        lastMessage: text,
        lastActivity: timestamp,
        unreadCount: 0,
      });
      forceUpdateChats();

      // Отправляем на сервер — payload для каждого устройства
      await api.messages.send({
        messageId,
        to: userId,
        payloads: encrypted.map(e => ({
          deviceId: e.deviceId,
          ciphertext: e.encryptedPayload.data,
          iv: e.encryptedPayload.iv,
        })),
        timestamp,
      });

      // TODO: обновить статус на 'sent' после ответа сервера
    },
    [me, myDeviceId, encryptMessage],
  );

  const handleIncomingMessage = useCallback(
    async (wsData: IncomingMessage) => {
      if (wsData.type !== MSG_DATA) return;
      if (!myDeviceId) return;

      const messageId = wsData.messageId;

      if (await exists(messageId)) return;

      const fromId = String(wsData.from);
      const ivBase64 = arrayBufferToBase64(wsData.iv);
      const timestamp = wsData.timestamp ?? Date.now();
      const ciphertextBase64 = arrayBufferToBase64(wsData.ciphertext);

      // Сохраняем в IDB
      const stored: StoredMessage = {
        messageId,
        from: fromId,
        to: me ? String(me.id) : '',
        direction: 'received',
        ciphertext: ciphertextBase64,
        iv: ivBase64,
        timestamp,
        status: 'delivered',
      };

      await saveMessage(stored);

      // Расшифровываем для UI
      let text: string;
      try {
        text = await decryptMessage(fromId, myDeviceId, {
          iv: ivBase64,
          data: ciphertextBase64,
        });
      } catch {
        console.warn('Failed to decrypt incoming message', messageId);
        return;
      }

      const incoming: ChatMessage = {
        messageId,
        from: fromId,
        text,
        timestamp,
        status: 'delivered',
        direction: 'received',
      };

      // Если чат открыт — добавляем в стейт
      if (currentChatIdRef.current === fromId) {
        setActiveMessages(prev => [...prev, incoming]);
      }

      // Обновляем мету
      const prev = chatsRef.current.get(fromId);
      chatsRef.current.set(fromId, {
        userId: fromId,
        lastMessage: text,
        lastActivity: timestamp,
        unreadCount:
          currentChatIdRef.current === fromId
            ? 0
            : (prev?.unreadCount ?? 0) + 1,
      });
      forceUpdateChats();
    },
    [myDeviceId, me, decryptMessage],
  );

  const ctx: ChatContextType = useMemo(
    () => ({
      chats: chatsRef.current,
      activeMessages,
      currentChatId,
      openChat,
      sendMessage,
      loadMoreHistory,
      handleIncomingMessage,
    }),
    [
      activeMessages,
      currentChatId,
      openChat,
      sendMessage,
      loadMoreHistory,
      handleIncomingMessage,
    ],
  );

  return <ChatContext.Provider value={ctx}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextType {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
}
