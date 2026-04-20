import { logger } from '@/lib/logger';

export async function computeSafetyNumber(
  myPublicKey: string,
  theirPublicKey: string,
  myUserId: string,
  theirUserId: string,
): Promise<string> {
  logger.debug('Computing safety number', { myUserId, theirUserId });

  // Сортируем по userId чтобы результат был одинаковый у обоих
  const [first, second] =
    myUserId < theirUserId
      ? [myPublicKey + myUserId, theirPublicKey + theirUserId]
      : [theirPublicKey + theirUserId, myPublicKey + myUserId];

  const raw = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(first + second),
  );

  const result = Array.from(new Uint8Array(raw))
    .map(b => b.toString().padStart(3, '0'))
    .join('')
    .slice(0, 60)
    .match(/.{5}/g)!
    .join(' ');

  logger.info('Safety number computed successfully');
  return result;
}

export function base64ToArrayBuffer(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    logger.error('Failed to convert base64 to ArrayBuffer', {
      error: String(e),
    });
    throw e;
  }
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
  logger.info('Initializing new device keys and ID');
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits'],
    );

    const privateKey = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);

    const privateKeyBase64 = arrayBufferToBase64(privateKey);
    const publicKeyBase64 = arrayBufferToBase64(publicKey);
    const deviceId = crypto.randomUUID();

    logger.debug('Device keys generated', {
      deviceId,
      pubKeyPrefix: publicKeyBase64.slice(0, 20),
    });

    return {
      privateKey: privateKeyBase64,
      publicKey: publicKeyBase64,
      deviceId: deviceId,
    };
  } catch (e) {
    logger.error('Device initialization failed', { error: String(e) });
    throw e;
  }
}

export class NixmCrypto {
  myPrivateKeyBase64: string;
  peerPublicKeyBase64: string;
  aesKey: CryptoKey | null;

  constructor(myPrivateKeyBase64: string, peerPublicKeyBase64: string) {
    this.myPrivateKeyBase64 = myPrivateKeyBase64;
    this.peerPublicKeyBase64 = peerPublicKeyBase64;
    this.aesKey = null;
    logger.debug('NixmCrypto instance created', {
      peerPubKeyPrefix: peerPublicKeyBase64.slice(0, 15),
    });
  }

  async init() {
    logger.info('Starting NixmCrypto initialization (ECDH Handshake)');
    try {
      const myPrivateRaw = base64ToArrayBuffer(this.myPrivateKeyBase64);
      const peerPublicRaw = base64ToArrayBuffer(this.peerPublicKeyBase64);

      logger.debug('Importing keys for derivation...');
      const importedMyPrivateKey = await crypto.subtle.importKey(
        'pkcs8',
        myPrivateRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveBits'],
      );

      const importedPeerPublicKey = await crypto.subtle.importKey(
        'spki',
        peerPublicRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      );

      logger.debug('Deriving shared secret bits...');
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: importedPeerPublicKey },
        importedMyPrivateKey,
        256,
      );

      logger.debug('Hashing shared secret with SHA-256...');
      const hashed = await crypto.subtle.digest('SHA-256', sharedBits);

      this.aesKey = await crypto.subtle.importKey(
        'raw',
        hashed,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );

      logger.info(
        'AES-GCM key derived and imported successfully. Crypto ready.',
      );
      return true;
    } catch (e) {
      logger.error('NixmCrypto initialization failed', { error: String(e) });
      throw e;
    }
  }

  async encrypt(plaintext: string) {
    if (!this.aesKey) {
      const err = 'NixmCrypto not initialized before encryption';
      logger.error(err);
      throw new Error(err);
    }

    logger.debug('Encrypting message', { length: plaintext.length });

    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(plaintext);

      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        this.aesKey,
        encoded,
      );

      const ivBase64 = arrayBufferToBase64(iv.buffer);
      const encodedBase64 = arrayBufferToBase64(encryptedBuffer);

      logger.debug('Message encrypted', { iv: ivBase64 });
      return {
        iv: ivBase64,
        data: encodedBase64,
      };
    } catch (e) {
      logger.error('Encryption process failed', { error: String(e) });
      throw e;
    }
  }

  async decrypt(cipherBase64: string, ivBase64: string) {
    if (!this.aesKey) {
      const err = 'NixmCrypto not initialized before decryption';
      logger.error(err);
      throw new Error(err);
    }

    logger.debug('Decrypting message', {
      iv: ivBase64,
      dataLength: cipherBase64.length,
    });

    try {
      const encrypted = base64ToArrayBuffer(cipherBase64);
      const ivBuffer = base64ToArrayBuffer(ivBase64);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
        this.aesKey,
        encrypted,
      );

      const decoded = new TextDecoder().decode(decrypted);
      logger.debug('Message decrypted successfully');
      return decoded;
    } catch (e) {
      logger.error('Decryption failed. Check if keys match!', {
        error: String(e),
        iv: ivBase64,
      });
      throw e;
    }
  }
}
