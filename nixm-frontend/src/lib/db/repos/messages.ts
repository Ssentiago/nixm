import { Table } from 'dexie';
import { MessageStatus, StoredMessage } from '@/lib/db/typing/definitions';

export class MessagesRepository {
  constructor(private table: Table<StoredMessage>) {}

  async save(msg: StoredMessage): Promise<void> {
    await this.table.put(msg);
  }

  async exists(messageId: string): Promise<boolean> {
    const record = await this.table.get(messageId);
    return record !== undefined;
  }

  async load(
    peerId: string,
    limit: number,
    before?: number,
  ): Promise<StoredMessage[]> {
    const upper = before ?? Date.now();
    const results = await this.table
      .where('[peerId+timestamp]')
      .between([peerId, 0], [peerId, upper], true, false)
      .reverse()
      .limit(limit)
      .toArray();
    return results.reverse();
  }

  async updateStatus(messageId: string, status: MessageStatus): Promise<void> {
    await this.table.update(messageId, { status });
  }

  async getAllPeerIds(): Promise<{ peerId: string; lastTimestamp: number }[]> {
    const all = await this.table.toArray();
    const map = new Map<string, number>();
    for (const msg of all) {
      const prev = map.get(msg.peerId) ?? 0;
      if (msg.timestamp > prev) map.set(msg.peerId, msg.timestamp);
    }
    return Array.from(map.entries()).map(([peerId, lastTimestamp]) => ({
      peerId,
      lastTimestamp,
    }));
  }
}
