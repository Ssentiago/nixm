// lib/db/messages.ts

const DB_NAME = 'nixm_messages';
const STORE_NAME = 'messages';

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export type StoredMessage = {
  messageId: string;
  from: string;
  to: string;
  direction: 'sent' | 'received';
  ciphertext: string; // Base64
  iv: string; // Base64
  timestamp: number; // ms, от сервера
  status: MessageStatus;
};

// ─── DB open ─────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      dbPromise = null; // сбрасываем кеш чтобы можно было повторить
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'messageId',
        });

        // Индекс для выборки по собеседнику + сортировки по времени
        // loadMessages(userId, limit, before) использует именно его
        store.createIndex('by_peer_time', ['from', 'timestamp'], {
          unique: false,
        });

        // Быстрая проверка exists()
        store.createIndex('by_messageId', 'messageId', { unique: true });
      }
    };
  });

  return dbPromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function saveMessage(msg: StoredMessage): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(msg);
  await promisifyTransaction(tx);
}

/**
 * Загружает до `limit` сообщений с собеседником `peerId`,
 * опционально только те у которых timestamp < before (для пагинации).
 * Возвращает в порядке возрастания timestamp.
 */
export async function loadMessages(
  peerId: string,
  limit: number,
  before?: number,
): Promise<StoredMessage[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.objectStore(STORE_NAME).index('by_peer_time');

  // IDBKeyRange по составному индексу [from, timestamp]
  const upper = before ?? Date.now();
  const range = IDBKeyRange.bound(
    [peerId, 0],
    [peerId, upper],
    false,
    true, // не включаем before
  );

  const results: StoredMessage[] = [];

  return new Promise((resolve, reject) => {
    // prev — идём от конца (самые новые), берём limit штук
    const request = index.openCursor(range, 'prev');

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) {
        resolve(results.reverse()); // возвращаем в хронологическом порядке
        return;
      }
      results.push(cursor.value as StoredMessage);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

export async function updateStatus(
  messageId: string,
  status: MessageStatus,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const msg = await promisifyRequest<StoredMessage>(store.get(messageId));
  if (!msg) return;

  store.put({ ...msg, status });
  await promisifyTransaction(tx);
}

export async function exists(messageId: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.objectStore(STORE_NAME).index('by_messageId');
  const key = await promisifyRequest(index.getKey(messageId));
  return key !== undefined;
}
