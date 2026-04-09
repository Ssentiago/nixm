export async function exportPublicKeyToPem(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', key);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
}

// Импорт публичного ключа из PEM (для шифрования сообщений получателя)
export async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  const binaryDerString = atob(
    pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ''),
  );
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  return window.crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  );
}
const DB_NAME = 'nixm_keys';
const STORE_NAME = 'keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function generateAndSaveKeys(): Promise<void> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable нужен, чтобы экспортировать публичный
    ['encrypt', 'decrypt'],
  );

  // Экспортируем публичный в PEM для сервера
  const publicPem = await exportPublicKeyToPem(keyPair.publicKey);

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const deviceId = crypto.randomUUID();
  // Сохраняем:
  // id: статичный ключ
  // privateKey: сам объект CryptoKey (IDB умеет его хранить!)
  // publicPem: строка для удобства (или тоже можно хранить ключ)
  // device_id
  store.put({
    id: 'current_user_key',
    privateKey: keyPair.privateKey,
    publicPem: publicPem,
    deviceId: deviceId,
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPrivateKey(): Promise<CryptoKey | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get('current_user_key');
    request.onsuccess = () => resolve(request.result?.privateKey || null);
    request.onerror = () => reject(request.error);
  });
}
export async function getPublicData(): Promise<{
  publicPem: string;
  deviceId: string;
}> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.get('current_user_key');

    req.onsuccess = () =>
      resolve({
        publicPem: req.result.publicPem,
        deviceId: req.result.deviceId,
      });
    req.onerror = () => reject(req.error);
  });
}

export async function hasKeys(): Promise<boolean> {
  const key = await getPrivateKey();
  return key !== null;
}
