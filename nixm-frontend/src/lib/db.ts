import { initializeDevice } from './crypto';

const DB_NAME = 'nixm_keys';
const STORE_NAME = 'keys';

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

export async function generateAndSaveKeys(): Promise<void> {
  const initialized = await initializeDevice();

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  store.put({
    id: 'current_user_key',
    privateKey: initialized.privateKey,
    publicKey: initialized.publicKey,
    deviceId: initialized.deviceId,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        console.log(
          '[Keys] generateAndSaveKeys → saved to IndexedDB successfully',
        );
        resolve();
      };
      tx.onerror = () => {
        console.error(
          '[Keys] generateAndSaveKeys → transaction error',
          tx.error,
        );
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error('[Keys] generateAndSaveKeys → CRITICAL ERROR', err);
    throw err;
  }
}

export async function getPrivateKey(): Promise<CryptoKey | null> {
  console.log('[Keys] getPrivateKey → started');
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get('current_user_key');
      request.onsuccess = () => {
        const result = request.result?.privateKey || null;
        console.log('[Keys] getPrivateKey →', result ? 'found' : 'not found');
        resolve(result);
      };
      request.onerror = () => {
        console.error('[Keys] getPrivateKey → error', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[Keys] getPrivateKey → failed', err);
    throw err;
  }
}

export async function getPublicData(): Promise<{
  publicKey: string;
  deviceId: string;
} | null> {
  console.log('[Keys] getPublicData → started');
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const req = store.get('current_user_key');
      req.onsuccess = () => {
        const data = req.result
          ? { publicKey: req.result.publicKey, deviceId: req.result.deviceId }
          : null;
        console.log('[Keys] getPublicData →', data ? 'found' : 'not found');
        resolve(data);
      };
      req.onerror = () => {
        console.error('[Keys] getPublicData → error', req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.error('[Keys] getPublicData → failed', err);
    throw err;
  }
}

export async function hasKeys(): Promise<boolean> {
  console.log('[Keys] hasKeys → checking');
  const has = await getPrivateKey().then(k => k !== null);
  console.log('[Keys] hasKeys → result:', has);
  return has;
}
