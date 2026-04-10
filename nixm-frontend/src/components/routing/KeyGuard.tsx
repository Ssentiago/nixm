import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { hasKeys, generateAndSaveKeys, getPublicData } from '@/lib/crypto';

type Status = 'loading' | 'ready' | 'error';

const KeysGuard = ({ children }: { children: React.ReactNode }) => {
  const { interceptor } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const syncKeys = useCallback(async () => {
    try {
      let publicData = await getPublicData();

      if (!publicData) {
        await generateAndSaveKeys();
        publicData = await getPublicData();
      }

      if (!publicData) {
        setError('Failed to get encryption keys.');
        setStatus('error');
        return;
      }
      const resp = await interceptor('/api/keys/upload', {
        method: 'POST',
        headers: {
          'X-Device-ID': publicData.deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          public_key: publicData.publicPem,
        }),
      });

      if (resp.status === 500) {
        setError('Server error. Try again later.');
        setStatus('error');
        return;
      }

      if (resp.status === 200) {
        setStatus('ready');
      }
    } catch (e) {
      setError('Failed to initialize encryption keys.');
      setStatus('error');
    }
  }, [interceptor]);

  useEffect(() => {
    syncKeys();
  }, []);

  if (status === 'loading') {
    return (
      <div className='flex h-screen w-screen items-center justify-center bg-background'>
        <span className='text-xs font-mono text-muted-foreground animate-pulse'>
          initializing keys...
        </span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className='flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background'>
        <span className='text-xs font-mono text-destructive'>
          {'>'} {error}
        </span>
        <button
          onClick={syncKeys}
          className='px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm'
        >
          Retry Sync
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default KeysGuard;
