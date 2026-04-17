import { encode, decode } from '@msgpack/msgpack';

export const MSG_AUTH = 0;
export const MSG_DATA = 1;
export const MSG_KEEPALIVE = 2;

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
      to: number;
      messageId: string;
      timestamp: number;
      payloads: MessagePayload[];
    };

export type IncomingMessage =
  | { type: typeof MSG_AUTH; payload: 'ACK' | 'ERR' }
  | { type: typeof MSG_KEEPALIVE; payload: 'PONG' }
  | {
      type: typeof MSG_DATA;
      from: number;
      messageId: string;
      timestamp: number;
      iv: Uint8Array;
      ciphertext: Uint8Array;
    };

// ─── Encode ──────────────────────────────────────────────────────────────────

export function encodePacket(msg: OutgoingMessage): Uint8Array {
  switch (msg.type) {
    case MSG_AUTH: {
      const tokenBytes = encode([msg.payload, msg.deviceId]); // массив из двух строк
      const buf = new Uint8Array(1 + tokenBytes.length);
      buf[0] = MSG_AUTH;
      buf.set(tokenBytes, 1);
      return buf;
    }

    case MSG_KEEPALIVE: {
      const pingBytes = encode('PING');
      const buf = new Uint8Array(1 + pingBytes.length);
      buf[0] = MSG_KEEPALIVE;
      buf.set(pingBytes, 1);
      return buf;
    }

    case MSG_DATA: {
      // [0x01][to: 8b][timestamp: 8b][messageId: 36b][msgpack(payloads)]
      const messageIdBytes = new TextEncoder().encode(msg.messageId);
      const packedPayloads = encode(msg.payloads);

      const buf = new Uint8Array(1 + 8 + 8 + 36 + packedPayloads.length);
      const view = new DataView(buf.buffer);

      buf[0] = MSG_DATA;

      const hi = Math.floor(msg.to / 0x1_0000_0000);
      const lo = msg.to >>> 0;
      view.setUint32(1, hi, false);
      view.setUint32(5, lo, false);

      const tsHi = Math.floor(msg.timestamp / 0x1_0000_0000);
      const tsLo = msg.timestamp >>> 0;
      view.setUint32(9, tsHi, false);
      view.setUint32(13, tsLo, false);

      buf.set(messageIdBytes, 17);
      buf.set(packedPayloads, 53);

      return buf;
    }
  }
}

// ─── Decode ──────────────────────────────────────────────────────────────────

export function decodePacket(data: Uint8Array): IncomingMessage | null {
  if (data.length < 2) return null;

  const type = data[0];

  try {
    switch (type) {
      case MSG_AUTH: {
        if (data[1] === 0x45) {
          return { type: MSG_AUTH, payload: 'ERR' };
        }
        const payload = decode(data.subarray(1));
        if (payload === 'ACK') return { type: MSG_AUTH, payload: 'ACK' };
        return null;
      }

      case MSG_KEEPALIVE: {
        const payload = decode(data.subarray(1));
        if (payload === 'PONG') return { type: MSG_KEEPALIVE, payload: 'PONG' };
        return null;
      }

      case MSG_DATA: {
        // [0x01][from: i64 be 8b][timestamp: i64 be 8b][messageId: 36b][iv: 12b][ciphertext: Nb]
        const MIN_LEN = 1 + 8 + 8 + 36 + 12 + 1;
        if (data.length < MIN_LEN) return null;

        const view = new DataView(data.buffer, data.byteOffset);

        const fromHi = view.getUint32(1, false);
        const fromLo = view.getUint32(5, false);
        const from = fromHi * 0x1_0000_0000 + fromLo;

        const tsHi = view.getUint32(9, false);
        const tsLo = view.getUint32(13, false);
        const timestamp = tsHi * 0x1_0000_0000 + tsLo;

        const messageId = new TextDecoder().decode(data.slice(17, 53)); // UUID = 36 байт ASCII

        const iv = data.slice(53, 65);
        const ciphertext = data.slice(65);

        return { type: MSG_DATA, from, timestamp, messageId, iv, ciphertext };
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}
