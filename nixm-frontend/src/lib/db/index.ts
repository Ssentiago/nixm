import Dexie, { Table } from 'dexie';
import { KeyRecord, StoredMessage } from '@/lib/db/typing/definitions';
import { KeysRepository } from '@/lib/db/repos/key';
import { MessagesRepository } from '@/lib/db/repos/messages';

class NixmDB extends Dexie {
  private _keys!: Table<KeyRecord>;
  private _messages!: Table<StoredMessage>;

  private _keysRepo?: KeysRepository;
  private _messagesRepo?: MessagesRepository;

  get keys() {
    return (this._keysRepo ??= new KeysRepository(this._keys));
  }

  get messages() {
    return (this._messagesRepo ??= new MessagesRepository(this._messages));
  }

  constructor() {
    super('nixm');
    this.version(1).stores({
      _keys: 'id',
      _messages: 'messageId, [peerId+timestamp]',
    });
  }
}

const db = new NixmDB();
