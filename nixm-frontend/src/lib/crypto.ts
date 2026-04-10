export async function exportPublicKeyToPem(key: CryptoKey): Promise<string> {
  console.log('[Crypto] exportPublicKeyToPem → started');
  try {
    const exported = await window.crypto.subtle.exportKey('spki', key);
    console.log(
      '[Crypto] exportPublicKeyToPem → raw bytes length:',
      exported.byteLength,
    );

    const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
    const pem = `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

    console.log(
      '[Crypto] exportPublicKeyToPem → success, PEM length:',
      pem.length,
    );
    return pem;
  } catch (err) {
    console.error('[Crypto] exportPublicKeyToPem → FAILED', err);
    throw err;
  }
}

export async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  console.log(
    '[Crypto] importPublicKeyFromPem → started, PEM length:',
    pem.length,
  );
  try {
    const binaryDerString = atob(
      pem.replace(
        /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
        '',
      ),
    );
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const key = await window.crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt'],
    );

    console.log('[Crypto] importPublicKeyFromPem → success');
    return key;
  } catch (err) {
    console.error('[Crypto] importPublicKeyFromPem → FAILED', err);
    throw err;
  }
}

// ==================== INDEXEDDB ====================

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
  console.log('[Keys] generateAndSaveKeys → started');

  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    console.log('[Keys] generateAndSaveKeys → keypair generated');

    const publicPem = await exportPublicKeyToPem(keyPair.publicKey);
    const deviceId = crypto.randomUUID();

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({
      id: 'current_user_key',
      privateKey: keyPair.privateKey,
      publicPem: publicPem,
      deviceId: deviceId,
    });

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
  publicPem: string;
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
          ? { publicPem: req.result.publicPem, deviceId: req.result.deviceId }
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
