import { useEffect, useRef, useState } from 'react';
import {
  decodeFromWebSocketPacket,
  encodeToWebSocketPacket,
  WebSocketMessageType,
} from '@/lib/WebsocketPayload';

interface WsMessage {
  text: string;
  fromMe: boolean;
  time: string;
}

export const useWebSocket = (token: string | null) => {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const isAuthed = useRef(false);
  const shouldReconnect = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

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

        if (message.type === WebSocketMessageType.Auth) {
          if (message.payload === 'ACK') {
            isAuthed.current = true;
            setConnected(true);
          } else {
            shouldReconnect.current = false; // не переподключаться если auth failed
            socket.close(4001, 'Auth failed');
          }
          return;
        }

        if (!isAuthed.current) return;

        if (message.type === WebSocketMessageType.Data) {
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
        }
      };
    };

    connect();

    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
      ws.current = null;
    };
  }, [token]);

  const send = (text: string) => {
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
