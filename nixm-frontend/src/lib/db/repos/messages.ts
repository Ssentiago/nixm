import { Table } from 'dexie';
import { MessageStatus, StoredMessage } from '@/lib/db/typing/definitions';
import { logger } from '@/lib/logger';

export class MessagesRepository {
  constructor(private table: Table<StoredMessage>) {}

  async save(msg: StoredMessage): Promise<void> {
    logger.debug('MessagesRepository: saving message', {
      mid: msg.messageId,
      peerId: msg.peerId,
    });
    try {
      await this.table.put(msg);
    } catch (e) {
      logger.error('MessagesRepository: save failed', {
        mid: msg.messageId,
        error: String(e),
      });
      throw e;
    }
  }

  async exists(messageId: string): Promise<boolean> {
    logger.debug('MessagesRepository: checking existence', { messageId });
    try {
      const record = await this.table.get(messageId);
      return record !== undefined;
    } catch (e) {
      logger.error('MessagesRepository: existence check failed', {
        messageId,
        error: String(e),
      });
      return false;
    }
  }

  async load(
    peerId: string,
    limit: number,
    before?: number,
  ): Promise<StoredMessage[]> {
    const upper = before ?? Date.now();
    logger.debug('MessagesRepository: loading history', {
      peerId,
      limit,
      before: upper,
    });
    try {
      const results = await this.table
        .where('[peerId+timestamp]')
        .between([peerId, 0], [peerId, upper], true, false)
        .reverse()
        .limit(limit)
        .toArray();

      logger.debug('MessagesRepository: history chunk loaded', {
        peerId,
        count: results.length,
      });
      return results.reverse();
    } catch (e) {
      logger.error('MessagesRepository: load history failed', {
        peerId,
        error: String(e),
      });
      throw e;
    }
  }

  async updateStatus(messageId: string, status: MessageStatus): Promise<void> {
    logger.debug('MessagesRepository: updating status', { messageId, status });
    try {
      const updated = await this.table.update(messageId, { status });
      if (updated === 0) {
        logger.warn('MessagesRepository: status update target not found', {
          messageId,
        });
      }
    } catch (e) {
      logger.error('MessagesRepository: status update failed', {
        messageId,
        error: String(e),
      });
      throw e;
    }
  }

  async getAllPeerIds(): Promise<{ peerId: string; lastTimestamp: number }[]> {
    logger.debug('MessagesRepository: mapping all peer IDs for hydration');
    try {
      const all = await this.table.toArray();
      const map = new Map<string, number>();
      for (const msg of all) {
        const prev = map.get(msg.peerId) ?? 0;
        if (msg.timestamp > prev) map.set(msg.peerId, msg.timestamp);
      }
      const summary = Array.from(map.entries()).map(
        ([peerId, lastTimestamp]) => ({
          peerId,
          lastTimestamp,
        }),
      );
      logger.debug('MessagesRepository: peer mapping complete', {
        uniquePeers: summary.length,
      });
      return summary;
    } catch (e) {
      logger.error('MessagesRepository: peer mapping failed', {
        error: String(e),
      });
      throw e;
    }
  }
}
