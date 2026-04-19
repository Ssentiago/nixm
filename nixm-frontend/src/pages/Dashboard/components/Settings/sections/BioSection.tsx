import { useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { api, ApiError } from '@/lib/api/api';

const MAX_BIO = 160;

export const BioSection = () => {
  const { me, setMe } = useAuth();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(me?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.users.updateBio(bio);
      setMe(prev => (prev ? { ...prev, bio } : prev));
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save bio');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setBio(me?.bio ?? '');
    setEditing(false);
    setError('');
  };

  return (
    <div>
      <h3 className='text-xs font-mono text-muted-foreground/60 uppercase tracking-widest mb-3'>
        bio
      </h3>

      {editing ? (
        <div>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, MAX_BIO))}
            placeholder='say something...'
            rows={3}
            autoFocus
            className='w-full bg-muted border border-border rounded px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-muted-foreground/40 resize-none'
          />
          <div className='flex items-center justify-between mt-1'>
            <span className='text-[10px] font-mono text-muted-foreground/40'>
              {bio.length}/{MAX_BIO}
            </span>
            <div className='flex items-center gap-2'>
              {error && (
                <span className='text-[10px] font-mono text-red-400'>
                  {error}
                </span>
              )}
              <button
                onClick={handleCancel}
                className='px-3 py-1 text-xs font-mono border border-border rounded hover:bg-muted transition-colors'
              >
                cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className='px-3 py-1 text-xs font-mono border border-border rounded hover:bg-muted transition-colors disabled:opacity-50'
              >
                {saving ? 'saving...' : 'save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className='w-full text-left px-3 py-2 rounded border border-transparent hover:border-border hover:bg-muted/50 transition-colors group'
        >
          {bio ? (
            <span className='text-xs font-mono text-foreground'>{bio}</span>
          ) : (
            <span className='text-xs font-mono text-muted-foreground/30'>
              say something...
            </span>
          )}
        </button>
      )}
    </div>
  );
};
