import { encode, decode } from '@msgpack/msgpack';
import { logger } from '@/lib/logger';
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
  logger.debug('Encoding MSG_AUTH', { deviceId: msg.deviceId });
  const body = encode([msg.payload, msg.deviceId]);
  const buf = new Uint8Array(1 + body.length);
  buf[0] = MSG_AUTH;
  buf.set(body, 1);
  return buf;
}

function encodeKeepalive(): Uint8Array {
  logger.debug('Encoding MSG_KEEPALIVE (PING)');
  const body = encode('PING');
  const buf = new Uint8Array(1 + body.length);
  buf[0] = MSG_KEEPALIVE;
  buf.set(body, 1);
  return buf;
}

function encodeData(
  msg: Extract<OutgoingMessage, { type: typeof MSG_DATA }>,
): Uint8Array {
  logger.debug('Encoding MSG_DATA', {
    to: String(msg.to),
    messageId: msg.messageId,
  });
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

  logger.debug('MSG_DATA binary structure ready', { totalSize: buf.length });
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
  logger.debug('Encoding Chat Event', { type: msg.type, to: String(msg.to) });
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
  if (data[1] === 0x45) {
    logger.warn('Received Auth Error from server (0x45)');
    return { type: MSG_AUTH, payload: 'ERR' };
  }
  const payload = decode(data.subarray(1));
  logger.info('Auth response decoded', { status: payload });
  if (payload === 'ACK') return { type: MSG_AUTH, payload: 'ACK' };
  return null;
}

function decodeKeepalive(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_KEEPALIVE }> | null {
  const payload = decode(data.subarray(1));
  if (payload === 'PONG') {
    logger.debug('Received PONG');
    return { type: MSG_KEEPALIVE, payload: 'PONG' };
  }
  return null;
}

function decodeData(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_DATA }> | null {
  const MIN_LEN = 1 + 8 + 8 + 36 + 36 + 12 + 1;
  if (data.length < MIN_LEN) return null;

  const view = new DataView(data.buffer, data.byteOffset);
  const from = view.getBigInt64(1, false);
  const timestamp =
    view.getUint32(9, false) * 0x1_0000_0000 + view.getUint32(13, false);
  const messageId = new TextDecoder().decode(data.slice(17, 53));
  const senderDeviceId = new TextDecoder().decode(data.slice(53, 89)); // новое
  const iv = data.slice(89, 101); // сдвинулось на 36
  const ciphertext = data.slice(101); // сдвинулось на 36

  return {
    type: MSG_DATA,
    from,
    timestamp,
    messageId,
    senderDeviceId,
    iv,
    ciphertext,
  };
}
function decodeChatRequest(
  data: Uint8Array,
): Extract<IncomingMessage, { type: typeof MSG_CHAT_REQUEST }> {
  logger.info('Decoding Incoming Chat Request');
  const payload = decode(data.subarray(1)) as {
    from: number;
    username: string;
    avatar_url: string | null;
  };
  logger.debug('Chat Request details', {
    from: String(payload.from),
    username: payload.username,
  });
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

  logger.info('Chat Event decoded', { type, from: String(from) });
  return { type, from };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function encodePacket(msg: OutgoingMessage): Uint8Array {
  try {
    const packet = (() => {
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
    })();
    return packet;
  } catch (e) {
    logger.error('Critical Error encoding packet', {
      type: msg.type,
      error: String(e),
    });
    throw e;
  }
}

export function decodePacket(data: Uint8Array): IncomingMessage | null {
  if (data.length < 2) {
    logger.warn('Packet too short to decode', { length: data.length });
    return null;
  }

  try {
    const type = data[0];
    const packet = (() => {
      switch (type) {
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
          return decodeChatEvent(data, type);
        default:
          logger.warn('Received unknown packet type', { type });
          return null;
      }
    })();
    return packet;
  } catch (e) {
    logger.error('Packet decoding crashed', {
      error: String(e),
      firstByte: data[0],
      rawLength: data.length,
    });
    return null;
  }
}
