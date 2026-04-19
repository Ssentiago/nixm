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
import { getPrivateKey } from '@/lib/db/keys';
import { api } from '@/lib/api/api';
import { NixmCrypto } from '@/lib/crypto';
import { useAuth } from '@/hooks/AuthContext';

type EncryptedPayload = {
  iv: string;
  data: string;
};

type PeerID = string;

type PeerDeviceID = string; // UUID (36 characters)

type PeerPublicKeyBase64 = string;

type PeersPublicKeysCache = Record<
  PeerID,
  Map<PeerDeviceID, PeerPublicKeyBase64>
>;

type CryptoContextType = {
  isReady: boolean;

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

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [myPrivateKeyBase64, setMyPrivateKeyBase64] = useState<string | null>(
    null,
  );

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

  useEffect(() => {
    (async () => {
      if (!me) return;

      if (myPrivateKeyBase64 === null) {
        const key = await getPrivateKey(me.id);

        if (key === null) {
          console.error('Cannot get user private key');
        } else {
          setMyPrivateKeyBase64(key);
        }
      }
    })();
  }, [myPrivateKeyBase64]);

  const ctx: CryptoContextType = useMemo(
    () => ({
      isReady: myPrivateKeyBase64 !== null,
      encryptMessage,
      decryptMessage,
    }),
    [myPrivateKeyBase64, encryptMessage, decryptMessage],
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
