export const MSG_AUTH = 0;
export const MSG_DATA = 1;
export const MSG_KEEPALIVE = 2;
export const MSG_CHAT_REQUEST = 3;
export const MSG_CHAT_ACCEPTED = 4;
export const MSG_CHAT_DECLINED = 5;
export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'authed';

type MessagePayload = {
  device_id: string;
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

export type OutgoingMessage =
  | { type: typeof MSG_AUTH; payload: string; deviceId: string }
  | { type: typeof MSG_KEEPALIVE; payload: 'PING' }
  | {
      type: typeof MSG_DATA;
      to: bigint;
      messageId: string;
      timestamp: number;
      payloads: MessagePayload[];
    }
  | { type: typeof MSG_CHAT_REQUEST; to: number }
  | { type: typeof MSG_CHAT_ACCEPTED; to: number }
  | { type: typeof MSG_CHAT_DECLINED; to: number };

export type IncomingMessage =
  | { type: typeof MSG_AUTH; payload: 'ACK' | 'ERR' }
  | { type: typeof MSG_KEEPALIVE; payload: 'PONG' }
  | {
      type: typeof MSG_DATA;
      from: bigint;
      messageId: string;
      timestamp: number;
      senderDeviceId: string;
      iv: Uint8Array;
      ciphertext: Uint8Array;
    }
  | {
      type: typeof MSG_CHAT_REQUEST;
      from: number;
      username: string;
      avatar_url: string | null;
    }
  | { type: typeof MSG_CHAT_ACCEPTED; from: number }
  | { type: typeof MSG_CHAT_DECLINED; from: number };

type WSEventMap = {
  status: WSStatus;
  message: IncomingMessage;
  error: Event;
};

type MessageEventMap = {
  [MSG_DATA]: Extract<IncomingMessage, { type: typeof MSG_DATA }>;
  [MSG_CHAT_REQUEST]: Extract<
    IncomingMessage,
    { type: typeof MSG_CHAT_REQUEST }
  >;
  [MSG_CHAT_ACCEPTED]: Extract<
    IncomingMessage,
    { type: typeof MSG_CHAT_ACCEPTED }
  >;
  [MSG_CHAT_DECLINED]: Extract<
    IncomingMessage,
    { type: typeof MSG_CHAT_DECLINED }
  >;
};
