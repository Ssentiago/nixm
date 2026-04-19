import { EventEmitter } from './emitter';
import {
  IncomingMessage,
  MSG_CHAT_ACCEPTED,
  MSG_CHAT_DECLINED,
  MSG_CHAT_REQUEST,
  MSG_DATA,
} from './typing/definitions';

type ExtractMessage<T extends IncomingMessage['type']> = Extract<
  IncomingMessage,
  { type: T }
>;

type MessageEventMap = {
  [MSG_DATA]: ExtractMessage<typeof MSG_DATA>;
  [MSG_CHAT_REQUEST]: ExtractMessage<typeof MSG_CHAT_REQUEST>;
  [MSG_CHAT_ACCEPTED]: ExtractMessage<typeof MSG_CHAT_ACCEPTED>;
  [MSG_CHAT_DECLINED]: ExtractMessage<typeof MSG_CHAT_DECLINED>;
};

class MessageRouter extends EventEmitter<MessageEventMap> {
  dispatch(msg: IncomingMessage): void {
    switch (msg.type) {
      case MSG_DATA:
        this.emit(MSG_DATA, msg);
        break;
      case MSG_CHAT_REQUEST:
        this.emit(MSG_CHAT_REQUEST, msg);
        break;
      case MSG_CHAT_ACCEPTED:
        this.emit(MSG_CHAT_ACCEPTED, msg);
        break;
      case MSG_CHAT_DECLINED:
        this.emit(MSG_CHAT_DECLINED, msg);
        break;
    }
  }
}

export const wsRouter = new MessageRouter();
