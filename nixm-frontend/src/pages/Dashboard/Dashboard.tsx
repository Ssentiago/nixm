import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { useChatContext } from '@/hooks/ChatContext';
import { Chat } from '@/pages/Dashboard/typing/definitions';
import { Sidebar } from '@/pages/Dashboard/components/Sidebar';
import { EmptyState } from '@/pages/Dashboard/components/EmptyState';
import { ChatView } from '@/pages/Dashboard/components/ChatView';
import { ChatsOverlay } from '@/pages/Dashboard/components/ChatsOverlay';
import { ws } from '@/lib/websocket/service';
import { useNotifications } from '@/hooks/NotificationContext';
import { wsRouter } from '@/lib/websocket/router';
import { MSG_CHAT_REQUEST, MSG_DATA } from '@/lib/websocket/typing/definitions';

const Dashboard = () => {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const { myProfile } = useAuth();
  const { chats, currentChatId, openChat, handleIncomingMessage } =
    useChatContext();
  const { addNotification } = useNotifications();

  useEffect(() => {
    const unsubChatRequest = wsRouter.on(MSG_CHAT_REQUEST, msg => {
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
      await handleIncomingMessage(msg);
    });
    return () => {
      unsubData();
      unsubChatRequest();
    };
  }, [handleIncomingMessage]);

  // Преобразуем Map<string, ChatMeta> в массив для рендера
  const chatList: Chat[] = Array.from(chats.values()).sort(
    (a, b) => b.lastActivity - a.lastActivity,
  );

  const activeChat = currentChatId ? chats.get(currentChatId) : null;

  return (
    <div className='flex h-screen w-screen bg-background text-foreground overflow-hidden relative'>
      {!activeChat && (
        <Sidebar
          chats={chatList}
          activeId={currentChatId}
          onSelect={openChat}
        />
      )}

      {activeChat ? (
        <ChatView
          userId={activeChat.peerId}
          username={activeChat.username}
          onOpenOverlay={() => setOverlayOpen(true)}
        />
      ) : (
        <EmptyState />
      )}

      {overlayOpen && (
        <ChatsOverlay
          chats={chatList}
          activeId={currentChatId}
          onSelect={openChat}
          onClose={() => setOverlayOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
