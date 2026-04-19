export async function computeSafetyNumber(
  myPublicKey: string,
  theirPublicKey: string,
  myUserId: string,
  theirUserId: string,
): Promise<string> {
  // Сортируем по userId чтобы результат был одинаковый у обоих
  const [first, second] =
    myUserId < theirUserId
      ? [myPublicKey + myUserId, theirPublicKey + theirUserId]
      : [theirPublicKey + theirUserId, myPublicKey + myUserId];

  const raw = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(first + second),
  );

  // Форматируем как 12 групп по 5 цифр — как у Signal
  return Array.from(new Uint8Array(raw))
    .map(b => b.toString().padStart(3, '0'))
    .join('')
    .slice(0, 60)
    .match(/.{5}/g)!
    .join(' ');
}

export function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function initializeDevice() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );

  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);

  const privateKeyBase64 = arrayBufferToBase64(privateKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKey);

  const deviceId = crypto.randomUUID();

  return {
    privateKey: privateKeyBase64,
    publicKey: publicKeyBase64,
    deviceId: deviceId,
  };
}

export class NixmCrypto {
  myPrivateKeyBase64: string;
  theirPublicKeyBase64: string;
  aesKey: CryptoKey | null;

  constructor(myPrivateKeyBase64: string, theirPublicKeyBase64: string) {
    this.myPrivateKeyBase64 = myPrivateKeyBase64;
    this.theirPublicKeyBase64 = theirPublicKeyBase64;
    this.aesKey = null; // Здесь будет храниться общий симметричный ключ AES
  }

  async init() {
    // Преобразуем ключи из Base64 в ArrayBuffer
    const myPrivateRaw = base64ToArrayBuffer(this.myPrivateKeyBase64);
    const theirPublicRaw = base64ToArrayBuffer(this.theirPublicKeyBase64);

    const importedMyPrivateKey = await crypto.subtle.importKey(
      'pkcs8', // Формат приватного ключа (стандартный)
      myPrivateRaw,
      { name: 'ECDH', namedCurve: 'P-256' }, // Алгоритм и параметры
      false, // Неэкспортируемый
      ['deriveBits'], // Разрешенное использование: для вывода бит (общего секрета)
    );

    const importedTheirPublicKey = await crypto.subtle.importKey(
      'spki', // Формат публичного ключа (стандартный)
      theirPublicRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // Неэкспортируемый
      [], // Для публичного ключа в ECDH здесь специфические использования не нужны
    );

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: importedTheirPublicKey }, // Указываем публичный ключ собеседника
      importedMyPrivateKey, // Наш приватный ключ
      256, // Длина выводимого секрета в битах
    );
    const hashed = await crypto.subtle.digest('SHA-256', sharedBits);

    const aesKey = await crypto.subtle.importKey(
      'raw', // Формат "сырых" байт
      hashed, // Хешированный секрет
      { name: 'AES-GCM' }, // Алгоритм симметричного шифрования
      false, // Неэкспортируемый
      ['encrypt', 'decrypt'], // Разрешенные использования: шифрование и дешифрование
    );

    this.aesKey = aesKey; // ✅ ВАЖНО! Сохраняем полученный ключ AES

    return true;
  }

  async encrypt(plaintext: string) {
    if (!this.aesKey) {
      throw new Error('NixmCrypto not initialized');
    }

    // Генерируем уникальный вектор инициализации (IV)
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 байт (96 бит) рекомендуется для AES-GCM

    // Преобразуем текстовое сообщение в байты (UTF-8)
    const encoded = new TextEncoder().encode(plaintext);

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      this.aesKey,
      encoded,
    );

    const ivBase64 = arrayBufferToBase64(iv.buffer);
    const encodedBase64 = arrayBufferToBase64(encryptedBuffer);
    return {
      iv: ivBase64,
      data: encodedBase64,
    };
  }

  async decrypt(cipherBase64: string, ivBase64: string) {
    if (!this.aesKey) {
      throw new Error('NixmCrypto not initialized');
    }

    // Преобразуем шифротекст и IV из Base64 в ArrayBuffer
    const encrypted = base64ToArrayBuffer(cipherBase64);
    const ivBuffer = base64ToArrayBuffer(ivBase64);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      this.aesKey, // Тот же общий ключ AES
      encrypted, // Зашифрованные данные)
    );
    return new TextDecoder().decode(decrypted);
  }
}

// async function main() {
//   const alice = await initializeDevice();
//   const bob = await initializeDevice();
//
//   const aliceCrypto = new NixmCrypto(alice.privateKey, bob.publicKey);
//   try {
//     await aliceCrypto.init();
//   } catch (e) {
//     console.log('Err when initializing Alice crypto: ', e);
//   }
//
//   const bobCrypto = new NixmCrypto(bob.privateKey, alice.publicKey);
//
//   try {
//     await bobCrypto.init();
//   } catch (e) {
//     console.log('Err when initializing Bob crypto: ', e);
//   }
//
//   const aliceMessage = 'Hello!';
//
//   console.log('before encrypt: ', aliceMessage);
//
//   // алиса шифрует перед отправкой...
//   const encrypted = await aliceCrypto.encrypt(aliceMessage);
//
//   // передаём данные по сети...
//
//   // боб получил данные
//   const aliceEncrypted = encrypted;
//
//   const decrypted = await bobCrypto.decrypt(
//     aliceEncrypted.data,
//     aliceEncrypted.iv,
//   );
//
//   // расшифрованное сообщение алисы
//   console.log('decryped got from alice: ', decrypted);
//
//   // боб пишет сообщение
//   const bobMessage = 'Hello! How are you?';
//   const bobEncrypted = await bobCrypto.encrypt(bobMessage);
//
//   // передаем данные по сети...
//
//   // алиса получила
//   const bobDecrypted = await aliceCrypto.decrypt(
//     bobEncrypted.data,
//     bobEncrypted.iv,
//   );
//
//   console.log('Alice got from bob: ', bobDecrypted);
// }

// main();
