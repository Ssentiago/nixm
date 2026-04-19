import { encode, decode } from '@msgpack/msgpack';
import {
  IncomingMessage,
  MSG_AUTH,
  MSG_CHAT_ACCEPTED,
  MSG_CHAT_DECLINED,
  MSG_CHAT_REQUEST,
  MSG_DATA,
  MSG_KEEPALIVE,
  OutgoingMessage,
} from '@/lib/websocket/typing/definitions';

// ─── Encode helpers ───────────────────────────────────────────────────────────

function encodeAuth(
  msg: Extract<OutgoingMessage, { type: typeof MSG_AUTH }>,
): Uint8Array {
  const body = encode([msg.payload, msg.deviceId]);
  const buf = new Uint8Array(1 + body.length);
  buf[0] = MSG_AUTH;
  buf.set(body, 1);
  return buf;
}

function encodeKeepalive(): Uint8Array {
  const body = encode('PING');
  const buf = new Uint8Array(1 + body.length);
  buf[0] = MSG_KEEPALIVE;
  buf.set(body, 1);
  return buf;
}

function encodeData(
  msg: Extract<OutgoingMessage, { type: typeof MSG_DATA }>,
): Uint8Array {
  const messageIdBytes = new TextEncoder().encode(msg.messageId);
  const packedPayloads = encode(msg.payloads);

  const buf = new Uint8Array(1 + 8 + 8 + 36 + packedPayloads.length);
  const view = new DataView(buf.buffer);

  buf[0] = MSG_DATA;
  view.setBigInt64(1, msg.to, false);

  const tsHi = Math.floor(msg.timestamp / 0x1_0000_0000);
  const tsLo = msg.timestamp >>> 0;
  view.setUint32(9, tsHi, false);
  view.setUint32(13, tsLo, false);

  buf.set(messageIdBytes, 17);
  buf.set(packedPayloads, 53);
  return buf;
}

function encodeChatEvent(
  msg: Extract<
    OutgoingMessage,
    {
      type:
        | typeof MSG_CHAT_REQUEST
        | typeof MSG_CHAT_ACCEPTED
        | typeof MSG_CHAT_DECLINED;
    }
  >,
): Uint8Array {
  const buf = new Uint8Array(9);
  const view = new DataView(buf.buffer);
  buf[0] = msg.type;
  view.setUint32(1, Math.floor(msg.to / 0x1_0000_0000), false);
  view.setUint32(5, msg.to >>> 0, false);
  return buf;
}

// ─── Decode helpers ───────────────────────────────────────────────────────────

function decodeAuth(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_AUTH }> | null {
  if (data[1] === 0x45) return { type: MSG_AUTH, payload: 'ERR' };
  const payload = decode(data.subarray(1));
  if (payload === 'ACK') return { type: MSG_AUTH, payload: 'ACK' };
  return null;
}

function decodeKeepalive(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_KEEPALIVE }> | null {
  const payload = decode(data.subarray(1));
  if (payload === 'PONG') return { type: MSG_KEEPALIVE, payload: 'PONG' };
  return null;
}

function decodeData(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_DATA }> | null {
  const MIN_LEN = 1 + 8 + 8 + 36 + 12 + 1;
  if (data.length < MIN_LEN) return null;

  const view = new DataView(data.buffer, data.byteOffset);
  const from = view.getBigInt64(1, false);
  const timestamp =
    view.getUint32(9, false) * 0x1_0000_0000 + view.getUint32(13, false);
  const messageId = new TextDecoder().decode(data.slice(17, 53));
  const iv = data.slice(53, 65);
  const ciphertext = data.slice(65);

  return { type: MSG_DATA, from, timestamp, messageId, iv, ciphertext };
}

function decodeChatRequest(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_CHAT_REQUEST }> {
  const payload = decode(data.subarray(1)) as {
    from: number;
    username: string;
    avatar_url: string | null;
  };
  return { type: MSG_CHAT_REQUEST, ...payload };
}

function decodeChatEvent(
  data: Uint8Array,
  type: typeof MSG_CHAT_ACCEPTED | typeof MSG_CHAT_DECLINED,
): Extract<
  IncomingMessage,
  { type: typeof MSG_CHAT_ACCEPTED | typeof MSG_CHAT_DECLINED }
> {
  const view = new DataView(data.buffer, data.byteOffset);
  const from =
    view.getUint32(1, false) * 0x1_0000_0000 + view.getUint32(5, false);
  return { type, from };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function encodePacket(msg: OutgoingMessage): Uint8Array {
  switch (msg.type) {
    case MSG_AUTH:
      return encodeAuth(msg);
    case MSG_KEEPALIVE:
      return encodeKeepalive();
    case MSG_DATA:
      return encodeData(msg);
    case MSG_CHAT_REQUEST:
    case MSG_CHAT_ACCEPTED:
    case MSG_CHAT_DECLINED:
      return encodeChatEvent(msg);
  }
}

export function decodePacket(data: Uint8Array): IncomingMessage | null {
  if (data.length < 2) return null;
  try {
    switch (data[0]) {
      case MSG_AUTH:
        return decodeAuth(data);
      case MSG_KEEPALIVE:
        return decodeKeepalive(data);
      case MSG_DATA:
        return decodeData(data);
      case MSG_CHAT_REQUEST:
        return decodeChatRequest(data);
      case MSG_CHAT_ACCEPTED:
      case MSG_CHAT_DECLINED:
        return decodeChatEvent(data, data[0]);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
