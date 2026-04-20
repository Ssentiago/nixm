import { useAuth } from '@/hooks/AuthContext';
import { ws } from '@/lib/websocket/service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/NotificationContext';
import { useChatContext } from '@/hooks/ChatContext';
import { api } from '@/lib/api/api';
import {
  MSG_CHAT_ACCEPTED,
  MSG_CHAT_DECLINED,
} from '@/lib/websocket/typing/definitions';
import { db } from '@/lib/db';

export const NotificationsPanel = ({ onClose }: { onClose: () => void }) => {
  const { notifications, removeNotification } = useNotifications();
  const { myProfile } = useAuth();
  const { addChat } = useChatContext();

  const handleAccept = async (
    from: number,
    fromUsername: string,
    id: string,
  ) => {
    if (!myProfile) return;

    ws.send({ type: MSG_CHAT_ACCEPTED, to: from });
    removeNotification(id);
    try {
      await db.messages.save({
        messageId: `system-${from}-${Date.now()}`,
        from: from.toString(),
        to: String(myProfile.id),
        peerId: from.toString(),
        direction: 'received',
        ciphertext: 'Session Established',
        iv: '',
        timestamp: Date.now(),
        status: 'delivered',
        system: true,
      });
      addChat(String(from), fromUsername);
    } catch (e) {
      console.warn('Failed to save system message', e);
    }
  };

  const handleDecline = (from: number, id: string) => {
    ws.send({ type: MSG_CHAT_DECLINED, to: from });
    removeNotification(id);
  };

  return (
    <div className='absolute bottom-12 left-0 w-72 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden'>
      <div className='flex items-center justify-between px-3 py-2 border-b border-border'>
        <span className='text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest'>
          notifications
        </span>
        <button
          onClick={onClose}
          className='text-muted-foreground/60 hover:text-muted-foreground text-xs font-mono'
        >
          ✕
        </button>
      </div>

      <div className='max-h-80 overflow-y-auto'>
        {notifications.length === 0 ? (
          <p className='text-[11px] font-mono text-muted-foreground/40 text-center py-6'>
            no notifications
          </p>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className='p-3 border-b border-border last:border-0'
            >
              {n.type === 'chat_request' && (
                <div className='flex items-center gap-3'>
                  <Avatar className='w-8 h-8 shrink-0'>
                    <AvatarImage src={`http://localhost:5900${n.avatar_url}`} />
                    <AvatarFallback className='bg-secondary text-muted-foreground text-xs font-mono'>
                      {n.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className='flex-1 min-w-0'>
                    <p className='text-xs font-mono text-foreground truncate'>
                      {n.username}
                    </p>
                    <p className='text-[10px] font-mono text-muted-foreground/60'>
                      wants to chat
                    </p>
                  </div>
                  <div className='flex gap-1 shrink-0'>
                    <button
                      onClick={() => handleAccept(n.from, n.username, n.id)}
                      className='px-2 py-1 text-[10px] font-mono border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors'
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => handleDecline(n.from, n.id)}
                      className='px-2 py-1 text-[10px] font-mono border border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-400 rounded transition-colors'
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
