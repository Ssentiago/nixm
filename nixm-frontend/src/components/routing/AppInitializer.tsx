import { useAuth } from '@/hooks/AuthContext';
import { useCryptoContext } from '@/hooks/CryptoContext';
import { ReactNode, useEffect, useRef } from 'react';
import { ws } from '@/lib/websocket/service';

export const AppInitializer = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const { myDeviceId, isReady } = useCryptoContext();
  const tokenRef = useRef(token);
  const deviceIdRef = useRef(myDeviceId);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    deviceIdRef.current = myDeviceId;
  }, [myDeviceId]);

  useEffect(() => {
    if (token && myDeviceId && isReady) {
      ws.connect(
        () => tokenRef.current,
        () => deviceIdRef.current,
      );
    } else {
      ws.disconnect();
    }
  }, [token, myDeviceId, isReady]);

  return <>{children}</>;
};
