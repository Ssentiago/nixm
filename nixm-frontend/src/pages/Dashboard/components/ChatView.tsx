import { Chat, Message } from '@/pages/Dashboard/typing/definitions';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OnlineDot } from '@/pages/Dashboard/components/OnlineDot';

export const ChatView = ({
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
