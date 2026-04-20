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
import { arrayBufferToBase64, base64ToUint8Array } from '@/lib/crypto';
import { api } from '@/lib/api/api';
import { ws } from '@/lib/websocket/service';
import { db } from '@/lib/db';
import { ChatRecord, StoredMessage } from '@/lib/db/typing/definitions';
import { IncomingMessage, MSG_DATA } from '@/lib/websocket/typing/definitions';
import { logger } from '@/lib/logger';

type ChatMessage = {
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
  status: StoredMessage['status'];
  direction: 'sent' | 'received';
  isSystem?: boolean;
};

type ChatMeta = {
  peerId: string;
  username: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

type ChatContextType = {
  chats: Map<string, ChatMeta>;
  activeMessages: ChatMessage[];
  currentChatId: string | null;
  openChat: (peerId: string, username: string) => Promise<void>;
  sendMessage: (peerId: string, text: string) => Promise<void>;
  loadMoreHistory: (
    peerId: string,
    cursor: number,
  ) => Promise<{ hasMore: boolean }>;
  handleIncomingMessage: (wsData: IncomingMessage) => Promise<void>;
  addChat: (peerId: string, username: string) => void;
};

const useChatsRegistry = (profile: ReturnType<typeof useAuth>['myProfile']) => {
  const chatsRef = useRef<Map<string, ChatMeta>>(new Map());
  const [chatsVersion, setChatsVersion] = useState(0);
  const forceUpdate = useCallback(() => setChatsVersion(v => v + 1), []);

  const addChat = useCallback(
    async (peerId: string, username: string) => {
      if (chatsRef.current.has(peerId)) return;

      logger.info('ChatRegistry: creating new chat session', {
        peerId,
        username,
      });
      const record: ChatRecord = {
        peerId,
        username,
        lastMessage: 'Session Established',
        lastActivity: Date.now(),
        unreadCount: 1,
      };

      await db.chats.save(record);
      chatsRef.current.set(peerId, { ...record, peerId });
      forceUpdate();
    },
    [forceUpdate],
  );

  const markAsRead = useCallback(
    (peerId: string, username: string) => {
      logger.debug('ChatRegistry: marking chat as read', { peerId });
      const meta = chatsRef.current.get(peerId);
      chatsRef.current.set(peerId, {
        peerId,
        username,
        lastMessage: meta?.lastMessage ?? '',
        lastActivity: meta?.lastActivity ?? Date.now(),
        unreadCount: 0,
      });
      forceUpdate();
    },
    [forceUpdate],
  );

  const updateLastMessage = useCallback(
    async (
      peerId: string,
      username: string,
      text: string,
      timestamp: number,
      isCurrentChat: boolean,
      currentUnread: number,
    ) => {
      logger.debug('ChatRegistry: updating last message', {
        peerId,
        isCurrentChat,
      });
      const chatRecord: ChatRecord = {
        peerId,
        username,
        lastMessage: text,
        lastActivity: timestamp,
        unreadCount: isCurrentChat ? 0 : currentUnread + 1,
      };
      chatsRef.current.set(peerId, chatRecord);
      await db.chats.save(chatRecord);
      forceUpdate();
    },
    [forceUpdate],
  );

  useEffect(() => {
    if (!profile) return;
    (async () => {
      logger.debug('ChatRegistry: hydrating chats from DB');
      const saved = await db.chats.getAll();
      for (const record of saved) {
        if (chatsRef.current.has(record.peerId)) continue;
        chatsRef.current.set(record.peerId, {
          peerId: record.peerId,
          username: record.username,
          lastMessage: record.lastMessage,
          lastActivity: record.lastActivity,
          unreadCount: record.unreadCount,
        });
      }
      forceUpdate();
    })();
  }, [profile, forceUpdate]);

  return { chatsRef, addChat, markAsRead, updateLastMessage };
};

const useActiveChat = () => {
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const currentChatIdRef = useRef<string | null>(null);

  const setActive = useCallback((peerId: string) => {
    logger.debug('ActiveChat: switching context', { peerId });
    setCurrentChatId(peerId);
    currentChatIdRef.current = peerId;
  }, []);

  return {
    currentChatId,
    currentChatIdRef,
    activeMessages,
    setActive,
    setMessages: setActiveMessages,
    appendMessage: (msg: ChatMessage) =>
      setActiveMessages(prev => [...prev, msg]),
    prependMessages: (msgs: ChatMessage[]) =>
      setActiveMessages(prev => [...msgs, ...prev]),
  };
};

const useMessageHistory = (
  myDeviceId: string | null,
  decryptMessage: ReturnType<typeof useCryptoContext>['decryptMessage'],
  profile: ReturnType<typeof useAuth>['myProfile'],
) => {
  const decryptBatch = useCallback(
    async (stored: StoredMessage[]): Promise<ChatMessage[]> => {
      if (!myDeviceId) return [];
      logger.debug('History: decrypting batch', { count: stored.length });

      const results: ChatMessage[] = [];
      for (const msg of stored) {
        if (msg.system) {
          results.push({ ...msg, text: msg.ciphertext, isSystem: true });
          continue;
        }
        try {
          const peerId = msg.direction === 'received' ? msg.from : msg.to;
          const text = await decryptMessage(peerId, myDeviceId, {
            iv: msg.iv,
            data: msg.ciphertext,
          });
          results.push({ ...msg, text });
        } catch (e) {
          logger.warn('History: failed to decrypt message in batch', {
            mid: msg.messageId,
          });
        }
      }
      return results;
    },
    [myDeviceId, decryptMessage],
  );

  const load = useCallback(
    async (peerId: string): Promise<ChatMessage[]> => {
      logger.debug('History: loading for peer', { peerId });
      let stored = await db.messages.load(peerId, 50);

      if (stored.length === 0 && myDeviceId && profile) {
        logger.info('History: local cache empty, fetching from server', {
          peerId,
        });
        try {
          const remote = await api.messages.getHistory(peerId, myDeviceId);
          for (const msg of remote) {
            await db.messages.save({
              messageId: msg.messageId,
              from: msg.from,
              to: msg.to,
              peerId: msg.from === String(profile.id) ? msg.to : msg.from,
              direction: msg.from === String(profile.id) ? 'sent' : 'received',
              ciphertext: msg.ciphertext,
              iv: msg.iv,
              timestamp: msg.timestamp,
              status: 'delivered',
            });
          }
          stored = await db.messages.load(peerId, 50);
        } catch (e) {
          logger.error('History: server sync failed', {
            peerId,
            error: String(e),
          });
        }
      }

      return decryptBatch(stored);
    },
    [decryptBatch, myDeviceId, profile],
  );

  return { load, decryptBatch };
};

const useMessageIO = (
  profile: ReturnType<typeof useAuth>['myProfile'],
  myDeviceId: string | null,
  encryptMessage: ReturnType<typeof useCryptoContext>['encryptMessage'],
  decryptMessage: ReturnType<typeof useCryptoContext>['decryptMessage'],
  registry: ReturnType<typeof useChatsRegistry>,
  active: ReturnType<typeof useActiveChat>,
) => {
  const sendMessage = useCallback(
    async (peerId: string, text: string) => {
      // Предпроверка без throw
      if (!profile?.id || !myDeviceId) {
        logger.error('IO: missing auth or deviceId', {
          profileId: profile?.id,
          myDeviceId,
        });
        return;
      }

      const messageId = crypto.randomUUID();
      const timestamp = Date.now();

      // 1. ШИФРОВАНИЕ
      let encrypted;
      try {
        encrypted = await encryptMessage(peerId, text);
        logger.debug('IO: encryption done', {
          mid: messageId,
          devices: encrypted.length,
        });
      } catch (e) {
        logger.error('IO: encryption error', {
          mid: messageId,
          error: String(e),
        });
        return; // Дальше идти нет смысла
      }

      // 2. СОХРАНЕНИЕ (IndexedDB)
      try {
        const myPayload =
          encrypted.find(e => e.deviceId === myDeviceId) ?? encrypted[0];
        await db.messages.save({
          messageId,
          from: profile.id,
          to: peerId,
          peerId,
          direction: 'sent',
          ciphertext: myPayload.encryptedPayload.data,
          iv: myPayload.encryptedPayload.iv,
          timestamp,
          status: 'pending',
        });
        logger.debug('IO: local save ok', { mid: messageId });
      } catch (e) {
        logger.error('IO: local save error', {
          mid: messageId,
          error: String(e),
        });
      }

      // 3. ОТПРАВКА (Network)
      try {
        ws.send({
          type: MSG_DATA,
          to: BigInt(peerId),
          messageId,
          timestamp,
          payloads: encrypted.map(({ deviceId, encryptedPayload }) => ({
            device_id: deviceId,
            iv: base64ToUint8Array(encryptedPayload.iv),
            ciphertext: base64ToUint8Array(encryptedPayload.data),
          })),
        });
        logger.info('IO: network dispatch ok', { mid: messageId });
      } catch (e) {
        logger.error('IO: network dispatch error', {
          mid: messageId,
          error: String(e),
        });
      }

      // 4. ИНТЕРФЕЙС
      if (active.currentChatIdRef.current === peerId) {
        active.appendMessage({
          messageId,
          from: String(profile.id),
          text,
          timestamp,
          status: 'pending',
          direction: 'sent',
        });
      }
    },
    [profile, myDeviceId, encryptMessage, active],
  );

  const handleIncomingMessage = useCallback(
    async (wsData: IncomingMessage) => {
      if (wsData.type !== MSG_DATA || !myDeviceId) return;

      const messageId = wsData.messageId;
      if (await db.messages.exists(messageId)) {
        logger.debug('IO: skipping duplicate message', { mid: messageId });
        return;
      }

      const fromId = String(wsData.from);
      const ivBase64 = arrayBufferToBase64(wsData.iv);
      const timestamp = wsData.timestamp ?? Date.now();
      const ciphertextBase64 = arrayBufferToBase64(wsData.ciphertext);

      logger.info('IO: received new message', { fromId, mid: messageId });

      await db.messages.save({
        messageId,
        from: fromId,
        to: profile ? String(profile.id) : '',
        peerId: fromId,
        direction: 'received',
        ciphertext: ciphertextBase64,
        iv: ivBase64,
        timestamp,
        status: 'delivered',
      });

      try {
        const text = await decryptMessage(fromId, myDeviceId, {
          iv: ivBase64,
          data: ciphertextBase64,
        });

        if (active.currentChatIdRef.current === fromId) {
          active.appendMessage({
            messageId,
            from: fromId,
            text,
            timestamp,
            status: 'delivered',
            direction: 'received',
          });
        }

        const prev = registry.chatsRef.current.get(fromId);
        let username = prev?.username;
        if (!username) {
          const user = await api.users.getUser(fromId);
          username = user.username;
        }

        registry.updateLastMessage(
          fromId,
          username,
          text,
          timestamp,
          active.currentChatIdRef.current === fromId,
          prev?.unreadCount ?? 0,
        );
      } catch (e) {
        logger.warn('IO: received message but decryption failed', {
          mid: messageId,
        });
      }
    },
    [myDeviceId, profile, decryptMessage, active, registry],
  );

  return { sendMessage, handleIncomingMessage };
};

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatContextProvider({ children }: { children: ReactNode }) {
  const { myProfile } = useAuth();
  const { encryptMessage, decryptMessage, myDeviceId } = useCryptoContext();

  const registry = useChatsRegistry(myProfile);
  const active = useActiveChat();
  const history = useMessageHistory(myDeviceId, decryptMessage, myProfile);
  const io = useMessageIO(
    myProfile,
    myDeviceId,
    encryptMessage,
    decryptMessage,
    registry,
    active,
  );

  const openChat = useCallback(
    async (peerId: string, username: string) => {
      logger.info('ChatContext: opening chat', { peerId, username });
      registry.markAsRead(peerId, username);
      active.setActive(peerId);
      const messages = await history.load(peerId);
      active.setMessages(messages);
    },
    [active, history, registry],
  );

  const loadMoreHistory = useCallback(
    async (peerId: string, cursor: number) => {
      logger.debug('ChatContext: fetching older messages', { peerId, cursor });
      const stored = await db.messages.load(peerId, 50, cursor);
      if (stored.length === 0) return { hasMore: false };
      const decrypted = await history.decryptBatch(stored);
      active.prependMessages(decrypted);
      return { hasMore: stored.length === 50 };
    },
    [active, history],
  );

  const ctx = useMemo<ChatContextType>(
    () => ({
      chats: registry.chatsRef.current,
      activeMessages: active.activeMessages,
      currentChatId: active.currentChatId,
      openChat,
      sendMessage: io.sendMessage,
      loadMoreHistory,
      handleIncomingMessage: io.handleIncomingMessage,
      addChat: registry.addChat,
    }),
    [
      active.activeMessages,
      active.currentChatId,
      openChat,
      loadMoreHistory,
      io.sendMessage,
      io.handleIncomingMessage,
      registry.addChat,
      registry.chatsRef.current,
    ],
  );

  return <ChatContext.Provider value={ctx}>{children}</ChatContext.Provider>;
}

export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
};
