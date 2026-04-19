// lib/websocket/service.ts
import {
  MSG_AUTH,
  MSG_DATA,
  MSG_KEEPALIVE,
  IncomingMessage,
  OutgoingMessage,
  encodePacket,
  decodePacket,
} from './protocol';

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'authed';

export interface WebSocketServiceEvents {
  status: (status: WSStatus) => void;
  message: (msg: IncomingMessage) => void;
  error: (err: Event) => void;
}

interface WSConfig {
  reconnectDelay?: number; // базовая задержка реконнекта, ms
  maxReconnectDelay?: number; // потолок, ms
  keepaliveInterval?: number; // интервал PING, ms
  keepaliveTimeout?: number; // сколько ждём PONG до разрыва, ms
  authTimeout?: number; // сколько ждём ACK после отправки токена, ms
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private status: WSStatus = 'disconnected';
  private getToken: () => string | null = () => null;
  private getMyDeviceId: () => string | null = () => null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPong: number = 0;
  private listeners: Partial<WebSocketServiceEvents> = {};

  constructor(
    private url: string,
    private config: WSConfig = {},
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  on<K extends keyof WebSocketServiceEvents>(
    event: K,
    handler: WebSocketServiceEvents[K],
  ) {
    this.listeners[event] = handler;
    return () => {
      delete this.listeners[event];
    };
  }

  connect(getToken: () => string | null, getMyDeviceId: () => string | null) {
    this.getToken = getToken;
    this.getMyDeviceId = getMyDeviceId;
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    )
      return;

    this.setStatus('connecting');

    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.handleOpen();
    this.ws.onclose = e => this.handleClose(e);
    this.ws.onerror = e => this.handleError(e);
    this.ws.onmessage = e => this.handleMessage(e);
  }

  disconnect() {
    this.getToken = () => null;
    this.reconnectAttempts = 0;
    this.stopReconnect();
    this.stopKeepalive();
    this.clearAuthTimer();
    this.ws?.close(1000, 'Normal closure');
    this.ws = null;
    this.setStatus('disconnected');
  }

  send(msg: OutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.ws.send(encodePacket(msg));
  }

  getStatus() {
    return this.status;
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
  private handleOpen() {
    const token = this.getToken();
    if (!token) {
      this.ws?.close(4002, 'No token');
      return;
    }
    const deviceId = this.getMyDeviceId();
    if (!deviceId) {
      this.ws?.close(4002, 'No device id');
      return;
    }

    this.setStatus('connected');
    this.send({
      type: MSG_AUTH,
      payload: token,
      deviceId: deviceId,
    });

    // Таймаут на ACK
    this.authTimer = setTimeout(() => {
      console.warn('WS auth timeout');
      this.ws?.close(4001, 'Auth timeout');
    }, this.config.authTimeout ?? 5000);
  }

  private handleMessage(event: MessageEvent) {
    const raw =
      event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;

    if (!raw) {
      console.warn('WS: non-binary message received');
      return;
    }

    const msg = decodePacket(raw);
    if (!msg) {
      console.warn('WS: failed to decode packet');
      return;
    }

    // Служебные пакеты — обрабатываем внутри
    if (msg.type === MSG_AUTH) {
      this.clearAuthTimer();
      if (msg.payload === 'ACK') {
        this.reconnectAttempts = 0;
        this.lastPong = Date.now();
        this.setStatus('authed');
        this.startKeepalive();
      } else {
        // ERR — токен невалиден, нет смысла реконнектиться
        console.error('WS auth rejected by server');
        this.getToken = () => null;
        this.ws?.close(4002, 'Auth rejected');
      }
      return; // Auth пакеты наружу не пробрасываем
    }

    if (msg.type === MSG_KEEPALIVE) {
      this.lastPong = Date.now();
      return; // PONG наружу не нужен
    }

    // Data — пробрасываем
    this.listeners.message?.(msg);
  }

  private handleClose(event: CloseEvent) {
    this.stopKeepalive();
    this.clearAuthTimer();
    this.ws = null;

    // 4002 = сервер отверг токен, реконнект бессмысленен
    if (event.code === 4002 || !this.getToken()) {
      this.setStatus('disconnected');
      return;
    }

    // Любое другое закрытие — пробуем реконнект
    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  private handleError(event: Event) {
    this.listeners.error?.(event);
  }

  // ─── Keepalive ───────────────────────────────────────────────────────────

  private startKeepalive() {
    this.stopKeepalive();
    const interval = this.config.keepaliveInterval ?? 30_000;
    const timeout = this.config.keepaliveTimeout ?? 90_000;

    this.keepaliveTimer = setInterval(() => {
      if (Date.now() - this.lastPong > timeout) {
        console.warn('WS keepalive timeout');
        this.ws?.close(4000, 'Keepalive timeout');
        return;
      }
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: MSG_KEEPALIVE, payload: 'PING' });
      }
    }, interval);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ─── Reconnect ───────────────────────────────────────────────────────────

  private scheduleReconnect() {
    this.stopReconnect();
    const base = this.config.reconnectDelay ?? 1_000;
    const max = this.config.maxReconnectDelay ?? 30_000;
    const delay = Math.min(base * 2 ** this.reconnectAttempts, max);
    this.reconnectAttempts++;

    console.log(
      `WS reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      const token = this.getToken();
      if (!token) return; // токен протух и не обновился — не реконнектимся
      this.connect(this.getToken, this.getMyDeviceId);
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Misc ────────────────────────────────────────────────────────────────

  private clearAuthTimer() {
    if (this.authTimer !== null) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  private setStatus(s: WSStatus) {
    this.status = s;
    this.listeners.status?.(s);
  }
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://localhost:5900/ws`;

export const ws = new WebSocketService(WS_URL, {
  reconnectDelay: 1_000,
  maxReconnectDelay: 30_000,
  keepaliveInterval: 30_000,
  keepaliveTimeout: 90_000,
  authTimeout: 5_000,
});
