import { Chat } from '@/pages/Dashboard/typing/definitions';
import { useState } from 'react';
import { SearchBar } from '@/pages/Dashboard/components/SearchBar';
import { ChatItem } from '@/pages/Dashboard/components/ChatItem';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OnlineDot } from '@/pages/Dashboard/components/OnlineDot';
import { useAuth } from '@/hooks/AuthContext';
import { FaGear } from 'react-icons/fa6';
import { Settings } from './Settings';

export const Sidebar = ({
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

  const { me } = useAuth();
  const [openSettings, setOpenSettings] = useState(false);

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
            {me ? me.username : 'unknown'}
          </span>
          <button
            onClick={() => setOpenSettings(true)}
            className='ml-auto p-1 hover:bg-muted rounded-md transition-colors'
            title='Open settings'
          >
            <FaGear size={16} />
          </button>
        </div>
      </div>

      <Settings open={openSettings} onClose={() => setOpenSettings(false)} />
    </aside>
  );
};
