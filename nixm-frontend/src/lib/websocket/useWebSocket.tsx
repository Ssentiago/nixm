// lib/websocket/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketService, WSStatus } from './service';
import { IncomingMessage, OutgoingMessage } from './protocol';

interface UseWebSocketOptions {
  url: string;
  token: string | null;
  onMessage?: (msg: IncomingMessage) => void;
}

export function useWebSocket({ url, token, onMessage }: UseWebSocketOptions) {
  const serviceRef = useRef<WebSocketService | null>(null);
  const onMessageRef = useRef(onMessage);
  const tokenRef = useRef(token);
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastError, setLastError] = useState<Event | null>(null);

  // Держим актуальные колбэки без пересоздания эффектов
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Создаём сервис один раз на url
  useEffect(() => {
    const service = new WebSocketService(url, {
      reconnectDelay: 1_000,
      maxReconnectDelay: 30_000,
      keepaliveInterval: 30_000,
      keepaliveTimeout: 90_000,
      authTimeout: 5_000,
    });
    serviceRef.current = service;

    service.on('status', setStatus);
    service.on('error', e => {
      setLastError(e);
      console.error('WS error:', e);
    });
    service.on('message', msg => {
      onMessageRef.current?.(msg);
    });

    return () => {
      service.disconnect();
      serviceRef.current = null;
    };
  }, [url]); // url меняется — пересоздаём сервис

  // Коннект/дисконнект при смене токена
  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;

    if (token) {
      service.connect(() => tokenRef.current);
    } else {
      service.disconnect();
    }
  }, [token]);

  const send = useCallback((msg: OutgoingMessage) => {
    serviceRef.current?.send(msg);
  }, []);

  const disconnect = useCallback(() => {
    serviceRef.current?.disconnect();
  }, []);

  return {
    status,
    lastError,
    send,
    disconnect,
    isAuthed: status === 'authed',
  };
}
