import { LogRecord, SessionRecord } from './typing/definitions';
import Dexie, { Table } from 'dexie';

const MAX_ENTRIES = 10_000;
const MAX_AGE_DAYS = 30;

class LogsRepository {
  constructor(private table: Table<LogRecord>) {}

  async save(entry: LogRecord): Promise<void> {
    await this.table.add(entry);
    await this.rotate();
  }

  async getAll(): Promise<LogRecord[]> {
    return this.table.orderBy('timestamp').toArray();
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  async clear(): Promise<void> {
    await this.table.clear();
  }

  private async rotate(): Promise<void> {
    try {
      const count = await this.table.count();
      if (count > MAX_ENTRIES) {
        const keys = await this.table
          .orderBy('id')
          .limit(count - MAX_ENTRIES)
          .primaryKeys();
        await this.table.bulkDelete(keys as number[]);
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
      await this.table.where('timestamp').below(cutoff.toISOString()).delete();
    } catch {}
  }
}

class SessionsRepository {
  constructor(private table: Table<SessionRecord>) {}

  async save(entry: SessionRecord): Promise<void> {
    await this.table.add(entry);
  }

  async getAll(): Promise<SessionRecord[]> {
    return this.table.orderBy('timestamp').toArray();
  }

  async clear(): Promise<void> {
    await this.table.clear();
  }
}

class LogsDB extends Dexie {
  private _logs!: Table<LogRecord>;
  private _sessions!: Table<SessionRecord>;

  private _logsRepo?: LogsRepository;
  private _sessionsRepo?: SessionsRepository;

  get logs() {
    return (this._logsRepo ??= new LogsRepository(this._logs));
  }

  get sessions() {
    return (this._sessionsRepo ??= new SessionsRepository(this._sessions));
  }

  constructor() {
    super('nixm_logs');
    this.version(1).stores({
      _logs: '++id, timestamp, level',
      _sessions: '++id, timestamp',
    });
  }
}

export const logsDB = new LogsDB();
