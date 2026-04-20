import { ChatRecord } from '@/lib/db/typing/definitions';
import { Table } from 'dexie';

export class ChatsRepository {
  constructor(private table: Table<ChatRecord>) {}

  async save(chat: ChatRecord): Promise<void> {
    await this.table.put(chat);
  }

  async getAll(): Promise<ChatRecord[]> {
    return this.table.toArray();
  }

  async get(peerId: string): Promise<ChatRecord | undefined> {
    return this.table.get(peerId);
  }
}
