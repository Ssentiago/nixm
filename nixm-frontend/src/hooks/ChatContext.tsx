// ChatContext.tsx
import {
  exists,
  getAllPeerIds,
  loadMessages,
  saveMessage,
  StoredMessage,
} from '@/lib/db/messages';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
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
  isSystem?: boolean;
};

type UserID = number;

type ChatMeta = {
  userId: string;
  username: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

type ChatContextType = {
  chats: Map<string, ChatMeta>;
  activeMessages: ChatMessage[];
  currentChatId: string | null;
  openChat: (userId: string, username: string) => Promise<void>;
  sendMessage: (userId: string, text: string) => Promise<void>;
  loadMoreHistory: (
    userId: string,
    cursor: number,
  ) => Promise<{ hasMore: boolean }>;
  handleIncomingMessage: (wsData: IncomingMessage) => Promise<void>;
  addChat: (userId: string, username: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const { myDeviceId, me } = useAuth();
  const { encryptMessage, decryptMessage } = useCryptoContext();

  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const chatsRef = useRef<Map<string, ChatMeta>>(new Map());
  const currentChatIdRef = useRef<string | null>(null);
  const [chatsVersion, setChatsVersion] = useState(0);
  const forceUpdateChats = useCallback(() => setChatsVersion(v => v + 1), []);

  const decryptBatch = useCallback(
    async (stored: StoredMessage[]): Promise<ChatMessage[]> => {
      if (!myDeviceId) return [];

      const results: ChatMessage[] = [];

      for (const msg of stored) {
        if (msg.system) {
          results.push({
            messageId: msg.messageId,
            from: msg.from,
            text: msg.ciphertext, // Используем поле ciphertext как текст сообщения
            timestamp: msg.timestamp,
            status: msg.status,
            direction: msg.direction,
            isSystem: true,
          });
          continue;
        }
        try {
          let text = '';

          const peerId = msg.direction === 'received' ? msg.from : msg.to;
          text = await decryptMessage(peerId, myDeviceId, {
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

  const addChat = useCallback(async (userId: string, username: string) => {
    const prev = chatsRef.current.get(userId);
    if (prev) return; // уже есть

    chatsRef.current.set(userId, {
      userId,
      username,
      lastMessage: 'Session Established',
      lastActivity: Date.now(),
      unreadCount: 1,
    });
    forceUpdateChats();
  }, []);

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
    async (userId: string, username: string) => {
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

      // Сначала IDB
      let stored = await loadMessages(userId, 50);

      // Если пусто — грузим с сервера и сохраняем локально
      if (stored.length === 0 && myDeviceId && me) {
        try {
          const remote = await api.messages.getHistory(userId, myDeviceId);
          for (const msg of remote) {
            await saveMessage({
              messageId: msg.messageId,
              from: msg.from,
              to: msg.to,
              peerId: msg.from === String(me.id) ? msg.to : msg.from,
              direction: msg.from === String(me.id) ? 'sent' : 'received',
              ciphertext: msg.ciphertext,
              iv: msg.iv,
              timestamp: msg.timestamp,
              status: 'delivered',
            });
          }
          stored = await loadMessages(userId, 50); // перечитываем
        } catch (e) {
          console.warn('Failed to load history from server', e);
        }
      }

      const decrypted = await decryptBatch(stored);
      setActiveMessages(decrypted);
    },
    [decryptBatch, myDeviceId],
  );
  const sendMessage = useCallback(
    async (userId: string, text: string) => {
      if (!me?.id || !myDeviceId) throw new Error('Not authenticated');

      console.log('[sendMessage] start', userId, text);

      const messageId = crypto.randomUUID();
      const timestamp = Date.now();

      let encrypted;
      try {
        encrypted = await encryptMessage(userId, text);
        console.log('[sendMessage] encrypted', encrypted);
      } catch (e) {
        console.error('[sendMessage] encryptMessage failed', e);
        return;
      }

      const myPayload =
        encrypted.find(e => e.deviceId === myDeviceId) ?? encrypted[0];

      try {
        await saveMessage({
          messageId,
          from: me.id,
          to: userId,
          peerId: userId,
          direction: 'sent',
          ciphertext: myPayload.encryptedPayload.data,
          iv: myPayload.encryptedPayload.iv,
          timestamp,
          status: 'pending',
        });
        console.log('[sendMessage] saved to IDB');
      } catch (e) {
        console.error('[sendMessage] saveMessage failed', e);
      }

      try {
        ws.send({
          type: MSG_DATA,
          to: BigInt(userId),
          messageId,
          timestamp,
          payloads: encrypted.map(({ deviceId, encryptedPayload }) => ({
            device_id: deviceId,
            iv: base64ToUint8Array(encryptedPayload.iv),
            ciphertext: base64ToUint8Array(encryptedPayload.data),
          })),
        });
        console.log('[sendMessage] ws.send done');
      } catch (e) {
        console.error('[sendMessage] ws.send failed', e);
      }

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
        peerId: fromId,
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

      let username = prev?.username;
      if (!username) {
        try {
          const user = await api.users.getUser(fromId);
          username = user.username;
        } catch {
          username = fromId;
        }
      }

      chatsRef.current.set(fromId, {
        userId: fromId,
        username,
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

  useEffect(() => {
    if (!me) return;

    (async () => {
      const peers = await getAllPeerIds();
      console.log(peers);
      for (const { peerId, lastTimestamp } of peers) {
        if (chatsRef.current.has(peerId)) continue;

        let username = peerId;
        try {
          const user = await api.users.getUser(peerId);
          username = user.username;
        } catch {}

        const lastStored = await loadMessages(peerId, 1);
        const lastMsg = lastStored[0];

        chatsRef.current.set(peerId, {
          userId: peerId,
          username,
          lastMessage: lastMsg?.system ? 'Session Established' : '', // расшифровывать не будем
          lastActivity: lastTimestamp,
          unreadCount: 0,
        });
      }
      forceUpdateChats();
      console.log('chats loaded:', Array.from(chatsRef.current.values()));
    })();
  }, [me]);

  const ctx: ChatContextType = useMemo(
    () => ({
      chats: chatsRef.current,
      activeMessages,
      currentChatId,
      openChat,
      sendMessage,
      loadMoreHistory,
      handleIncomingMessage,
      addChat,
    }),
    [
      chatsVersion, // добавь
      activeMessages,
      currentChatId,
      openChat,
      sendMessage,
      loadMoreHistory,
      handleIncomingMessage,
      addChat,
    ],
  );

  return <ChatContext.Provider value={ctx}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextType {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
}
