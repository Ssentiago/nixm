import { useState } from 'react';
import { api, ApiError } from '@/lib/api/api';
import { User } from '@/lib/api/modules/users';
import { ws } from '@/lib/websocket/service';
import { MSG_CHAT_REQUEST } from '@/lib/websocket/typing/definitions';

interface Props {
  onPeerResolved: (peer: { id: number; username: string } | null) => void;
  isDeclined: boolean;
  onDeclinedReset: () => void;
}

export const EmptyState = ({
  onPeerResolved,
  isDeclined,
  onDeclinedReset,
}: Props) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [peerProfile, setPeerProfile] = useState<User | null>(null);
  const [requested, setRequested] = useState(false);

  const handleResolve = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setPeerProfile(null);
    setRequested(false);
    onPeerResolved(null);
    onDeclinedReset();

    try {
      const user = await api.invites.resolve(trimmed);
      setPeerProfile(user);
      onPeerResolved({ id: Number(user.id), username: user.username });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = () => {
    if (!peerProfile) return;
    ws.send({ type: MSG_CHAT_REQUEST, to: Number(peerProfile.id) });
    setRequested(true);
    onDeclinedReset();
  };

  const reset = () => {
    setPeerProfile(null);
    setCode('');
    setError('');
    setRequested(false);
    onPeerResolved(null);
    onDeclinedReset();
  };

  return (
    <div className='flex-1 flex flex-col items-center justify-center gap-6 select-none px-8'>
      {!peerProfile ? (
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
          <div className='w-20 h-20 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center'>
            {peerProfile.avatar_url ? (
              <img
                src={`http://localhost:5900${peerProfile.avatar_url}`}
                alt='avatar'
                className='w-full h-full object-cover'
              />
            ) : (
              <span className='text-2xl font-mono text-muted-foreground'>
                {peerProfile.username[0].toUpperCase()}
              </span>
            )}
          </div>

          <div className='text-center'>
            <p className='text-sm font-mono text-foreground'>
              {peerProfile.username}
            </p>
            {peerProfile.bio && (
              <p className='text-xs font-mono text-muted-foreground/60 mt-1'>
                {peerProfile.bio}
              </p>
            )}
          </div>

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
