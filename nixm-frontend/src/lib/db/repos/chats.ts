import { ChatRecord } from '@/lib/db/typing/definitions';
import { Table } from 'dexie';
import { logger } from '@/lib/logger';

export class ChatsRepository {
  constructor(private table: Table<ChatRecord>) {}

  async save(chat: ChatRecord): Promise<void> {
    logger.debug('ChatsRepository: saving chat record', {
      peerId: chat.peerId,
      username: chat.username,
    });
    try {
      await this.table.put(chat);
    } catch (e) {
      logger.error('ChatsRepository: failed to save chat', {
        peerId: chat.peerId,
        error: String(e),
      });
      throw e;
    }
  }

  async getAll(): Promise<ChatRecord[]> {
    logger.debug('ChatsRepository: fetching all chats');
    try {
      const chats = await this.table.toArray();
      logger.debug('ChatsRepository: fetched chats list', {
        count: chats.length,
      });
      return chats;
    } catch (e) {
      logger.error('ChatsRepository: failed to fetch all chats', {
        error: String(e),
      });
      throw e;
    }
  }

  async get(peerId: string): Promise<ChatRecord | undefined> {
    logger.debug('ChatsRepository: fetching chat', { peerId });
    try {
      const chat = await this.table.get(peerId);
      if (!chat) {
        logger.warn('ChatsRepository: chat record not found in DB', { peerId });
      } else {
        logger.debug('ChatsRepository: chat retrieved', { peerId });
      }
      return chat;
    } catch (e) {
      logger.error('ChatsRepository: get operation failed', {
        peerId,
        error: String(e),
      });
      throw e;
    }
  }
}
