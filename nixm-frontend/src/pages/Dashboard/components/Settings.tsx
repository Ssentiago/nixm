import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/AuthContext';

type Invite = {
  id: number;
  code: string;
  invite_type: 'one-time' | 'timed';
  expires_at: string | null;
  used: boolean;
  revoked: boolean;
  created_at: string;
};

export const Settings = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { interceptor } = useAuth();

  const [inviteType, setInviteType] = useState<'one-time' | 'timed'>(
    'one-time',
  );
  const [expiresIn, setExpiresIn] = useState(86400);
  const [inviteLink, setInviteLink] = useState('');
  const [generating, setGenerating] = useState(false);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const host = useRef(window.location.host);

  // Загрузка списка ссылок
  const loadInvites = async () => {
    setLoading(true);
    try {
      const res = await interceptor('/api/invite_links');
      if (res.ok) {
        const data = await res.json();
        setInvites(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadInvites();
  }, [open]);

  const generateInviteLink = async () => {
    setGenerating(true);
    try {
      const res = await interceptor('/api/invite_links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_type: inviteType,
          expires_in: inviteType === 'timed' ? expiresIn : null,
        }),
      });

      if (res.ok) {
        const newInvite = await res.json();
        setInviteLink(`https://${host.current}/invite/${newInvite.code}`);
        setInvites(prev => [newInvite, ...prev]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) navigator.clipboard.writeText(inviteLink);
  };

  const revokeInvite = async (id: number) => {
    try {
      const res = await interceptor(`/api/invite_links/${id}/revoke`, {
        method: 'POST',
      });
      if (res.ok) {
        setInvites(prev =>
          prev.map(i =>
            i.id === id
              ? { ...i, revoked: true, expires_at: new Date().toISOString() }
              : i,
          ),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteInvite = async (id: number) => {
    try {
      const res = await interceptor(`/api/invite_links/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setInvites(prev => prev.filter(i => i.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70'>
      <div className='bg-background border border-border rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-hidden flex flex-col'>
        <div className='flex items-center justify-between mb-6'>
          <h2 className='text-lg font-semibold'>Settings</h2>
          <button
            onClick={onClose}
            className='text-muted-foreground hover:text-foreground'
          >
            ✕
          </button>
        </div>

        <div className='space-y-8 overflow-y-auto flex-1 pr-1'>
          {/* Генератор */}
          <div>
            <h3 className='text-sm font-medium mb-3'>Invite link</h3>

            <div className='flex gap-2 mb-3'>
              <button
                onClick={() => setInviteType('one-time')}
                className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                  inviteType === 'one-time'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                One-Time
              </button>
              <button
                onClick={() => setInviteType('timed')}
                className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                  inviteType === 'timed'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                Temporary
              </button>
            </div>

            {inviteType === 'timed' && (
              <div className='mb-3'>
                <select
                  value={expiresIn}
                  onChange={e => setExpiresIn(Number(e.target.value))}
                  className='w-full bg-background border border-border rounded-lg px-3 py-2 text-sm'
                >
                  <option value={3600}>1 hour</option>
                  <option value={86400}>24 hours</option>
                  <option value={604800}>7 days</option>
                  <option value={2592000}>30 days</option>
                </select>
              </div>
            )}

            <button
              onClick={generateInviteLink}
              disabled={generating}
              className='w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-sm font-medium transition-colors'
            >
              {generating ? 'Generating...' : 'Generate invite link'}
            </button>

            {inviteLink && (
              <div className='mt-3 p-3 bg-muted/50 rounded-lg border border-border'>
                <div className='flex items-center gap-2'>
                  <input
                    type='text'
                    readOnly
                    value={inviteLink}
                    className='flex-1 bg-transparent text-sm font-mono text-foreground outline-none'
                  />
                  <button
                    onClick={copyInviteLink}
                    className='px-3 py-1 text-xs bg-background hover:bg-muted border border-border rounded-md'
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Список ссылок */}
          <div>
            <h3 className='text-sm font-medium mb-3'>Your invite links</h3>

            <div className='space-y-2 max-h-80 overflow-y-auto'>
              {loading ? (
                <p className='text-sm text-muted-foreground py-8 text-center'>
                  Loading...
                </p>
              ) : invites.length === 0 ? (
                <p className='text-sm text-muted-foreground py-8 text-center'>
                  No invite links yet
                </p>
              ) : (
                invites.map(invite => {
                  const isExpired =
                    invite.expires_at &&
                    new Date(invite.expires_at) < new Date();
                  const isRevoked = invite.revoked;
                  const isUsed =
                    invite.invite_type === 'one-time' && invite.used;

                  return (
                    <div
                      key={invite.id}
                      className='bg-muted/30 border border-border rounded-lg p-3'
                    >
                      <div className='flex justify-between items-start'>
                        <div className='font-mono text-xs break-all text-muted-foreground'>
                          https://{host.current}/invite/{invite.code}
                        </div>
                        <div className='flex gap-1'>
                          {!isRevoked && (
                            <button
                              onClick={() => revokeInvite(invite.id)}
                              className='px-2.5 py-1 text-xs border border-border hover:bg-red-500/10 hover:text-red-400 rounded'
                            >
                              Revoke
                            </button>
                          )}
                          <button
                            onClick={() => deleteInvite(invite.id)}
                            className='px-2.5 py-1 text-xs border border-border hover:bg-red-500/10 hover:text-red-400 rounded'
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className='mt-3 flex flex-wrap gap-2 text-[10px]'>
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            invite.invite_type === 'one-time'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {invite.invite_type.toUpperCase()}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            isUsed || isExpired || isRevoked
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-green-500/10 text-green-400'
                          }`}
                        >
                          {isRevoked
                            ? 'REVOKED'
                            : isUsed
                              ? 'USED'
                              : isExpired
                                ? 'EXPIRED'
                                : 'ACTIVE'}
                        </span>

                        {invite.expires_at && (
                          <span className='text-muted-foreground'>
                            {isExpired ? 'Expired' : 'Expires'}{' '}
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

        <div className='mt-6 flex justify-end pt-4 border-t border-border'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg'
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
