import { Chat } from '@/pages/Dashboard/typing/definitions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export const ChatItem = ({
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
    className={`w-full flex items-center gap-3 px-3 py-3 rounded-sm text-left transition-colors ${
      active
        ? 'bg-accent border-l-2 border-l-foreground'
        : 'hover:bg-accent/50 border-l-2 border-l-transparent'
    }`}
  >
    <Avatar className='w-10 h-10 shrink-0'>
      <AvatarFallback className='bg-muted border border-border text-foreground text-sm font-mono text-normal'>
        {chat.username[0].toUpperCase()}
      </AvatarFallback>
    </Avatar>
    <div className='flex-1 min-w-0'>
      <div className='flex items-center justify-between'>
        <span
          className={`text-sm font-mono truncate text-normal ${active ? 'text-foreground' : 'text-foreground/80'}`}
        >
          {chat.username}
        </span>
        <span className='text-xs text-muted-foreground ml-2 shrink-0'>
          {new Date(chat.lastActivity).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <p className='text-xs text-muted-foreground truncate mt-0.5 text-normal'>
        {chat.lastMessage}
      </p>
    </div>
    {chat.unreadCount > 0 && (
      <span className='bg-foreground text-background text-[10px] px-1.5 py-0.5 font-mono shrink-0 rounded-sm'>
        {chat.unreadCount}
      </span>
    )}
  </button>
);
