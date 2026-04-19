import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '@/lib/api/api';

type Invite = {
  id: number;
  code: string;
  invite_type: 'one-time' | 'timed';
  expires_at: string | null;
  used: boolean;
  revoked: boolean;
  created_at: string;
};

export const InviteSection = () => {
  const [inviteType, setInviteType] = useState<'one-time' | 'timed'>(
    'one-time',
  );
  const [expiresIn, setExpiresIn] = useState(86400);
  const [inviteLink, setInviteLink] = useState('');
  const [generating, setGenerating] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const host = useRef(window.location.host);

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.invites.list();
      setInvites(data);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Failed to load invites';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const generateInviteLink = async () => {
    setGenerating(true);
    setError('');
    try {
      const newInvite = await api.invites.create({
        invite_type: inviteType,
        expires_in: inviteType === 'timed' ? expiresIn : undefined,
      });
      setInviteLink(newInvite.code);
      setInvites(prev => [newInvite, ...prev]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Failed to generate invite';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const revokeInvite = async (id: number) => {
    setError('');
    try {
      await api.invites.revoke(id);
      setInvites(prev =>
        prev.map(i =>
          i.id === id
            ? { ...i, revoked: true, expires_at: new Date().toISOString() }
            : i,
        ),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke invite');
    }
  };

  const deleteInvite = async (id: number) => {
    setError('');
    try {
      await api.invites.delete(id);
      setInvites(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete invite');
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) navigator.clipboard.writeText(inviteLink);
  };

  return (
    <div className='space-y-6'>
      {error && (
        <div className='p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono'>
          {error}
        </div>
      )}

      {/* Генератор */}
      <div>
        <h3 className='text-xs font-mono text-muted-foreground/60 uppercase tracking-widest mb-3'>
          invite link
        </h3>

        <div className='flex gap-2 mb-3'>
          <button
            onClick={() => setInviteType('one-time')}
            className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
              inviteType === 'one-time'
                ? 'bg-secondary text-foreground border-border'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            one-time
          </button>
          <button
            onClick={() => setInviteType('timed')}
            className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
              inviteType === 'timed'
                ? 'bg-secondary text-foreground border-border'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            timed
          </button>
        </div>

        {inviteType === 'timed' && (
          <select
            value={expiresIn}
            onChange={e => setExpiresIn(Number(e.target.value))}
            className='w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono text-foreground mb-3 outline-none'
          >
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
          </select>
        )}

        <button
          onClick={generateInviteLink}
          disabled={generating}
          className='w-full py-2 text-xs font-mono border border-border rounded hover:bg-muted disabled:opacity-50 transition-colors'
        >
          {generating ? 'generating...' : 'generate invite link'}
        </button>

        {inviteLink && (
          <div className='mt-3 p-3 bg-muted/50 rounded border border-border flex items-center gap-2'>
            <input
              type='text'
              readOnly
              value={inviteLink}
              className='flex-1 bg-transparent text-xs font-mono text-foreground outline-none'
            />
            <button
              onClick={copyInviteLink}
              className='px-2 py-1 text-[10px] font-mono bg-background hover:bg-muted border border-border rounded shrink-0'
            >
              copy
            </button>
          </div>
        )}
      </div>

      {/* Список */}
      <div>
        <h3 className='text-xs font-mono text-muted-foreground/60 uppercase tracking-widest mb-3'>
          your invite links
        </h3>

        <div className='space-y-2 max-h-64 overflow-y-auto'>
          {loading ? (
            <p className='text-xs font-mono text-muted-foreground/40 py-6 text-center'>
              loading...
            </p>
          ) : invites.length === 0 ? (
            <p className='text-xs font-mono text-muted-foreground/40 py-6 text-center'>
              no invite links yet
            </p>
          ) : (
            invites.map(invite => {
              const isExpired =
                invite.expires_at && new Date(invite.expires_at) < new Date();
              const isRevoked = invite.revoked;
              const isUsed = invite.invite_type === 'one-time' && invite.used;

              return (
                <div
                  key={invite.id}
                  className='bg-muted/30 border border-border rounded p-3'
                >
                  <div className='flex justify-between items-start gap-2'>
                    <div className='font-mono text-[10px] break-all text-muted-foreground/60 flex-1'>
                      {invite.code}
                    </div>
                    <div className='flex gap-1 shrink-0'>
                      {!isRevoked && !isUsed && !isExpired && (
                        <button
                          onClick={() => revokeInvite(invite.id)}
                          className='px-2 py-0.5 text-[10px] font-mono border border-border hover:bg-red-500/10 hover:text-red-400 rounded transition-colors'
                        >
                          revoke
                        </button>
                      )}
                      <button
                        onClick={() => deleteInvite(invite.id)}
                        className='px-2 py-0.5 text-[10px] font-mono border border-border hover:bg-red-500/10 hover:text-red-400 rounded transition-colors'
                      >
                        delete
                      </button>
                    </div>
                  </div>

                  <div className='mt-2 flex flex-wrap gap-1.5 text-[10px]'>
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono ${
                        invite.invite_type === 'one-time'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {invite.invite_type}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono ${
                        isUsed || isExpired || isRevoked
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-emerald-500/10 text-emerald-500'
                      }`}
                    >
                      {isRevoked
                        ? 'revoked'
                        : isUsed
                          ? 'used'
                          : isExpired
                            ? 'expired'
                            : 'active'}
                    </span>
                    {invite.expires_at && (
                      <span className='text-muted-foreground/40 font-mono'>
                        {isExpired ? 'expired' : 'expires'}{' '}
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
