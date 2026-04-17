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
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
      active ? 'bg-secondary' : 'hover:bg-muted'
    }`}
  >
    <Avatar className='w-8 h-8 shrink-0'>
      <AvatarFallback className='bg-secondary text-muted-foreground text-xs font-mono'>
        {chat.username[0].toUpperCase()}
      </AvatarFallback>
    </Avatar>
    <div className='flex-1 min-w-0'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-mono text-foreground truncate'>
          {chat.username}
        </span>
        <span className='text-[10px] text-muted-foreground/60 ml-2 shrink-0'>
          {new Date(chat.lastActivity).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <p className='text-[11px] text-muted-foreground/60 truncate mt-0.5'>
        {chat.lastMessage}
      </p>
    </div>
    {chat.unreadCount > 0 && (
      <Badge className='bg-secondary text-foreground text-[10px] px-1.5 py-0 font-mono shrink-0'>
        {chat.unreadCount}
      </Badge>
    )}
  </button>
);
