import Dexie, { Table } from 'dexie';
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
    return (this._keysRepo ??= new KeysRepository(this._keys));
  }

  get messages() {
    return (this._messagesRepo ??= new MessagesRepository(this._messages));
  }

  get chats() {
    return (this._chatsRepo ??= new ChatsRepository(this._chats));
  }

  constructor() {
    super('nixm');
    this.version(1).stores({
      _keys: 'id',
      _messages: 'messageId, [peerId+timestamp]',
      _chats: 'peerId',
    });
  }
}

export const db = new NixmDB();
