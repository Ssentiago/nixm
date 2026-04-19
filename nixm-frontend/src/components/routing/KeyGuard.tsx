import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { generateAndSaveKeys, getPublicData } from '@/lib/db/keys';
import { api, ApiError } from '@/lib/api/api';

type Status = 'loading' | 'ready' | 'error';

const KeysGuard = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const { setMyDeviceId, me, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!me) {
      setStatus('ready');
      return;
    }
    syncKeys();
  }, [me, isLoading]);

  const syncKeys = useCallback(async () => {
    console.log(`sync leys called. me: ${JSON.stringify(me)}`);
    if (!me) {
      setStatus('loading');
      return;
    }
    try {
      let publicData = await getPublicData(me.id);
      console.log(publicData);

      if (!publicData) {
        publicData = await generateAndSaveKeys(me.id); // берём данные сразу
      }

      if (!publicData) {
        setError('Failed to get encryption keys.');
        setStatus('error');
        return;
      }

      await api.keys.upload(publicData.publicKey, publicData.deviceId);
      setMyDeviceId(publicData.deviceId);
      setStatus('ready');
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Failed to initialize encryption keys.');
      }
      setStatus('error');
    }
  }, [me, isLoading]);

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
