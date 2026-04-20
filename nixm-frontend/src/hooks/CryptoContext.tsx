import {
  createContext,
  ReactNode,
  Ref,
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
import { logger } from '@/lib/logger';

export type EncryptedPayload = {
  iv: string;
  data: string;
};

export type PeerID = string;
export type PeerDeviceID = string;
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
  const [myPublicKeyBase64, setMyPublicKeyBase64] = useState<string | null>(
    null,
  );
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const syncKeys = useCallback(async () => {
    logger.debug('Crypto: syncKeys called', { profile: myProfile?.id });

    if (!myProfile) {
      setStatus('loading');
      return;
    }

    try {
      let publicData = await db.keys.getPublicData(myProfile.id);

      if (!publicData) {
        logger.info('Crypto: no keys found, generating new device keys');
        publicData = await db.keys.generateAndSaveKeys(myProfile.id);
      }

      if (!publicData) {
        logger.error('Crypto: failed to get or generate public data');
        setError('Failed to get encryption keys.');
        setStatus('error');
        return;
      }

      const privateKey = await db.keys.getPrivateKey(myProfile.id);
      if (!privateKey) {
        logger.error('Crypto: private key missing after generation');
        setError('Failed to load private key.');
        setStatus('error');
        return;
      }

      setMyPrivateKeyBase64(privateKey);
      setMyPublicKeyBase64(publicData.publicKey);

      await api.keys.upload(publicData.publicKey, publicData.deviceId);
      setMyDeviceId(publicData.deviceId);
      setStatus('ready');

      logger.info('Crypto: infrastructure ready', {
        deviceId: publicData.deviceId,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        logger.error('Crypto: API error during key sync', { error: e.message });
        setError(e.message);
      } else {
        logger.error('Crypto: unexpected error during key sync', {
          error: String(e),
        });
        setError('Failed to initialize encryption keys.');
      }
      setStatus('error');
    }
  }, [myProfile]);
  useEffect(() => {
    if (isLoading) return;
    if (!myProfile) {
      setStatus('ready');
      return;
    }
    syncKeys();
  }, [myProfile, isLoading, syncKeys]);

  return {
    myPrivateKeyBase64,
    myPublicKeyBase64,
    myDeviceId,
    status,
    error,
  };
};

const usePeerCrypto = (myPrivateKeyBase64: string | null) => {
  const peersPublicKeysCache = useRef<PeersPublicKeysCache>({});
  const peersCryptoServiceCache = useRef<
    Map<PeerID, Map<PeerDeviceID, NixmCrypto>>
  >(new Map());
  const selfCryptoRef = useRef<NixmCrypto | null>(null);
  const getSelfCrypto = useCallback(() => selfCryptoRef.current, []);
  const ensurePublicKeysLoaded = useCallback(
    async (peerId: PeerID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (peersPublicKeysCache.current[peerId]) {
        return peersPublicKeysCache.current[peerId];
      }

      logger.debug('Crypto: fetching peer public keys', { peerId });
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

  const initSelfCrypto = useCallback(
    async (myPublicKey: string) => {
      if (!myPrivateKeyBase64) {
        logger.warn('Crypto: initSelfCrypto called but no private key');
        return;
      }
      if (selfCryptoRef.current) {
        logger.debug('Crypto: selfCrypto already initialized');
        return;
      }
      const service = new NixmCrypto(myPrivateKeyBase64, myPublicKey);
      await service.init();
      selfCryptoRef.current = service;
      logger.info('Crypto: self crypto service initialized');
    },
    [myPrivateKeyBase64],
  );

  const ensureCryptoServicesLoaded = useCallback(
    async (peerUserID: PeerID) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not loaded');

      if (peersCryptoServiceCache.current.has(peerUserID)) {
        return peersCryptoServiceCache.current.get(peerUserID)!;
      }

      logger.debug('Crypto: initializing crypto services for peer', {
        peerUserID,
      });
      const publicKeysMap = await ensurePublicKeysLoaded(peerUserID);
      const servicesMap = new Map<PeerDeviceID, NixmCrypto>();

      const tasks = Array.from(publicKeysMap.entries()).map(
        async ([deviceId, publicKey]) => {
          const service = new NixmCrypto(myPrivateKeyBase64!, publicKey);
          await service.init();
          return { deviceId, service };
        },
      );

      const results = await Promise.all(tasks);

      for (const { deviceId, service } of results) {
        servicesMap.set(deviceId, service);
      }

      peersCryptoServiceCache.current.set(peerUserID, servicesMap);
      logger.debug('Crypto: services initialized', {
        peerUserID,
        devicesCount: results.length,
      });

      return servicesMap;
    },
    [myPrivateKeyBase64, ensurePublicKeysLoaded],
  );

  return { ensureCryptoServicesLoaded, initSelfCrypto, getSelfCrypto };
};

const useEncryption = (
  myPrivateKeyBase64: string | null,
  ensureCryptoServicesLoaded: (
    peerUserID: PeerID,
  ) => Promise<Map<string, NixmCrypto>>,
  myDeviceId: string | null,
  getSelfCrypto: () => NixmCrypto | null,
) => {
  const encryptMessage = useCallback(
    async (userId: PeerID, text: string) => {
      if (!myPrivateKeyBase64) throw new Error('Private key not found');

      const cryptoServices = await ensureCryptoServicesLoaded(userId);

      const tasks = [...cryptoServices.entries()].map(
        async ([deviceId, crypto]) => {
          const encryptedPayload = await crypto.encrypt(text);
          return { deviceId, encryptedPayload };
        },
      );

      const results = await Promise.all(tasks);

      // добавляем payload для себя
      const selfCrypto = getSelfCrypto();
      if (selfCrypto && myDeviceId) {
        const selfPayload = await selfCrypto.encrypt(text);
        results.push({ deviceId: myDeviceId, encryptedPayload: selfPayload });
      }

      return results;
    },
    [myPrivateKeyBase64, ensureCryptoServicesLoaded, getSelfCrypto, myDeviceId],
  );
  const decryptMessage = useCallback(
    async (
      userId: PeerID,
      deviceId: string,
      encryptedPayload: EncryptedPayload,
    ) => {
      if (!myPrivateKeyBase64) {
        logger.error('Crypto: decryption failed - private key missing');
        throw new Error('Private key not found');
      }

      logger.debug('Crypto: decryptMessage called', {
        userId,
        deviceId,
        myDeviceId,
        equal: deviceId === myDeviceId,
        hasSelfCrypto: !!getSelfCrypto(),
      });

      if (deviceId === myDeviceId) {
        const selfCrypto = getSelfCrypto();
        if (!selfCrypto) throw new Error('Self crypto not initialized');
        return selfCrypto.decrypt(encryptedPayload.data, encryptedPayload.iv);
      }

      const cryptoServices = await ensureCryptoServicesLoaded(userId);
      const crypto = cryptoServices.get(deviceId);

      if (!crypto) {
        logger.warn('Crypto: missing service for device during decryption', {
          userId,
          deviceId,
        });
        throw new Error('No crypto initialized');
      }

      try {
        const decrypted = await crypto.decrypt(
          encryptedPayload.data,
          encryptedPayload.iv,
        );
        logger.debug('Crypto: successful decryption', { userId, deviceId });
        return decrypted;
      } catch (e) {
        logger.error('Crypto: decryption failed', {
          userId,
          deviceId,
          error: String(e),
        });
        throw e;
      }
    },
    [myPrivateKeyBase64, ensureCryptoServicesLoaded],
  );

  return { encryptMessage, decryptMessage };
};

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoContextProvider({ children }: { children: ReactNode }) {
  const { myPrivateKeyBase64, myPublicKeyBase64, status, error, myDeviceId } =
    useMyKeys();
  const { ensureCryptoServicesLoaded, initSelfCrypto, getSelfCrypto } =
    usePeerCrypto(myPrivateKeyBase64);
  const { encryptMessage, decryptMessage } = useEncryption(
    myPrivateKeyBase64,
    ensureCryptoServicesLoaded,
    myDeviceId,
    getSelfCrypto,
  );

  useEffect(() => {
    logger.debug('Crypto: attempting selfCrypto init', {
      myPublicKeyBase64,
      myPrivateKeyBase64: !!myPrivateKeyBase64,
    });
    if (myPublicKeyBase64) initSelfCrypto(myPublicKeyBase64);

    (window as any).check = () => {
      console.log(getSelfCrypto());
      console.log(`my public key: ${myPublicKeyBase64}`);
      console.log(`my private key: ${myPrivateKeyBase64}`);
      console.log(`my device id: ${myDeviceId}`);
    };
  }, [myPublicKeyBase64, initSelfCrypto]);

  const ctx: CryptoContextType = useMemo(
    () => ({
      isReady: status === 'ready',
      encryptMessage,
      decryptMessage,
      myDeviceId,
    }),
    [encryptMessage, decryptMessage, status, myDeviceId],
  );

  return (
    <CryptoContext.Provider value={ctx}>{children}</CryptoContext.Provider>
  );
}

export function useCryptoContext() {
  const ctx = useContext(CryptoContext);
  if (!ctx) {
    logger.error('Crypto: useCryptoContext used outside of provider');
    throw new Error('useCryptoContext must be used within Provider');
  }
  return ctx;
}
