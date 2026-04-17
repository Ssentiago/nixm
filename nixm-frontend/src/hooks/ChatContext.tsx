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
import {
  encodePacket,
  IncomingMessage,
  MSG_DATA,
} from '@/lib/websocket/protocol';
import { arrayBufferToBase64, base64ToUint8Array } from '@/lib/crypto';
import { api } from '@/lib/api/api';
import { ws } from '@/lib/websocket/service';

type ChatMessage = {
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
  status: StoredMessage['status'];
  direction: 'sent' | 'received';
};

type UserID = number;

type ChatMeta = {
  userId: number;
  username: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

type ChatContextType = {
  chats: Map<number, ChatMeta>;
  activeMessages: ChatMessage[];
  currentChatId: number | null;
  openChat: (userId: number, username: string) => Promise<void>;
  sendMessage: (userId: number, text: string) => Promise<void>;
  loadMoreHistory: (
    userId: number,
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
    async (userId: number, username: string) => {
      setCurrentChatId(userId);
      currentChatIdRef.current = userId;

      const meta = chatsRef.current.get(userId);
      chatsRef.current.set(userId, {
        userId,
        username,
        lastMessage: meta?.lastMessage ?? '',
        lastActivity: meta?.lastActivity ?? Date.now(),
        unreadCount: 0,
      });
      forceUpdateChats();

      const stored = await loadMessages(String(userId), 50);
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

      const encrypted = await encryptMessage(userId, text);
      const myPayload =
        encrypted.find(e => e.deviceId === myDeviceId) ?? encrypted[0];

      await saveMessage({
        messageId,
        from: String(me.id),
        to: userId,
        direction: 'sent',
        ciphertext: myPayload.encryptedPayload.data,
        iv: myPayload.encryptedPayload.iv,
        timestamp,
        status: 'pending',
      });

      ws.send({
        type: MSG_DATA,
        to: Number(userId),
        messageId,
        timestamp,
        payloads: encrypted.map(({ deviceId, encryptedPayload }) => ({
          device_id: deviceId,
          iv: base64ToUint8Array(encryptedPayload.iv),
          ciphertext: base64ToUint8Array(encryptedPayload.data),
        })),
      });

      if (currentChatIdRef.current === userId) {
        setActiveMessages(prev => [
          ...prev,
          {
            messageId,
            from: String(me.id),
            text,
            timestamp,
            status: 'pending',
            direction: 'sent',
          },
        ]);
      }
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
