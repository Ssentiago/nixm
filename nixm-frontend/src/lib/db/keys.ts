import { initializeDevice } from '../crypto';

const DB_NAME = 'nixm_keys';
const STORE_NAME = 'keys';
const keyId = (userId: string) => `user_key_${userId}`;

function openDB(): Promise<IDBDatabase> {
  console.log('[IDB] openDB → opening', DB_NAME);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      console.error('[IDB] openDB → error', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[IDB] openDB → success');
      resolve(request.result);
    };

    request.onupgradeneeded = event => {
      console.log(
        '[IDB] openDB → onupgradeneeded, old version:',
        event.oldVersion,
      );
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        console.log('[IDB] openDB → created object store:', STORE_NAME);
      }
    };
  });
}

// ==================== MAIN FUNCTIONS ====================

export async function generateAndSaveKeys(userId: string): Promise<{
  publicKey: string;
  deviceId: string;
}> {
  const initialized = await initializeDevice();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({
    id: keyId(userId),
    privateKey: initialized.privateKey,
    publicKey: initialized.publicKey,
    deviceId: initialized.deviceId,
  });
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  return { publicKey: initialized.publicKey, deviceId: initialized.deviceId };
}

export async function getPrivateKey(userId: string): Promise<string | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(keyId(userId));
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result?.privateKey ?? null);
    req.onerror = () => rej(req.error);
  });
}
export async function getPublicData(userId: string): Promise<{
  publicKey: string;
  deviceId: string;
} | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(keyId(userId));
  return new Promise((res, rej) => {
    req.onsuccess = () => {
      const r = req.result;
      res(r ? { publicKey: r.publicKey, deviceId: r.deviceId } : null);
    };
    req.onerror = () => rej(req.error);
  });
}

export async function hasKeys(userId: string): Promise<boolean> {
  const data = await getPublicData(userId);
  const privateKey = await getPrivateKey(userId);
  return !!(data?.publicKey && data?.deviceId && privateKey);
}
