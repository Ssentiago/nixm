import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/AuthContext';
import { Chat, Message } from '@/pages/Dashboard/typing/definitions';
import { Sidebar } from '@/pages/Dashboard/components/Sidebar';
import { EmptyState } from '@/pages/Dashboard/components/EmptyState';
import { ChatView } from '@/pages/Dashboard/components/ChatView';
import { ChatsOverlay } from '@/pages/Dashboard/components/ChatsOverlay';

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_CHATS: Chat[] = [
  {
    id: 1,
    username: 'ghost_404',
    lastMessage: 'see you on the other side',
    time: '23:41',
    unread: 2,
    online: true,
  },
  {
    id: 2,
    username: 'null_ptr',
    lastMessage: 'did you get my key?',
    time: '22:15',
    unread: 0,
    online: false,
  },
  {
    id: 3,
    username: '_xor_',
    lastMessage: 'ok',
    time: '21:03',
    unread: 0,
    online: true,
  },
  {
    id: 4,
    username: 'anon_7f3a',
    lastMessage: 'never mind',
    time: '20:58',
    unread: 5,
    online: false,
  },
  {
    id: 5,
    username: 'root@void',
    lastMessage: '/dev/null',
    time: '18:30',
    unread: 0,
    online: true,
  },
  {
    id: 6,
    username: 'cipher_nine',
    lastMessage: 'encrypted.',
    time: '17:12',
    unread: 1,
    online: false,
  },
];

const MOCK_MESSAGES: Message[] = [
  { id: 1, fromMe: false, text: 'hey. you there?', time: '22:01' },
  { id: 2, fromMe: true, text: "yeah. what's up", time: '22:03' },
  {
    id: 3,
    fromMe: false,
    text: 'need to send you something. stand by.',
    time: '22:04',
  },
  { id: 4, fromMe: false, text: 'did you get my key?', time: '22:05' },
  { id: 5, fromMe: true, text: 'checking...', time: '22:06' },
  { id: 6, fromMe: true, text: 'yeah got it. looks good.', time: '22:08' },
  { id: 7, fromMe: false, text: "good. don't share it.", time: '22:09' },
  { id: 8, fromMe: true, text: 'obviously', time: '22:10' },
  {
    id: 9,
    fromMe: false,
    text: 'this channel deletes in 24h btw',
    time: '22:14',
  },
  { id: 10, fromMe: true, text: 'noted', time: '22:15' },
];

const Dashboard = () => {
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [wsInput, setWsInput] = useState('');
  const { token, user } = useAuth();
  const { messages, send, connected } = useWebSocket(token);

  const activeChat = MOCK_CHATS.find(c => c.id === activeChatId) ?? null;

  return (
    <div className='flex h-screen w-screen bg-background text-foreground overflow-hidden relative'>
      {!activeChat && (
        <Sidebar
          chats={MOCK_CHATS}
          activeId={activeChatId}
          onSelect={setActiveChatId}
        />
      )}

      {activeChat ? (
        <ChatView
          chat={activeChat}
          messages={MOCK_MESSAGES}
          onOpenOverlay={() => setOverlayOpen(true)}
        />
      ) : (
        <EmptyState />
      )}

      <div className='fixed bottom-4 right-4 w-72 bg-muted border border-border rounded-md p-3 space-y-2 z-50'>
        <div className='flex items-center justify-between'>
          <span className='text-[10px] font-mono text-muted-foreground uppercase tracking-widest'>
            ws debug
          </span>
          <span
            className={`text-[10px] font-mono ${connected ? 'text-emerald-500' : 'text-muted-foreground/40'}`}
          >
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>
        <div className='h-32 overflow-y-auto space-y-1'>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-[11px] font-mono ${msg.fromMe ? 'text-foreground text-right' : 'text-muted-foreground'}`}
            >
              <span className='text-muted-foreground/40 mr-1'>{msg.time}</span>
              {msg.fromMe ? '→' : '←'} {msg.text}
            </div>
          ))}
        </div>
        <div className='flex gap-2'>
          <input
            value={wsInput}
            onChange={e => setWsInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && wsInput.trim()) {
                send(wsInput.trim());
                setWsInput('');
              }
            }}
            placeholder='send message...'
            className='flex-1 bg-background border border-border rounded px-2 py-1 text-xs font-mono outline-none placeholder:text-muted-foreground/30'
          />
          <button
            onClick={() => {
              if (wsInput.trim()) {
                send(wsInput.trim());
                setWsInput('');
              }
            }}
            className='text-xs font-mono px-2 py-1 border border-border rounded hover:bg-secondary transition-colors'
          >
            →
          </button>
        </div>
      </div>

      {overlayOpen && (
        <ChatsOverlay
          chats={MOCK_CHATS}
          activeId={activeChatId}
          onSelect={setActiveChatId}
          onClose={() => setOverlayOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
