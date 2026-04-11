import { useEffect, useRef, useState } from 'react';
import { decode, encode } from '@msgpack/msgpack';

interface WsMessage {
  text: string;
  fromMe: boolean;
  time: string;
}

export enum WebSocketMessageType {
  Auth = 0,
  Data = 1,
  Keepalive = 2,
}

export type WebSocketMessage =
  | { type: WebSocketMessageType.Auth; payload: string }
  | { type: WebSocketMessageType.Keepalive; payload: 'PING' | 'PONG' }
  | { type: WebSocketMessageType.Data; to: number; payload: string };
// | { type: WebSocketMessageType.Typing; to: number; state: 'start' | 'stop' };

export const buildWebSocketServicePacket = (
  type: WebSocketMessageType.Auth | WebSocketMessageType.Keepalive,
  payload: Uint8Array,
) => {
  const buffer = new Uint8Array(1 + payload.length);

  buffer[0] = type;
  buffer.set(payload, 1);

  return buffer;
};

export function encodeToWebSocketPacket(message: WebSocketMessage): Uint8Array {
  switch (message.type) {
    case WebSocketMessageType.Auth:
    case WebSocketMessageType.Keepalive: {
      const encoded = encode(message.payload);
      return buildWebSocketServicePacket(message.type, encoded);
    }

    case WebSocketMessageType.Data: {
      const encoded = encode(message.payload);
      // 4 байта для to + encoded payload
      const buffer = new Uint8Array(1 + 8 + encoded.length);
      buffer[0] = message.type;
      // записываем to как big-endian i32
      const view = new DataView(buffer.buffer);
      view.setBigInt64(1, BigInt(message.to), false);
      buffer.set(encoded, 9);
      return buffer;
    }
  }
}
export function decodeFromWebSocketPacket(packet: Uint8Array) {
  const type = packet[0];

  if (!(type in WebSocketMessageType)) {
    return null;
  }

  try {
    switch (type) {
      case WebSocketMessageType.Auth: {
        const payload = packet.subarray(1);
        const decoded = decode(payload) as string;
        return { type: WebSocketMessageType.Auth, payload: decoded };
      }

      case WebSocketMessageType.Data: {
        const view = new DataView(packet.buffer, packet.byteOffset);
        const to = Number(view.getBigInt64(1, false));
        const payload = packet.subarray(9);
        const decoded = decode(payload) as string;
        return { type: WebSocketMessageType.Data, to, payload: decoded };
      }

      case WebSocketMessageType.Keepalive: {
        const payload = packet.subarray(1);
        const decoded = decode(payload) as string;
        return { type: WebSocketMessageType.Keepalive, payload: decoded };
      }
    }
  } catch (err) {
    return null;
  }
}

export const useWebSocket = (token: string | null) => {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const isAuthed = useRef(false);
  const shouldReconnect = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const keepaliveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!token) return;
    shouldReconnect.current = true;

    const connect = () => {
      const socket = new WebSocket(`ws://localhost:5900/ws`);
      socket.binaryType = 'arraybuffer';
      ws.current = socket;

      socket.onopen = () => {
        retryCount.current = 0;
        const packet = encodeToWebSocketPacket({
          type: WebSocketMessageType.Auth,
          payload: token,
        });
        socket.send(packet);

        keepaliveInterval.current = setInterval(() => {
          if (Date.now() - lastPongTime.current > 90000) {
            socket.close(); // сработает onclose → переподключение
            return;
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              encodeToWebSocketPacket({
                type: WebSocketMessageType.Keepalive,
                payload: 'PING',
              }),
            );
          }
        }, 30000);
      };

      socket.onclose = event => {
        setConnected(false);
        isAuthed.current = false;
        console.log('WS closed:', event.code, event.reason);

        if (shouldReconnect.current) {
          const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
          retryCount.current += 1;
          console.log(
            `Reconnecting in ${delay}ms (attempt ${retryCount.current})`,
          );
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };

      socket.onmessage = e => {
        const packet = new Uint8Array(e.data as ArrayBuffer);
        const message = decodeFromWebSocketPacket(packet);

        if (!message) {
          console.warn('Invalid WS packet');
          return;
        }

        switch (message.type) {
          case WebSocketMessageType.Auth: {
            if (message.payload === 'ACK') {
              isAuthed.current = true;
              setConnected(true);
            } else {
              shouldReconnect.current = false; // не переподключаться если auth failed
              socket.close(4001, 'Auth failed');
            }
            break;
          }

          case WebSocketMessageType.Data: {
            if (!isAuthed.current) return;
            // TODO decode

            setMessages(prev => [
              ...prev,
              {
                text: message.payload,
                fromMe: false,
                time: new Date().toLocaleTimeString('ru', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ]);
            break;
          }

          case WebSocketMessageType.Keepalive:
            if (message.payload === 'PONG') {
              lastPongTime.current = Date.now();
            }
            break;
        }
      };
    };

    connect();

    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (keepaliveInterval.current) clearInterval(keepaliveInterval.current);
      ws.current?.close();
      ws.current = null;
    };
  }, [token]);

  const send = (text: string, to: number) => {
    if (
      !ws.current ||
      ws.current.readyState !== WebSocket.OPEN ||
      !isAuthed.current
    ) {
      console.warn('WS not ready or not authed');
      return;
    }

    const packet = encodeToWebSocketPacket({
      type: WebSocketMessageType.Data,
      payload: text,
      to,
    });

    ws.current.send(packet);

    setMessages(prev => [
      ...prev,
      {
        text,
        fromMe: true,
        time: new Date().toLocaleTimeString('ru', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
  };

  return { messages, send, connected };
};
