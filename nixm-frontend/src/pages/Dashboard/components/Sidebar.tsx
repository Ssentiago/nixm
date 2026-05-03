import { Chat } from '@/pages/Dashboard/typing/definitions';
import { useState } from 'react';
import { SearchBar } from '@/pages/Dashboard/components/SearchBar';
import { ChatItem } from '@/pages/Dashboard/components/ChatItem';
import { useAuth } from '@/hooks/AuthContext';
import { FaGear, FaArrowRightFromBracket, FaBell } from 'react-icons/fa6';
import { Settings } from './Settings/Settings';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/NotificationContext';
import { NotificationsPanel } from '@/pages/Dashboard/components/NotificationsPanel';
import { API_BASE } from '@/core/utils/config';

export const Sidebar = ({
  chats,
  activeId,
  onSelect,
}: {
  chats: Chat[];
  activeId: string | null;
  onSelect: (userId: string, username: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? chats.filter(c => c.username.toLowerCase().includes(query.toLowerCase()))
    : chats;
  const { notifications } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const { myProfile, logout } = useAuth();
  const [openSettings, setOpenSettings] = useState(false);

  return (
    <aside className='w-72 shrink-0 flex flex-col border-r border-border h-full'>
      <div className='p-3 border-b border-border'>
        <div className='flex items-center justify-between mb-3'>
          <span className='text-sm font-mono text-muted-foreground tracking-widest'>
            nixm
          </span>
          <span className='text-[10px] font-mono text-muted-foreground/40'>
            {__APP_VERSION__}
          </span>
        </div>
        <SearchBar value={query} onChange={setQuery} />
      </div>
      <div className='flex-1 overflow-y-auto p-2 space-y-0.5'>
        {filtered.length > 0 ? (
          filtered.map(chat => (
            <ChatItem
              key={chat.peerId}
              chat={chat}
              active={chat.peerId === activeId}
              onClick={() => onSelect(chat.peerId, chat.username)}
            />
          ))
        ) : (
          <p className='text-[11px] text-muted-foreground/40 font-mono px-3 py-4'>
            no results
          </p>
        )}
      </div>
      <div className='p-3 border-t border-border'>
        <div className='relative'>
          {showNotifications && (
            <NotificationsPanel onClose={() => setShowNotifications(false)} />
          )}
          <div className='flex items-center gap-2'>
            <Avatar className='w-6 h-6'>
              {myProfile?.avatar_url && (
                <AvatarImage
                  src={`${API_BASE}${myProfile.avatar_url}`}
                  alt={myProfile.username}
                  className='object-cover rounded-full'
                />
              )}
              <AvatarFallback className='bg-secondary text-muted-foreground text-[10px] font-mono'>
                {myProfile?.username?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <span className='text-xs font-mono text-muted-foreground '>
              {myProfile?.username ?? 'unknown'}
            </span>
            {import.meta.env.DEV && (
              <span className='text-xs font-mono text-muted-foreground'>
                {myProfile?.id ?? 'unknown'}
              </span>
            )}

            <div className='ml-auto flex items-center gap-1'>
              <button
                onClick={() => setShowNotifications(v => !v)}
                className='relative p-1 hover:bg-muted rounded-md transition-colors'
              >
                <FaBell className='w-3.5 h-3.5' />
                {notifications.length > 0 && (
                  <span className='absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] font-mono text-white flex items-center justify-center'>
                    {notifications.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setOpenSettings(true)}
                className='p-1 hover:bg-muted rounded-md transition-colors'
              >
                <FaGear size={16} />
              </button>
              <button onClick={logout} title={'Logout'}>
                <FaArrowRightFromBracket />
              </button>
            </div>
          </div>
        </div>
      </div>
      <Settings open={openSettings} onClose={() => setOpenSettings(false)} />
    </aside>
  );
};
