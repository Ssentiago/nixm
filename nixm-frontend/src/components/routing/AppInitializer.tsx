import { useAuth } from '@/hooks/AuthContext';
import { useCryptoContext } from '@/hooks/CryptoContext';
import { ReactNode, useEffect, useRef } from 'react';
import { ws } from '@/lib/websocket/service';

export const AppInitializer = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const { keyStore, isReady } = useCryptoContext();
  const tokenRef = useRef(token);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    deviceIdRef.current = keyStore?.deviceId ?? null;
  }, [keyStore, isReady]);

  useEffect(() => {
    if (token && isReady && keyStore?.deviceId) {
      ws.connect(
        () => tokenRef.current,
        () => deviceIdRef.current,
      );
    } else {
      ws.disconnect();
    }
  }, [token, isReady, keyStore]);

  return <>{children}</>;
};
