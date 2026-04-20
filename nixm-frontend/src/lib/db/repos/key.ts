import { initializeDevice } from '@/lib/crypto';
import { KeyRecord, PublicKeyData } from '@/lib/db/typing/definitions';
import { Table } from 'dexie';
import { logger } from '@/lib/logger';

export class KeysRepository {
  constructor(private table: Table<KeyRecord>) {}

  async generateAndSaveKeys(userId: string) {
    logger.debug('KeysRepository: starting key generation', { userId });
    try {
      const initialized = await initializeDevice();
      const id = `user_key_${userId}`;

      await this.table.put({
        id,
        privateKey: initialized.privateKey,
        publicKey: initialized.publicKey,
        deviceId: initialized.deviceId,
      });

      logger.info('KeysRepository: device keys generated and saved', {
        userId,
        deviceId: initialized.deviceId,
      });

      return {
        id,
        publicKey: initialized.publicKey,
        deviceId: initialized.deviceId,
      } as PublicKeyData;
    } catch (e) {
      logger.error('KeysRepository: failed to generate or save keys', {
        userId,
        error: String(e),
      });
      throw e;
    }
  }

  async getPrivateKey(userId: string): Promise<string | null> {
    logger.debug('KeysRepository: fetching private key', { userId });
    try {
      const record = await this.table.get(`user_key_${userId}`);
      if (!record) {
        logger.warn('KeysRepository: private key record not found', { userId });
        return null;
      }
      return record.privateKey;
    } catch (e) {
      logger.error('KeysRepository: error fetching private key', {
        userId,
        error: String(e),
      });
      throw e;
    }
  }

  async getPublicData(userId: string): Promise<PublicKeyData | undefined> {
    logger.debug('KeysRepository: fetching public data', { userId });
    try {
      const record = await this.table.get(`user_key_${userId}`);
      if (!record) {
        logger.warn('KeysRepository: public data record not found', { userId });
        return;
      }
      const { privateKey: _, ...rest } = record;
      return rest;
    } catch (e) {
      logger.error('KeysRepository: error fetching public data', {
        userId,
        error: String(e),
      });
      throw e;
    }
  }

  async hasCryptoInitialized(userId: string): Promise<boolean> {
    logger.debug('KeysRepository: checking crypto initialization status', {
      userId,
    });
    try {
      const record = await this.table.get(`user_key_${userId}`);
      const isInitialized =
        !!record?.privateKey?.trim() &&
        !!record?.publicKey?.trim() &&
        !!record?.deviceId?.trim();

      if (!isInitialized) {
        logger.warn('KeysRepository: crypto not fully initialized', { userId });
      } else {
        logger.debug('KeysRepository: crypto status check passed', { userId });
      }

      return isInitialized;
    } catch (e) {
      logger.error('KeysRepository: error checking crypto status', {
        userId,
        error: String(e),
      });
      return false;
    }
  }
}
