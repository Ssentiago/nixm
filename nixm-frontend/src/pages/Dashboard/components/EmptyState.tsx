import { useChatContext } from '@/hooks/ChatContext';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/api';
import { User } from '@/lib/api/modules/auth';
import { ws } from '@/lib/websocket/service';
import {
  MSG_CHAT_ACCEPTED,
  MSG_CHAT_DECLINED,
  MSG_CHAT_REQUEST,
} from '@/lib/websocket/protocol';
import { saveMessage } from '@/lib/db/messages';
import { useAuth } from '@/hooks/AuthContext';

export const EmptyState = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<User | null>(null);
  const [requested, setRequested] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);
  const { me } = useAuth();

  const { openChat } = useChatContext();

  useEffect(() => {
    // Подписываемся на сообщения только если у нас открыт чей-то профиль
    if (!profile) return;

    const unsub = ws.on('message', async msg => {
      if (!me) return;
      console.log(JSON.stringify(msg));
      if (!('from' in msg)) {
        return;
      }
      if (Number(msg.from) !== Number(profile.id)) {
        return;
      }

      switch (msg.type) {
        case MSG_CHAT_ACCEPTED:
          // Если Алиса приняла запрос — переходим в чат
          setRequested(false);

          try {
            await saveMessage({
              messageId: `system-${profile.id}-${Date.now()}`,
              from: String(profile.id),
              to: String(me?.id),
              peerId: String(profile.id),
              direction: 'received',
              ciphertext: 'Session Established',
              iv: '',
              timestamp: Date.now(),
              status: 'delivered',
              system: true,
            });
          } catch (e) {
            console.warn('Failed to save system message', e);
          }
          await openChat(profile.id, profile.username);
          break;

        case MSG_CHAT_DECLINED:
          // Если Алиса отклонила — показываем ошибку в UI
          setIsDeclined(true);
          setRequested(false);
          break;
      }
    });

    return () => unsub();
  }, [profile, openChat]);

  const handleResolve = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setProfile(null);
    setRequested(false);
    setIsDeclined(false);

    try {
      const user = await api.invites.resolve(trimmed);
      setProfile(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = () => {
    if (!profile) return;
    // Отправляем запрос через сокет
    ws.send({ type: MSG_CHAT_REQUEST, to: Number(profile.id) });
    setRequested(true);
    setIsDeclined(false);
  };

  const reset = () => {
    setProfile(null);
    setCode('');
    setError('');
    setIsDeclined(false);
    setRequested(false);
  };

  return (
    <div className='flex-1 flex flex-col items-center justify-center gap-6 select-none px-8'>
      {!profile ? (
        <>
          <div className='font-mono text-sm space-y-1 text-center'>
            <p className='text-muted-foreground'>no channel selected</p>
            <p className='text-muted-foreground/60 text-xs'>
              enter an invite code to start
            </p>
          </div>

          <div className='w-full max-w-xs space-y-2'>
            <div className='flex gap-2'>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleResolve()}
                placeholder='invite code...'
                className='flex-1 bg-muted border border-border rounded px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-muted-foreground/40'
              />
              <button
                onClick={handleResolve}
                disabled={loading || !code.trim()}
                className='px-3 py-2 text-xs font-mono border border-border rounded hover:bg-muted transition-colors disabled:opacity-50'
              >
                {loading ? '...' : '→'}
              </button>
            </div>
            {error && (
              <p className='text-[11px] font-mono text-red-400'>{error}</p>
            )}
          </div>
        </>
      ) : (
        <div className='w-full max-w-xs flex flex-col items-center gap-4'>
          {/* Аватарка */}
          <div className='w-20 h-20 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center'>
            {profile.avatar_url ? (
              <img
                src={`http://localhost:5900${profile.avatar_url}`}
                alt='avatar'
                className='w-full h-full object-cover'
              />
            ) : (
              <span className='text-2xl font-mono text-muted-foreground'>
                {profile.username[0].toUpperCase()}
              </span>
            )}
          </div>

          {/* Имя и Био */}
          <div className='text-center'>
            <p className='text-sm font-mono text-foreground'>
              {profile.username}
            </p>
            {profile.bio && (
              <p className='text-xs font-mono text-muted-foreground/60 mt-1'>
                {profile.bio}
              </p>
            )}
          </div>

          {/* Стейты кнопок */}
          <div className='w-full mt-2'>
            {isDeclined ? (
              <div className='flex flex-col items-center gap-2'>
                <p className='text-xs font-mono text-red-400'>
                  ✕ request declined
                </p>
                <button
                  onClick={handleRequest}
                  className='text-[10px] font-mono text-muted-foreground/60 border border-border/40 rounded px-2 py-1 hover:bg-muted hover:text-foreground transition-all'
                >
                  retry?
                </button>
              </div>
            ) : requested ? (
              <div className='flex flex-col items-center gap-1'>
                <p className='text-xs font-mono text-emerald-500 animate-pulse'>
                  ✓ request sent
                </p>
                <p className='text-[10px] font-mono text-muted-foreground/40'>
                  waiting for response...
                </p>
              </div>
            ) : (
              <button
                onClick={handleRequest}
                className='w-full py-2 text-xs font-mono border border-border rounded hover:bg-muted transition-colors active:scale-[0.98]'
              >
                request chat →
              </button>
            )}
          </div>

          <button
            onClick={reset}
            className='text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-4'
          >
            ← back
          </button>
        </div>
      )}
    </div>
  );
};
