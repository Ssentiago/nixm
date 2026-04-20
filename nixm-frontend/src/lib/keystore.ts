import { api } from '@/lib/api/api';
import { base64ToArrayBuffer, arrayBufferToBase64 } from '@/lib/crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export type EncryptedPayload = {
  iv: string;
  data: string;
};

type DeviceId = string;
type UserId = string;
type PubKeyBase64 = string;

export type EncryptedBlob = {
  deviceId: DeviceId;
  payload: EncryptedPayload;
};

export class KeyStore {
  private myPrivateKey: CryptoKey | null = null;
  private myDeviceId: DeviceId | null = null;
  private myPublicKey: PubKeyBase64 | null = null;
  private myUserId: UserId | null = null;

  private aesKeyCache = new Map<PubKeyBase64, CryptoKey>();
  private pubKeyCache = new Map<UserId, Map<DeviceId, PubKeyBase64>>();

  // ─── Init ────────────────────────────────────────────────────────────────────

  async init(userId: UserId): Promise<void> {
    logger.info('KeyStore: init', { userId });
    this.myUserId = userId;

    let publicData = await db.keys.getPublicData(userId);
    if (!publicData) {
      logger.info('KeyStore: no keys found, generating');
      publicData = await db.keys.generateAndSaveKeys(userId);
    }

    const privateKeyBase64 = await db.keys.getPrivateKey(userId);
    if (!privateKeyBase64) {
      throw new Error('KeyStore: private key missing after generation');
    }

    this.myPrivateKey = await this.importPrivateKey(privateKeyBase64);
    this.myPublicKey = publicData.publicKey;
    this.myDeviceId = publicData.deviceId;

    await api.keys.upload(publicData.publicKey, publicData.deviceId);

    logger.info('KeyStore: ready', { deviceId: this.myDeviceId });
  }

  get deviceId(): DeviceId | null {
    return this.myDeviceId;
  }

  get publicKey(): PubKeyBase64 | null {
    return this.myPublicKey;
  }

  get isReady(): boolean {
    return (
      this.myPrivateKey !== null &&
      this.myDeviceId !== null &&
      this.myPublicKey !== null
    );
  }

  // ─── Cache invalidation ───────────────────────────────────────────────────────

  invalidateAll(): void {
    logger.info('KeyStore: invalidating all caches');
    this.pubKeyCache.clear();
    this.aesKeyCache.clear();
  }

  // ─── Public keys ─────────────────────────────────────────────────────────────

  async getPubKeysFor(userId: UserId): Promise<Map<DeviceId, PubKeyBase64>> {
    const cached = this.pubKeyCache.get(userId);
    if (cached) {
      logger.debug('KeyStore: pubKey cache hit', { userId });
      return cached;
    }

    logger.debug('KeyStore: fetching pubKeys from server', { userId });
    const records = await api.keys.keysFor(userId);

    const map = new Map<DeviceId, PubKeyBase64>();
    for (const rec of records) {
      map.set(rec.device_id, rec.public_key);
    }

    this.pubKeyCache.set(userId, map);
    return map;
  }

  // ─── AES key derivation ───────────────────────────────────────────────────────

  private async getAesKey(peerPubKeyBase64: PubKeyBase64): Promise<CryptoKey> {
    const cached = this.aesKeyCache.get(peerPubKeyBase64);
    if (cached) {
      logger.debug('KeyStore: AES cache hit');
      return cached;
    }

    if (!this.myPrivateKey) {
      throw new Error('KeyStore: not initialized');
    }

    logger.debug('KeyStore: deriving AES key');

    const peerPublicKey = await crypto.subtle.importKey(
      'spki',
      base64ToArrayBuffer(peerPubKeyBase64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      this.myPrivateKey,
      256,
    );

    const hashed = await crypto.subtle.digest('SHA-256', sharedBits);

    const aesKey = await crypto.subtle.importKey(
      'raw',
      hashed,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );

    this.aesKeyCache.set(peerPubKeyBase64, aesKey);
    return aesKey;
  }

  // ─── Encrypt ─────────────────────────────────────────────────────────────────

  async encryptForAll(
    plaintext: string,
    userIds: UserId[],
  ): Promise<EncryptedBlob[]> {
    if (!this.myUserId) throw new Error('KeyStore: not initialized');

    // автоматически включаем свои устройства
    const allUserIds = userIds.includes(this.myUserId)
      ? userIds
      : [...userIds, this.myUserId];

    const encoded = new TextEncoder().encode(plaintext);
    const results: EncryptedBlob[] = [];

    for (const userId of allUserIds) {
      const deviceMap = await this.getPubKeysFor(userId);

      const tasks = Array.from(deviceMap.entries()).map(
        async ([deviceId, pubKey]) => {
          const aesKey = await this.getAesKey(pubKey);
          const iv = crypto.getRandomValues(new Uint8Array(12));

          const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            encoded,
          );

          return {
            deviceId,
            payload: {
              iv: arrayBufferToBase64(iv.buffer),
              data: arrayBufferToBase64(cipherBuffer),
            },
          } satisfies EncryptedBlob;
        },
      );

      const userResults = await Promise.all(tasks);
      results.push(...userResults);
    }

    logger.debug('KeyStore: encryptForAll done', {
      userCount: allUserIds.length,
      blobCount: results.length,
    });

    return results;
  }

  // ─── Decrypt ─────────────────────────────────────────────────────────────────

  async decrypt(
    blob: EncryptedPayload,
    senderUserId: UserId,
    senderDeviceId: DeviceId,
  ): Promise<string> {
    const deviceMap = await this.getPubKeysFor(senderUserId);
    const senderPubKey = deviceMap.get(senderDeviceId);

    if (!senderPubKey) {
      throw new Error(
        `KeyStore: unknown device ${senderDeviceId} for user ${senderUserId}`,
      );
    }

    const aesKey = await this.getAesKey(senderPubKey);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(blob.iv)) },
      aesKey,
      base64ToArrayBuffer(blob.data),
    );

    return new TextDecoder().decode(decrypted);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async importPrivateKey(base64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'pkcs8',
      base64ToArrayBuffer(base64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  }
}
