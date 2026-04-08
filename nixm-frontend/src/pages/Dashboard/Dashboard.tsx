import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/AuthContext';

// ── Mock data ──────────────────────────────────────────────────────────────────

interface Chat {
  id: number;
  username: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface Message {
  id: number;
  fromMe: boolean;
  text: string;
  time: string;
}

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

// ── Sub-components ─────────────────────────────────────────────────────────────

const OnlineDot = ({ online }: { online: boolean }) => (
  <span
    className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-background ${
      online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
    }`}
  />
);

const ChatItem = ({
  chat,
  active,
  onClick,
}: {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
      active ? 'bg-secondary' : 'hover:bg-muted'
    }`}
  >
    <div className='relative shrink-0'>
      <Avatar className='w-8 h-8'>
        <AvatarFallback className='bg-secondary text-muted-foreground text-xs font-mono'>
          {chat.username[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <OnlineDot online={chat.online} />
    </div>
    <div className='flex-1 min-w-0'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-mono text-foreground truncate'>
          {chat.username}
        </span>
        <span className='text-[10px] text-muted-foreground/60 ml-2 shrink-0'>
          {chat.time}
        </span>
      </div>
      <p className='text-[11px] text-muted-foreground/60 truncate mt-0.5'>
        {chat.lastMessage}
      </p>
    </div>
    {chat.unread > 0 && (
      <Badge className='bg-secondary text-foreground text-[10px] px-1.5 py-0 font-mono shrink-0'>
        {chat.unread}
      </Badge>
    )}
  </button>
);

const SearchBar = ({
  placeholder = 'search users...',
  value,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
}) => (
  <div className='relative'>
    <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs font-mono select-none'>
      /
    </span>
    <Input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className='pl-6 h-8 bg-muted border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-xs rounded-md focus-visible:ring-0 focus-visible:border-muted-foreground/40'
      placeholder={placeholder}
    />
  </div>
);

// ── Sidebar ────────────────────────────────────────────────────────────────────

const Sidebar = ({
  chats,
  activeId,
  onSelect,
}: {
  chats: Chat[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) => {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? chats.filter(c => c.username.toLowerCase().includes(query.toLowerCase()))
    : chats;

  return (
    <aside className='w-64 shrink-0 flex flex-col border-r border-border h-full'>
      <div className='p-3 border-b border-border'>
        <div className='flex items-center justify-between mb-3'>
          <span className='text-xs font-mono text-muted-foreground tracking-widest uppercase'>
            nixm
          </span>
          <span className='text-[10px] font-mono text-muted-foreground/40'>
            v0.1
          </span>
        </div>
        <SearchBar value={query} onChange={setQuery} />
      </div>
      <div className='flex-1 overflow-y-auto p-2 space-y-0.5'>
        {filtered.length > 0 ? (
          filtered.map(chat => (
            <ChatItem
              key={chat.id}
              chat={chat}
              active={chat.id === activeId}
              onClick={() => onSelect(chat.id)}
            />
          ))
        ) : (
          <p className='text-[11px] text-muted-foreground/40 font-mono px-3 py-4'>
            no results
          </p>
        )}
      </div>
      <div className='p-3 border-t border-border'>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <Avatar className='w-6 h-6'>
              <AvatarFallback className='bg-secondary text-muted-foreground text-[10px] font-mono'>
                M
              </AvatarFallback>
            </Avatar>
            <OnlineDot online={true} />
          </div>
          <span className='text-xs font-mono text-muted-foreground'>
            me@nixm
          </span>
        </div>
      </div>
    </aside>
  );
};

// ── Empty state ────────────────────────────────────────────────────────────────

const EmptyState = () => (
  <div className='flex-1 flex flex-col items-center justify-center gap-3 select-none'>
    <div className='font-mono text-sm space-y-1 text-center'>
      <p className='text-muted-foreground'>{'>'} no channel selected</p>
      <p className='text-muted-foreground/50'>pick a conversation or</p>
      <p className='text-muted-foreground/50'>
        search for someone to start one
      </p>
    </div>
  </div>
);

// ── Chat view ──────────────────────────────────────────────────────────────────

const ChatView = ({
  chat,
  messages,
  onOpenOverlay,
}: {
  chat: Chat;
  messages: Message[];
  onOpenOverlay: () => void;
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className='flex-1 flex flex-col h-full min-w-0'>
      <div className='flex items-center justify-between px-4 py-3 border-b border-border shrink-0'>
        <div className='flex items-center gap-3'>
          <div className='relative'>
            <Avatar className='w-7 h-7'>
              <AvatarFallback className='bg-secondary text-muted-foreground text-xs font-mono'>
                {chat.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <OnlineDot online={chat.online} />
          </div>
          <div>
            <p className='text-xs font-mono text-foreground'>{chat.username}</p>
            <p className='text-[10px] font-mono text-muted-foreground/60'>
              {chat.online ? 'online' : 'offline'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenOverlay}
          className='text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors border border-border hover:border-muted-foreground/40 px-2 py-1 rounded'
        >
          chats ↗
        </button>
      </div>

      <div className='flex-1 overflow-y-auto py-4'>
        <div className='max-w-2xl mx-auto px-4 space-y-2'>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-sm px-3 py-2 rounded text-xs font-mono ${
                  msg.fromMe
                    ? 'bg-secondary text-foreground'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                <p>{msg.text}</p>
                <p className='text-[10px] text-muted-foreground/50 mt-1 text-right'>
                  {msg.time}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className='px-4 py-3 border-t border-border shrink-0'>
        <div className='flex gap-2 items-center'>
          <span className='text-muted-foreground/40 font-mono text-xs shrink-0'>
            {'>'}
          </span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setInput('')}
            placeholder='type a message...'
            className='flex-1 bg-transparent border-none outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/30'
          />
          <span className='text-[10px] font-mono text-muted-foreground/30 shrink-0'>
            e2e
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Overlay ────────────────────────────────────────────────────────────────────

const ChatsOverlay = ({
  chats,
  activeId,
  onSelect,
  onClose,
}: {
  chats: Chat[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? chats.filter(c => c.username.toLowerCase().includes(query.toLowerCase()))
    : chats;

  return (
    <div
      className='absolute inset-0 z-50 flex items-start justify-end'
      onClick={onClose}
    >
      <div className='absolute inset-0 bg-background/60 backdrop-blur-sm' />
      <div
        className='relative w-72 h-full bg-background/95 border-l border-border flex flex-col'
        onClick={e => e.stopPropagation()}
      >
        <div className='p-3 border-b border-border'>
          <div className='flex items-center justify-between mb-3'>
            <span className='text-[10px] font-mono text-muted-foreground/60 tracking-widest uppercase'>
              conversations
            </span>
            <button
              onClick={onClose}
              className='text-muted-foreground/60 hover:text-muted-foreground font-mono text-xs transition-colors'
            >
              ✕
            </button>
          </div>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder='search users...'
          />
        </div>
        <div className='flex-1 overflow-y-auto p-2 space-y-0.5'>
          {filtered.length > 0 ? (
            filtered.map(chat => (
              <ChatItem
                key={chat.id}
                chat={chat}
                active={chat.id === activeId}
                onClick={() => {
                  onSelect(chat.id);
                  onClose();
                }}
              />
            ))
          ) : (
            <p className='text-[11px] text-muted-foreground/40 font-mono px-3 py-4'>
              no results
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Dashboard ──────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [wsInput, setWsInput] = useState('');
  const { token } = useAuth();
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
