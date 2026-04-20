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
