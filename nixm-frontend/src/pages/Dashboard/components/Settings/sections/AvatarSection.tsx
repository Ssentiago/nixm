import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { api, ApiError } from '@/lib/api/api';
import { API_BASE } from '@/lib/env';

export const AvatarSection = () => {
  const { myProfile, setMyProfile } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log(JSON.stringify(myProfile));
  }, [myProfile]);

  const avatarUrl = `${API_BASE}${myProfile?.avatar_url}`;
  const initials = myProfile?.username?.[0]?.toUpperCase() ?? '?';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { avatar_url } = await api.users.uploadAvatar(formData);
      setMyProfile(prev => (prev ? { ...prev, avatar_url } : prev));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h3 className='text-xs font-mono text-muted-foreground/60 uppercase tracking-widest mb-3'>
        avatar
      </h3>

      <div className='flex items-center gap-4'>
        <button
          onClick={() => avatarUrl && setFullscreen(true)}
          className='shrink-0 w-16 h-16 rounded-full overflow-hidden bg-secondary flex items-center justify-center border border-border hover:border-muted-foreground/40 transition-colors'
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt='avatar'
              className='w-full h-full object-cover'
            />
          ) : (
            <span className='text-xl font-mono text-muted-foreground'>
              {initials}
            </span>
          )}
        </button>

        <div className='flex flex-col gap-2'>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className='px-3 py-1.5 text-xs font-mono border border-border rounded hover:bg-muted transition-colors disabled:opacity-50'
          >
            {uploading ? 'uploading...' : 'change avatar'}
          </button>
          {error && (
            <p className='text-[11px] text-red-400 font-mono'>{error}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleFileChange}
      />

      {/* Fullscreen */}
      {fullscreen && avatarUrl && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/90'
          onClick={() => setFullscreen(false)}
        >
          <img
            src={avatarUrl}
            alt='avatar'
            className='max-w-[90vw] max-h-[90vh] rounded-xl object-contain'
          />
        </div>
      )}
    </div>
  );
};
