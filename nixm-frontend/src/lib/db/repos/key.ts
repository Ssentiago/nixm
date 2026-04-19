import { initializeDevice } from '@/lib/crypto';
import { KeyRecord, PublicKeyData } from '@/lib/db/typing/definitions';
import { Table } from 'dexie';

export class KeysRepository {
  constructor(private table: Table<KeyRecord>) {}

  async generateAndSaveKeys(userId: string) {
    const initialized = await initializeDevice();
    await this.table.put({
      id: `user_key_${userId}`,
      privateKey: initialized.privateKey,
      publicKey: initialized.publicKey,
      deviceId: initialized.deviceId,
    });
    return {
      id: `user_key_${userId}`,
      publicKey: initialized.publicKey,
      deviceId: initialized.deviceId,
    } as PublicKeyData;
  }
  async getPrivateKey(userId: string): Promise<string | null> {
    const record = await this.table.get(`user_key_${userId}`);
    return record?.privateKey ?? null;
  }

  async getPublicData(userId: string): Promise<PublicKeyData | undefined> {
    const record = await this.table.get(`user_key_${userId}`);
    if (!record) return;
    const { privateKey: _, ...rest } = record;
    return rest;
  }

  async hasCryptoInitialized(userId: string): Promise<boolean> {
    const record = await this.table.get(`user_key_${userId}`);
    return (
      !!record?.privateKey?.trim() &&
      !!record?.publicKey?.trim() &&
      !!record?.deviceId?.trim()
    );
  }
}
