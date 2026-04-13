import {
  createContext,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getPrivateKey } from '@/lib/db';

type UserID = string; // i64

type DeviceID = string; // UUID (36 characters)

type PublicKeyBase64 = string;

type PublicKeysCache = Record<UserID, Map<DeviceID, PublicKeyBase64>>;

type CryptoContextType = {
  isReady: boolean;

  // Низкоуровневые примитивы (одно устройство)
  encryptForDevice: (
    userId: UserID,
    deviceId: DeviceID,
    text: string,
  ) => Promise<{ iv: string; ciphertext: string }>;
  decryptFrom: (
    payload: { iv: string; ciphertext: string },
    senderUserId: UserID,
    senderDeviceId: DeviceID,
  ) => Promise<string>;

  // Управление ключами
  ensureKeysLoaded: (
    userId: UserID,
  ) => Promise<Array<{ deviceId: DeviceID; publicKey: PublicKeyBase64 }>>;
};

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const myPrivateKeyBase64 = useRef<string | null>(null);

  const publicKeysCache = useRef<PublicKeysCache>({});

  const updatePublicKeys = (
    action: 'add' | 'remove',
    data: {
      userId: string;
      deviceId?: string;
      publicKey?: string;
    },
  ) => {
    switch (action) {
      case 'add': {
        if (!publicKeysCache.current[data.userId]) {
          publicKeysCache.current[data.userId] = new Map();
        }

        let user = publicKeysCache.current[data.userId];

        if (!data.deviceId) {
          console.debug('Expected DeviceId, got null');
          return;
        }

        if (!data.publicKey) {
          console.debug('Expected Public Key, got: ', data.publicKey);
          return;
        }

        user.set(data.deviceId, data.publicKey);
        break;
      }
      case 'remove': {
        if (!data.userId) {
          console.debug('Expected userID');
          return;
        }

        const user = publicKeysCache.current[data.userId];

        if (!user) {
          console.debug('Not found user to remove...');
          return;
        }

        if (data.deviceId) {
          user.delete(data.deviceId);
        } else {
          delete publicKeysCache.current[data.userId];
        }
        break;
      }
    }
  };

  useEffect(() => {
    (async () => {
      if (myPrivateKeyBase64 === null) {
        const key = await getPrivateKey();

        if (key === null) {
          console.error('Cannot get user private key');
        } else {
          setMyPrivateKeyBase64(key);
        }
      }
    })();
  }, [myPrivateKeyBase64]);

  const ctx = useMemo(() => ({}), []);

  return (
    <CryptoContext.Provider value={ctx}>{children}</CryptoContext.Provider>
  );
}

export function useCryptoContext() {
  const ctx = useContext(CryptoContext);
  if (!ctx) {
    throw new Error('useCryptoContext must be used within Provider');
  }
  return ctx;
}
