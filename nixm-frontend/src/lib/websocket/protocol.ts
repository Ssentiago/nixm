// lib/websocket/protocol.ts
import { encode, decode } from '@msgpack/msgpack';

export const MSG_AUTH = 0;
export const MSG_DATA = 1;
export const MSG_KEEPALIVE = 2;

// Исходящие пакеты (клиент → сервер)
export type OutgoingMessage =
  | { type: typeof MSG_AUTH; payload: string }
  | { type: typeof MSG_KEEPALIVE; payload: 'PING' }
  | {
      type: typeof MSG_DATA;
      to: number;
      iv: Uint8Array;
      timestamp: number;
      ciphertext: Uint8Array;
    };

// Входящие пакеты (сервер → клиент)
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
      // [0x00][msgpack(token)]
      const tokenBytes = encode(msg.payload);
      const buf = new Uint8Array(1 + tokenBytes.length);
      buf[0] = MSG_AUTH;
      buf.set(tokenBytes, 1);
      return buf;
    }

    case MSG_KEEPALIVE: {
      // [0x02][msgpack("PING")]
      const pingBytes = encode('PING');
      const buf = new Uint8Array(1 + pingBytes.length);
      buf[0] = MSG_KEEPALIVE;
      buf.set(pingBytes, 1);
      return buf;
    }

    case MSG_DATA: {
      // [0x01][to: i64 big-endian 8 bytes][iv: 12 bytes][ciphertext: N bytes]
      // iv у AES-GCM всегда 12 байт — длину не пишем
      const buf = new Uint8Array(1 + 8 + 12 + msg.ciphertext.length);
      const view = new DataView(buf.buffer);

      buf[0] = MSG_DATA;

      // i64 big-endian: JS не умеет в 64-bit int нативно, пишем двумя u32
      const hi = Math.floor(msg.to / 0x1_0000_0000);
      const lo = msg.to >>> 0;
      view.setUint32(1, hi, false);
      view.setUint32(5, lo, false);

      buf.set(msg.iv, 9);
      buf.set(msg.ciphertext, 21);

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
        // [0x00][msgpack("ACK")] или [0x00][0x45 'E']
        if (data[1] === 0x45 /* 'E' */) {
          return { type: MSG_AUTH, payload: 'ERR' };
        }
        const payload = decode(data.subarray(1));
        if (payload === 'ACK') return { type: MSG_AUTH, payload: 'ACK' };
        return null;
      }

      case MSG_KEEPALIVE: {
        // [0x02][msgpack("PONG")]
        const payload = decode(data.subarray(1));
        if (payload === 'PONG') return { type: MSG_KEEPALIVE, payload: 'PONG' };
        return null;
      }

      case MSG_DATA: {
        // [0x01][from: i64 be 8 bytes][iv: 12 bytes][ciphertext: N bytes]
        if (data.length < 1 + 8 + 12 + 1) return null;

        const view = new DataView(data.buffer, data.byteOffset);
        const hi = view.getUint32(1, false);
        const lo = view.getUint32(5, false);
        const from = hi * 0x1_0000_0000 + lo;

        const iv = data.slice(9, 21);
        const ciphertext = data.slice(21);

        return { type: MSG_DATA, from, iv, ciphertext };
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}
