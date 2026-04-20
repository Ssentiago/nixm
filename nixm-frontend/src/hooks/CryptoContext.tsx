import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { logger } from '@/lib/logger';
import { KeyStore } from '@/lib/keystore';

type Status = 'loading' | 'ready' | 'error';

type CryptoContextType = {
  keyStore: KeyStore | null;
  isReady: boolean;
};

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const { myProfile, isLoading } = useAuth();
  const [keyStore, setKeyStore] = useState<KeyStore | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const init = useCallback(async (userId: string) => {
    try {
      const store = new KeyStore();
      await store.init(userId);
      setKeyStore(store);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    if (isLoading) return;

    if (!myProfile) {
      setStatus('ready');
      return;
    }

    init(myProfile.id);
  }, [myProfile, isLoading, init]);

  const ctx = useMemo<CryptoContextType>(
    () => ({
      keyStore: keyStore,
      isReady: status === 'ready',
    }),
    [status, keyStore],
  );

  return (
    <CryptoContext.Provider value={ctx}>{children}</CryptoContext.Provider>
  );
}

export function useCryptoContext() {
  const ctx = useContext(CryptoContext);
  if (!ctx) {
    logger.error('CryptoContext: used outside of provider');
    throw new Error(
      'useCryptoContext must be used within CryptoContextProvider',
    );
  }
  return ctx;
}
