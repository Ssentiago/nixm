// lib/websocket/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { WebSocketService, WSStatus, IncomingMessage } from './service';
import { WSMsgType } from './protocol';

interface UseWebSocketOptions {
  url: string;
  token: string | null;
  onMessage?: (msg: IncomingMessage) => void;
}

export function useWebSocket({ url, token, onMessage }: UseWebSocketOptions) {
  const serviceRef = useRef<WebSocketService | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastError, setLastError] = useState<Event | null>(null);

  useEffect(() => {
    if (!token) return;

    // Создаём сервис один раз
    if (!serviceRef.current) {
      serviceRef.current = new WebSocketService(url, {
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        keepaliveInterval: 30000,
        authTimeout: 5000,
      });
    }

    const service = serviceRef.current;

    // Подписываемся на события
    const unsubStatus = service.on('status', setStatus);
    const unsubError = service.on('error', e => {
      setLastError(e);
      console.error('WS error:', e);
    });
    const unsubMessage = service.on('message', msg => {
      // Крипто-расшифровка должна быть ВЫШЕ этого хука (в CryptoContext)
      // Здесь только пробрасываем сырое сообщение
      onMessage?.(msg);
    });

    // Коннектимся
    service.connect(token);

    // Cleanup
    return () => {
      unsubStatus();
      unsubError();
      unsubMessage();
      // Не делаем service.disconnect() здесь — пусть живёт при размонтировании компонента
      // Если нужно — вызывай явно из AuthContext.logout()
    };
  }, [token, url]);

  // Публичные методы хука
  const send = (msg: Parameters<WebSocketService['send']>[0]) => {
    serviceRef.current?.send(msg);
  };

  const disconnect = () => {
    serviceRef.current?.disconnect();
  };

  return {
    status,
    lastError,
    send,
    disconnect,
    // Можно добавить: isConnected = status === 'authed'
  };
}
