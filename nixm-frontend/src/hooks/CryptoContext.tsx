import {
  createContext,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getPrivateKey } from '@/lib/db/keys';
import { PublicKeyRecord } from '@/models/publicKeysRecord';
import { api } from '@/lib/api/api';
import { NixmCrypto } from '@/lib/crypto';

type EncryptedPayload = {
  iv: string;
  data: string;
};

type UserID = string; // i64

type DeviceID = string; // UUID (36 characters)

type PublicKeyBase64 = string;

type PublicKeysCache = Record<UserID, Map<DeviceID, PublicKeyBase64>>;

type CryptoContextType = {
  isReady: boolean;

  // Низкоуровневые примитивы (много устройств)
  encryptMessage: (
    userId: UserID,
    text: string,
  ) => Promise<{ deviceId: string; encryptedPayload: EncryptedPayload }[]>;
  decryptMessage: (
    userId: UserID,
    deviceId: DeviceID,
    payload: EncryptedPayload,
  ) => Promise<string>;
};

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const [myPrivateKeyBase64, setMyPrivateKeyBase64] = useState<string | null>(
    null,
  );

  const publicKeysCache = useRef<PublicKeysCache>({});
  const cryptoServiceCache = useRef<Map<UserID, Map<DeviceID, NixmCrypto>>>(
    new Map(),
  );

  const ensurePublicKeysLoaded = useCallback(
    async (userId: UserID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (publicKeysCache.current[userId]) {
        return publicKeysCache.current[userId];
      }

      const records = await api.keys.keysFor(userId);

      const deviceMap = new Map<DeviceID, PublicKeyBase64>();
      for (const rec of records) {
        deviceMap.set(rec.device_id, rec.public_key);
      }

      publicKeysCache.current[userId] = deviceMap;
      return deviceMap;
    },
    [myPrivateKeyBase64],
  );

  const ensureCryptoServicesLoaded = useCallback(
    async (userID: UserID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (cryptoServiceCache.current.has(userID)) {
        return cryptoServiceCache.current.get(userID)!;
      }

      const publicKeysMap = await ensurePublicKeysLoaded(userID);

      const servicesMap = new Map<DeviceID, NixmCrypto>();

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

      cryptoServiceCache.current.set(userID, servicesMap);

      return servicesMap;
    },
    [myPrivateKeyBase64],
  );

  const encryptMessage = useCallback(
    async (
      userId: UserID,
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
      userId: UserID,
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
