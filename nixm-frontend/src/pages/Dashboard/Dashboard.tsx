import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { useChatContext } from '@/hooks/ChatContext';
import { Chat } from '@/pages/Dashboard/typing/definitions';
import { Sidebar } from '@/pages/Dashboard/components/Sidebar';
import { EmptyState } from '@/pages/Dashboard/components/EmptyState';
import { ChatView } from '@/pages/Dashboard/components/ChatView';
import { useNotifications } from '@/hooks/NotificationContext';
import { wsRouter } from '@/lib/websocket/router';
import {
  MSG_CHAT_ACCEPTED,
  MSG_CHAT_DECLINED,
  MSG_CHAT_REQUEST,
  MSG_DATA,
} from '@/lib/websocket/typing/definitions';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

const Dashboard = () => {
  const [isDeclined, setIsDeclined] = useState(false);
  const pendingPeerRef = useRef<{ id: number; username: string } | null>(null);

  const { myProfile } = useAuth();
  const {
    chats,
    currentChatId,
    setActive,
    openChat,
    handleIncomingMessage,
    addChat,
  } = useChatContext();
  const { addNotification } = useNotifications();
  const myProfileRef = useRef(myProfile);
  useEffect(() => {
    myProfileRef.current = myProfile;
  }, [myProfile]);

  const handlePeerResolved = (
    peer: { id: number; username: string } | null,
  ) => {
    pendingPeerRef.current = peer;
    setIsDeclined(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setActive(null);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    logger.info('Dashboard mounted, subscribing to WS events');

    const unsubChatRequest = wsRouter.on(MSG_CHAT_REQUEST, msg => {
      logger.info('Incoming chat request', {
        from: String(msg.from),
        username: msg.username,
      });
      addNotification({
        id: `chat_request_${msg.from}`,
        type: 'chat_request',
        from: msg.from,
        username: msg.username,
        avatar_url: msg.avatar_url,
        at: Date.now(),
      });
    });

    const unsubData = wsRouter.on(MSG_DATA, async msg => {
      logger.debug('Incoming MSG_DATA', { from: String(msg.from) });
      try {
        await handleIncomingMessage(msg);
      } catch (e) {
        logger.error('handleIncomingMessage failed', {
          error: String(e),
          from: String(msg.from),
        });
      }
    });

    const unsubAccepted = wsRouter.on(MSG_CHAT_ACCEPTED, async msg => {
      const peer = pendingPeerRef.current;
      const profile = myProfileRef.current; // ← ref, всегда актуальный

      logger.info('MSG_CHAT_ACCEPTED received', {
        from: String(msg.from),
        pendingPeerId: peer ? String(peer.id) : 'null',
        profile: profile ? String(profile.id) : 'null',
      });

      if (!peer) {
        logger.warn('MSG_CHAT_ACCEPTED but no pendingPeer');
        return;
      }
      if (Number(msg.from) !== peer.id) {
        logger.warn('MSG_CHAT_ACCEPTED from unexpected peer', {
          expected: String(peer.id),
          got: String(msg.from),
        });
        return;
      }

      pendingPeerRef.current = null;
      setIsDeclined(false);

      if (!profile) {
        logger.warn('MSG_CHAT_ACCEPTED but no myProfile');
        return;
      }

      try {
        await db.messages.save({
          messageId: `system-${peer.id}-${Date.now()}`,
          from: String(peer.id),
          to: String(profile.id),
          peerId: String(peer.id),
          direction: 'received',
          ciphertext: 'Session Established',
          iv: '',
          timestamp: Date.now(),
          status: 'delivered',
          system: true,
          senderDeviceId: '',
        });
      } catch (e) {
        logger.warn('Failed to save system message', { error: String(e) });
      }

      addChat(peer.id.toString(), peer.username);

      await openChat(peer.id.toString(), peer.username);
    });
    const unsubDeclined = wsRouter.on(MSG_CHAT_DECLINED, msg => {
      const peer = pendingPeerRef.current;
      logger.info('MSG_CHAT_DECLINED received', { from: String(msg.from) });
      if (!peer) return;
      if (Number(msg.from) !== peer.id) return;
      setIsDeclined(true);
    });

    return () => {
      logger.info('Dashboard unmounted, unsubscribing from WS events');
      unsubData();
      unsubChatRequest();
      unsubAccepted();
      unsubDeclined();
    };
  }, [handleIncomingMessage, openChat, addNotification]);

  const chatList: Chat[] = Array.from(chats.values()).sort(
    (a, b) => b.lastActivity - a.lastActivity,
  );

  const activeChat = currentChatId ? chats.get(currentChatId) : null;

  return (
    <div className='flex h-screen w-screen bg-background text-foreground overflow-hidden relative'>
      <Sidebar chats={chatList} activeId={currentChatId} onSelect={openChat} />

      {activeChat ? (
        <ChatView userId={activeChat.peerId} username={activeChat.username} />
      ) : (
        <EmptyState
          onPeerResolved={handlePeerResolved}
          isDeclined={isDeclined}
          onDeclinedReset={() => setIsDeclined(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
