// lib/websocket/service.ts

import { encodePacket, decodePacket } from './protocol';
import { EventEmitter } from './emitter';
import { wsRouter } from './router';
import {
  IncomingMessage,
  MSG_AUTH,
  MSG_KEEPALIVE,
  OutgoingMessage,
} from '@/lib/websocket/typing/definitions';

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'authed';

type WSEventMap = {
  status: WSStatus;
  error: Event;
};

interface WSConfig {
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  keepaliveInterval?: number;
  keepaliveTimeout?: number;
  authTimeout?: number;
}

class WebSocketService extends EventEmitter<WSEventMap> {
  private socket: WebSocket | null = null;
  private status: WSStatus = 'disconnected';
  private getToken: () => string | null = () => null;
  private getMyDeviceId: () => string | null = () => null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPong = 0;

  constructor(
    private url: string,
    private config: WSConfig = {},
  ) {
    super();
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  connect(
    getToken: () => string | null,
    getMyDeviceId: () => string | null,
  ): void {
    this.getToken = getToken;
    this.getMyDeviceId = getMyDeviceId;

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;

    this.setStatus('connecting');
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => this.handleOpen();
    this.socket.onclose = e => this.handleClose(e);
    this.socket.onerror = e => this.handleError(e);
    this.socket.onmessage = e => this.handleMessage(e);
  }

  disconnect(): void {
    this.getToken = () => null;
    this.reconnectAttempts = 0;
    this.stopReconnect();
    this.stopKeepalive();
    this.clearAuthTimer();
    this.socket?.close(1000, 'Normal closure');
    this.socket = null;
    this.setStatus('disconnected');
  }

  send(msg: OutgoingMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.socket.send(encodePacket(msg));
  }

  getStatus(): WSStatus {
    return this.status;
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private handleOpen(): void {
    const token = this.getToken();
    if (!token) {
      this.socket?.close(4002, 'No token');
      return;
    }

    const deviceId = this.getMyDeviceId();
    if (!deviceId) {
      this.socket?.close(4002, 'No device id');
      return;
    }

    this.setStatus('connected');
    this.send({ type: MSG_AUTH, payload: token, deviceId });

    this.authTimer = setTimeout(() => {
      console.warn('[WS] Auth timeout');
      this.socket?.close(4001, 'Auth timeout');
    }, this.config.authTimeout ?? 5_000);
  }

  private handleMessage(event: MessageEvent): void {
    const raw =
      event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;

    if (!raw) {
      console.warn('[WS] Non-binary message received');
      return;
    }

    const msg = decodePacket(raw);
    if (!msg) {
      console.warn('[WS] Failed to decode packet');
      return;
    }

    switch (msg.type) {
      case MSG_AUTH:
        return this.handleAuth(msg);
      case MSG_KEEPALIVE:
        return this.handlePong();
      default:
        wsRouter.dispatch(
          msg as Exclude<
            IncomingMessage,
            { type: typeof MSG_AUTH | typeof MSG_KEEPALIVE }
          >,
        );
    }
  }

  private handleAuth(
    msg: Extract<IncomingMessage, { type: typeof MSG_AUTH }>,
  ): void {
    this.clearAuthTimer();

    if (msg.payload === 'ACK') {
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      this.setStatus('authed');
      this.startKeepalive();
    } else {
      console.error('[WS] Auth rejected by server');
      this.getToken = () => null;
      this.socket?.close(4002, 'Auth rejected');
    }
  }

  private handlePong(): void {
    this.lastPong = Date.now();
  }

  private handleClose(event: CloseEvent): void {
    this.stopKeepalive();
    this.clearAuthTimer();
    this.socket = null;
    this.setStatus('disconnected');

    if (event.code === 4002 || !this.getToken()) return;
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    this.emit('error', event);
  }

  // ─── Keepalive ────────────────────────────────────────────────────────────

  private startKeepalive(): void {
    this.stopKeepalive();
    const interval = this.config.keepaliveInterval ?? 30_000;
    const timeout = this.config.keepaliveTimeout ?? 90_000;

    this.keepaliveTimer = setInterval(() => {
      if (Date.now() - this.lastPong > timeout) {
        console.warn('[WS] Keepalive timeout');
        this.socket?.close(4000, 'Keepalive timeout');
        return;
      }
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send({ type: MSG_KEEPALIVE, payload: 'PING' });
      }
    }, interval);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer === null) return;
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  // ─── Reconnect ────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.stopReconnect();
    const base = this.config.reconnectDelay ?? 1_000;
    const max = this.config.maxReconnectDelay ?? 30_000;
    const delay = Math.min(base * 2 ** this.reconnectAttempts, max);
    this.reconnectAttempts++;

    console.log(
      `[WS] Reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => {
      if (!this.getToken()) return;
      this.connect(this.getToken, this.getMyDeviceId);
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer === null) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // ─── Misc ─────────────────────────────────────────────────────────────────

  private clearAuthTimer(): void {
    if (this.authTimer === null) return;
    clearTimeout(this.authTimer);
    this.authTimer = null;
  }

  private setStatus(status: WSStatus): void {
    this.status = status;
    this.emit('status', status);
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
