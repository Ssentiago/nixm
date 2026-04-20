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
import { api, ApiError } from '@/lib/api/api';
import { NixmCrypto } from '@/lib/crypto';
import { useAuth } from '@/hooks/AuthContext';
import { db } from '@/lib/db';

export type EncryptedPayload = {
  iv: string;
  data: string;
};

export type PeerID = string;

export type PeerDeviceID = string; // UUID (36 characters)

type PeerPublicKeyBase64 = string;

type PeersPublicKeysCache = Record<
  PeerID,
  Map<PeerDeviceID, PeerPublicKeyBase64>
>;

type CryptoContextType = {
  isReady: boolean;
  myDeviceId: string | null;
  encryptMessage: (
    peerId: PeerID,
    text: string,
  ) => Promise<{ deviceId: string; encryptedPayload: EncryptedPayload }[]>;
  decryptMessage: (
    peerId: PeerID,
    peerDeviceId: PeerDeviceID,
    payload: EncryptedPayload,
  ) => Promise<string>;
};
type Status = 'loading' | 'ready' | 'error';

const useMyKeys = () => {
  const { myProfile, isLoading } = useAuth();

  const [myPrivateKeyBase64, setMyPrivateKeyBase64] = useState<string | null>(
    null,
  );
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!myProfile) return;

      if (myPrivateKeyBase64 === null) {
        const key = await db.keys.getPrivateKey(myProfile.id);

        if (key === null) {
          console.error('Cannot get user private key');
        } else {
          setMyPrivateKeyBase64(key);
        }
      }
    })();
  }, [myPrivateKeyBase64]);

  const syncKeys = useCallback(async () => {
    console.log(`sync keys called. me: ${JSON.stringify(myProfile)}`);
    if (!myProfile) {
      setStatus('loading');
      return;
    }
    try {
      let publicData = await db.keys.getPublicData(myProfile.id);
      console.log(publicData);

      if (!publicData) {
        publicData = await db.keys.generateAndSaveKeys(myProfile.id); // берём данные сразу
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
  }, [myProfile, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!myProfile) {
      setStatus('ready');
      return;
    }
    syncKeys();
  }, [myProfile, isLoading]);

  return { myPrivateKeyBase64, myDeviceId, status, error };
};

const usePeerCrypto = (myPrivateKeyBase64: string | null) => {
  const peersPublicKeysCache = useRef<PeersPublicKeysCache>({});
  const peersCryptoServiceCache = useRef<
    Map<PeerID, Map<PeerDeviceID, NixmCrypto>>
  >(new Map());

  const ensurePublicKeysLoaded = useCallback(
    async (peerId: PeerID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (peersPublicKeysCache.current[peerId]) {
        return peersPublicKeysCache.current[peerId];
      }

      const records = await api.keys.keysFor(peerId);

      const deviceMap = new Map<PeerDeviceID, PeerPublicKeyBase64>();
      for (const rec of records) {
        deviceMap.set(rec.device_id, rec.public_key);
      }

      peersPublicKeysCache.current[peerId] = deviceMap;
      return deviceMap;
    },
    [myPrivateKeyBase64],
  );

  const ensureCryptoServicesLoaded = useCallback(
    async (peerUserID: PeerID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (peersCryptoServiceCache.current.has(peerUserID)) {
        return peersCryptoServiceCache.current.get(peerUserID)!;
      }

      const publicKeysMap = await ensurePublicKeysLoaded(peerUserID);

      const servicesMap = new Map<PeerDeviceID, NixmCrypto>();

      const tasks: Array<Promise<{ deviceId: string; service: NixmCrypto }>> =
        Array.from(publicKeysMap.entries()).map(
          async ([deviceId, publicKey]) => {
            const service = new NixmCrypto(myPrivateKeyBase64!, publicKey);
            await service.init(); // Деривация ключа
            return { deviceId, service };
          },
        );

      const results = await Promise.all(tasks);

      for (const { deviceId, service } of results) {
        servicesMap.set(deviceId, service);
      }

      peersCryptoServiceCache.current.set(peerUserID, servicesMap);

      return servicesMap;
    },
    [myPrivateKeyBase64],
  );

  return { ensureCryptoServicesLoaded };
};

const useEncryption = (
  myPrivateKeyBase64: string | null,
  ensureCryptoServicesLoaded: (
    peerUserID: PeerID,
  ) => Promise<Map<string, NixmCrypto>>,
) => {
  const encryptMessage = useCallback(
    async (
      userId: PeerID,
      text: string,
    ): Promise<{ deviceId: string; encryptedPayload: EncryptedPayload }[]> => {
      if (!myPrivateKeyBase64) {
        throw new Error('Private key not found');
      }

      const cryptoServices = await ensureCryptoServicesLoaded(userId);

      const tasks = [...cryptoServices.entries()].map(
        async ([deviceId, crypto]) => {
          const encryptedPayload = await crypto.encrypt(text);

          return {
            deviceId,
            encryptedPayload,
          };
        },
      );

      return await Promise.all(tasks);
    },
    [myPrivateKeyBase64, ensureCryptoServicesLoaded],
  );

  const decryptMessage = useCallback(
    async (
      userId: PeerID,
      deviceId: string,
      encryptedPayload: EncryptedPayload,
    ) => {
      if (!myPrivateKeyBase64) {
        throw new Error('Private key not found');
      }

      const cryptoServices = await ensureCryptoServicesLoaded(userId);

      const crypto = cryptoServices.get(deviceId);
      if (!crypto) {
        throw new Error('No crypto initialized');
      }

      return await crypto.decrypt(encryptedPayload.data, encryptedPayload.iv);
    },
    [myPrivateKeyBase64, ensureCryptoServicesLoaded],
  );

  return { encryptMessage, decryptMessage };
};

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const { myPrivateKeyBase64, status, error, myDeviceId } = useMyKeys();
  const { ensureCryptoServicesLoaded } = usePeerCrypto(myPrivateKeyBase64);
  const { encryptMessage, decryptMessage } = useEncryption(
    myPrivateKeyBase64,
    ensureCryptoServicesLoaded,
  );
  const ctx: CryptoContextType = useMemo(
    () => ({
      isReady: status === 'ready',
      encryptMessage,
      decryptMessage,
      myDeviceId,
    }),
    [encryptMessage, decryptMessage, status],
  );

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
