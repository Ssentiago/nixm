import { encode, decode } from '@msgpack/msgpack';

export enum WebSocketMessageType {
  Auth = 0,
  Data = 1,
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: string;
}

export const buildWebSocketPacket = (
  type: WebSocketMessageType,
  payload: Uint8Array,
) => {
  const buffer = new Uint8Array(1 + payload.length);

  buffer[0] = type;
  buffer.set(payload, 1);

  return buffer;
};

export function encodeToWebSocketPacket(message: WebSocketMessage) {
  const encoded = encode(message.payload);

  const wsPacket = buildWebSocketPacket(message.type, encoded);

  return wsPacket;
}

export function decodeFromWebSocketPacket(packet: Uint8Array) {
  const type = packet[0];

  if (!(type in WebSocketMessageType)) {
    return null;
  }
  const payload = packet.subarray(1);

  try {
    const decoded = decode(payload) as string;
    const message: WebSocketMessage = {
      type: type,
      payload: decoded,
    };
    return message;
  } catch (err) {
    return null;
  }
}
