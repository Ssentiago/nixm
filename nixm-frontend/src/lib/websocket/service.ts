// lib/websocket/service.ts
import {
  encodePacket,
  decodePacket,
  IncomingMessage,
  OutgoingMessage,
} from './protocol';

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'authed';

export interface WebSocketServiceEvents {
  status: (status: WSStatus) => void;
  message: (msg: IncomingMessage) => void;
  error: (err: Event) => void;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private status: WSStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();

  // Подписчики на события
  private listeners: Partial<WebSocketServiceEvents> = {};

  constructor(
    private url: string,
    private config: {
      reconnectDelay?: number; // ms, базовая задержка
      maxReconnectDelay?: number; // ms, потолок
      keepaliveInterval?: number; // ms
      authTimeout?: number; // ms
    } = {},
  ) {}

  // Подписка на события
  on<K extends keyof WebSocketServiceEvents>(
    event: K,
    handler: WebSocketServiceEvents[K],
  ) {
    this.listeners[event] = handler;
    return () => {
      delete this.listeners[event];
    }; // отписка
  }

  // Публичные методы
  connect(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setStatus('connecting');
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => this.handleOpen(token);
    this.ws.onclose = e => this.handleClose(e);
    this.ws.onerror = e => this.handleError(e);
    this.ws.onmessage = e => this.handleMessage(e);
  }

  disconnect() {
    this.stopReconnect();
    this.stopKeepalive();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  send(msg: OutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const packet = encodePacket(msg);
    this.ws.send(packet);
  }

  // Внутренние обработчики
  private handleOpen(token: string) {
    this.send({ type: WSMsgType.Auth, payload: token });

    // Таймаут на авторизацию
    const authTimeout = setTimeout(() => {
      if (this.status !== 'authed') {
        this.ws?.close(4001, 'Auth timeout');
      }
    }, this.config.authTimeout || 5000);

    // Храним таймаут в замыкании или как поле, чтобы очистить при ACK
  }

  private handleMessage(event: MessageEvent) {
    const data =
      event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : new Uint8Array(await event.data.arrayBuffer());

    const msg = decodePacket(data);
    if (!msg) {
      console.warn('Invalid WS packet');
      return;
    }

    // Обработка служебных сообщений внутри сервиса
    if (msg.type === WSMsgType.Auth && msg.payload === 'ACK') {
      this.setStatus('authed');
      this.startKeepalive();
      // Очистить authTimeout здесь
    }

    if (msg.type === WSMsgType.Keepalive && msg.payload === 'PONG') {
      this.lastPong = Date.now();
    }

    // Пробрасываем все сообщения (включая служебные) наружу
    this.listeners.message?.(msg);
  }

  private handleClose(event: CloseEvent) {
    this.stopKeepalive();

    if (this.status === 'authed') {
      // Нормальное закрытие — не переподключаемся
      this.setStatus('disconnected');
    } else {
      // Ошибка при коннекте/авторизации — пробуем снова
      this.scheduleReconnect();
    }

    this.listeners.status?.(this.status);
  }

  private handleError(event: Event) {
    this.listeners.error?.(event);
  }

  private setStatus(newStatus: WSStatus) {
    this.status = newStatus;
    this.listeners.status?.(newStatus);
  }

  private startKeepalive() {
    this.stopKeepalive();
    const interval = this.config.keepaliveInterval || 30000;

    this.keepaliveTimer = setInterval(() => {
      // Проверка: если давно не было PONG — разрываем соединение
      if (Date.now() - this.lastPong > 90000) {
        this.ws?.close(4000, 'Keepalive timeout');
        return;
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: WSMsgType.Keepalive, payload: 'PING' });
      }
    }, interval);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private scheduleReconnect() {
    this.stopReconnect();

    const base = this.config.reconnectDelay || 1000;
    const max = this.config.maxReconnectDelay || 30000;
    const delay = Math.min(base * 2 ** this.reconnectAttempts, max);

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      // Токен нужно брать извне — передавать при вызове connect()
      this.connect('TOKEN_PLACEHOLDER');
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }
}
