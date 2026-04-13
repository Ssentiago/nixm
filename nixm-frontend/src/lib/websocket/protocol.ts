// lib/websocket/protocol.ts
import { encode, decode } from '@msgpack/msgpack';

export enum WSMsgType {
  Auth = 0,
  Data = 1,
  Keepalive = 2,
}

// Типы для отправки
export type OutgoingMessage =
  | { type: WSMsgType.Auth; payload: string }
  | { type: WSMsgType.Keepalive; payload: 'PING' }
  | {
      type: WSMsgType.Data;
      to: number;
      iv: Uint8Array;
      ciphertext: Uint8Array;
    };

// Типы для приёма (после декодирования, до расшифровки)
export type IncomingMessage =
  | { type: WSMsgType.Auth; payload: string }
  | { type: WSMsgType.Keepalive; payload: 'PONG' }
  | {
      type: WSMsgType.Data;
      from: number;
      iv: Uint8Array;
      ciphertext: Uint8Array;
    };

// Кодирование: сообщение → бинарный пакет (Uint8Array)
export function encodePacket(msg: OutgoingMessage): Uint8Array {
  switch (msg.type) {
    case WSMsgType.Auth:
    case WSMsgType.Keepalive: {
      const payloadBytes = encode(msg.payload);
      const buffer = new Uint8Array(1 + payloadBytes.length);
      buffer[0] = msg.type;
      buffer.set(payloadBytes, 1);
      return buffer;
    }
    case WSMsgType.Data: {
      // Envelope: { to }
      const envelope = encode({ to: msg.to });
      // Payload: { iv, ciphertext }
      const payload = encode({ iv: msg.iv, ciphertext: msg.ciphertext });

      // Фрейм: [1 byte type][envelope_len:u32][envelope][payload]
      const totalLen = 1 + 4 + envelope.length + payload.length;
      const buffer = new Uint8Array(totalLen);

      buffer[0] = msg.type;
      new DataView(buffer.buffer).setUint32(1, envelope.length, false); // big-endian
      buffer.set(envelope, 5);
      buffer.set(payload, 5 + envelope.length);

      return buffer;
    }
  }
}

// Декодирование: бинарный пакет → сообщение
export function decodePacket(data: Uint8Array): IncomingMessage | null {
  if (data.length < 1) return null;

  const type = data[0];
  if (!Object.values(WSMsgType).includes(type as WSMsgType)) return null;

  try {
    switch (type) {
      case WSMsgType.Auth:
      case WSMsgType.Keepalive: {
        const payload = decode(data.subarray(1)) as string;
        return { type, payload: payload as any };
      }
      case WSMsgType.Data: {
        if (data.length < 5) return null;
        const envelopeLen = new DataView(
          data.buffer,
          data.byteOffset,
        ).getUint32(1, false);
        if (data.length < 5 + envelopeLen) return null;

        const envelope = decode(data.subarray(5, 5 + envelopeLen)) as {
          to: number;
        };
        const payload = decode(data.subarray(5 + envelopeLen)) as {
          iv: Uint8Array;
          ciphertext: Uint8Array;
        };

        return {
          type: WSMsgType.Data,
          from: envelope.to, // сервер пересылает, поэтому "to" отправителя = "from" получателя
          iv: new Uint8Array(payload.iv),
          ciphertext: new Uint8Array(payload.ciphertext),
        };
      }
    }
  } catch {
    return null;
  }
}
