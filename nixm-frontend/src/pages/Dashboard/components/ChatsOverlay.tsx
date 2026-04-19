import { Chat } from '@/pages/Dashboard/typing/definitions';
import { useState } from 'react';
import { SearchBar } from '@/pages/Dashboard/components/SearchBar';
import { ChatItem } from '@/pages/Dashboard/components/ChatItem';

export const ChatsOverlay = ({
  chats,
  activeId,
  onSelect,
  onClose,
}: {
  chats: Chat[];
  activeId: string | null;
  onSelect: (userId: string, username: string) => void;
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
                key={chat.userId}
                chat={chat}
                active={chat.userId === activeId}
                onClick={() => {
                  onSelect(chat.userId, chat.username);
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
