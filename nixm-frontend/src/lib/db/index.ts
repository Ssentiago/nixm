import Dexie, { Table } from 'dexie';
import { logger } from '@/lib/logger';
import {
  ChatRecord,
  KeyRecord,
  StoredMessage,
} from '@/lib/db/typing/definitions';
import { KeysRepository } from '@/lib/db/repos/key';
import { MessagesRepository } from '@/lib/db/repos/messages';
import { ChatsRepository } from '@/lib/db/repos/chats';

class NixmDB extends Dexie {
  private _keys!: Table<KeyRecord>;
  private _messages!: Table<StoredMessage>;
  private _chats!: Table<ChatRecord>;

  private _keysRepo?: KeysRepository;
  private _messagesRepo?: MessagesRepository;
  private _chatsRepo?: ChatsRepository;

  get keys() {
    if (!this._keysRepo) {
      logger.debug('NixmDB: Accessing KeysRepository for the first time');
      this._keysRepo = new KeysRepository(this._keys);
    }
    return this._keysRepo;
  }

  get messages() {
    if (!this._messagesRepo) {
      logger.debug('NixmDB: Accessing MessagesRepository for the first time');
      this._messagesRepo = new MessagesRepository(this._messages);
    }
    return this._messagesRepo;
  }

  get chats() {
    if (!this._chatsRepo) {
      logger.debug('NixmDB: Accessing ChatsRepository for the first time');
      this._chatsRepo = new ChatsRepository(this._chats);
    }
    return this._chatsRepo;
  }

  constructor() {
    super('nixm');

    logger.info('NixmDB: initializing IndexedDB instance', {
      dbName: 'nixm',
      version: 1,
    });

    this.version(1).stores({
      _keys: 'id',
      _messages: 'messageId, [peerId+timestamp]',
      _chats: 'peerId',
    });

    // Хуки состояния БД
    this.on('ready', () => {
      logger.info('NixmDB: connection established and database is ready');
    });

    this.on('versionchange', event => {
      logger.warn('NixmDB: database version change detected', {
        newVersion: event.newVersion,
      });
    });

    this.on('blocked', () => {
      logger.error('NixmDB: connection blocked by another tab/instance');
    });

    this.on('populate', () => {
      logger.info('NixmDB: first time population of the database');
    });
  }
}

export const db = new NixmDB();
