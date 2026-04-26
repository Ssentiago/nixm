import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useChatContext } from '@/hooks/ChatContext';

export const ChatView = ({
  userId,
  username,
  onOpenOverlay,
}: {
  userId: string;
  username: string;
  onOpenOverlay: () => void;
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const { activeMessages, sendMessage, loadMoreHistory } = useChatContext();

  // Автопрокрутка вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(userId, text);
  };

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Если доскроллили до верха — грузим историю
    if (el.scrollTop === 0 && activeMessages.length > 0) {
      await loadMoreHistory(userId, activeMessages[0].timestamp);
    }
  };

  return (
    <div className='flex-1 flex flex-col h-full min-w-0 bg-background'>
      {/* Header */}
      <div className='flex items-center justify-between px-4 py-3 border-b border-border shrink-0'>
        <div className='flex items-center gap-3'>
          <Avatar className='w-7 h-7 border border-border'>
            <AvatarFallback className='bg-secondary text-muted-foreground text-[10px] font-mono'>
              {username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className='text-xs font-mono text-foreground tracking-tight'>
            {username}
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <button
            onClick={onOpenOverlay}
            className='text-[10px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors border border-border px-2 py-1 rounded bg-muted/30'
          >
            chats ↗
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        className='flex-1 overflow-y-auto py-6 custom-scrollbar'
        onScroll={handleScroll}
      >
        <div className='max-w-2xl mx-auto px-4 space-y-4'>
          {activeMessages.map(msg => {
            // --- СИСТЕМНОЕ СООБЩЕНИЕ ---
            if (msg.from === 'system') {
              return (
                <div
                  key={msg.messageId}
                  className='flex flex-col items-center py-8 space-y-2'
                >
                  <div className='h-[1px] w-16 bg-gradient-to-r from-transparent via-border to-transparent' />
                  <div className='text-center'>
                    <p className='text-[10px] font-mono text-emerald-500/60 uppercase tracking-[0.2em]'>
                      {msg.text}
                    </p>
                    <p className='text-[9px] font-mono text-muted-foreground/30 mt-1'>
                      {new Date(msg.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            }

            // --- ОБЫЧНОЕ СООБЩЕНИЕ ---
            const isSent = msg.direction === 'sent';
            return (
              <div
                key={msg.messageId}
                className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`group relative max-w-[85%] px-3 py-2 rounded font-mono text-xs transition-all ${
                    isSent
                      ? 'bg-secondary text-foreground rounded-tr-none'
                      : 'bg-muted/50 text-muted-foreground border border-border rounded-tl-none'
                  }`}
                >
                  <p
                    className={`leading-relaxed ${!msg.text ? 'italic opacity-40 text-[10px] break-all' : ''}`}
                  >
                    {msg.text || `cipher_null: ${msg.messageId.slice(0, 8)}...`}
                  </p>

                  <div
                    className={`flex items-center gap-1.5 mt-1.5 opacity-40 text-[9px] ${isSent ? 'justify-end' : 'justify-start'}`}
                  >
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isSent && (
                      <span className='text-[10px]'>
                        {msg.status === 'pending' && '○'}
                        {msg.status === 'sent' && '✓'}
                        {msg.status === 'delivered' && '✓✓'}
                        {msg.status === 'read' && '✓✓'}
                        {msg.status === 'failed' && '✗'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} className='h-2' />
        </div>
      </div>

      {/* Input Area */}
      <div className='px-4 py-4 border-t border-border bg-background/50 backdrop-blur-sm'>
        <div className='max-w-2xl mx-auto flex gap-3 items-center bg-muted/30 border border-border rounded-lg px-4 py-2 focus-within:border-muted-foreground/30 transition-colors'>
          <span className='text-muted-foreground/40 font-mono text-xs select-none'>
            {'>'}
          </span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder='secure message...'
            className='flex-1 bg-transparent border-none outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/20'
          />
          <div className='flex items-center gap-2'>
            <span className='hidden sm:block text-[9px] font-mono text-emerald-500/40 uppercase tracking-tighter'>
              aes-256-gcm
            </span>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className='text-muted-foreground/40 hover:text-foreground disabled:opacity-0 transition-all'
            >
              <span className='text-xs'>↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
