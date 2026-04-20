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
import { logger } from '@/lib/logger';

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
    logger.info('WebSocketService initialized', {
      url: this.url,
      config: this.config,
    });
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
    ) {
      logger.debug('Connect called, but socket is already busy', {
        state: this.socket?.readyState,
      });
      return;
    }

    logger.info('Attempting to connect to WebSocket', { url: this.url });
    this.setStatus('connecting');

    try {
      this.socket = new WebSocket(this.url);
      this.socket.binaryType = 'arraybuffer';
      this.socket.onopen = () => this.handleOpen();
      this.socket.onclose = e => this.handleClose(e);
      this.socket.onerror = e => this.handleError(e);
      this.socket.onmessage = e => this.handleMessage(e);
    } catch (e) {
      logger.error('Failed to create WebSocket instance', { error: String(e) });
      this.setStatus('disconnected');
    }
  }

  disconnect(): void {
    logger.info('Manual disconnect requested');
    this.getToken = () => null;
    this.reconnectAttempts = 0;
    this.stopReconnect();
    this.stopKeepalive();
    this.clearAuthTimer();

    if (this.socket) {
      logger.debug('Closing active socket');
      this.socket.close(1000, 'Normal closure');
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  send(msg: OutgoingMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      logger.error('Attempted to send message on closed socket', {
        type: msg.type,
      });
      throw new Error('WebSocket not open');
    }

    logger.debug('Sending outgoing packet', { type: msg.type });
    this.socket.send(encodePacket(msg));
  }

  getStatus(): WSStatus {
    return this.status;
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private handleOpen(): void {
    logger.info('Socket connection established (TCP/HTTP Upgrade)');
    const token = this.getToken();
    if (!token) {
      logger.warn('Auth failed: no token available after open');
      this.socket?.close(4002, 'No token');
      return;
    }

    const deviceId = this.getMyDeviceId();
    if (!deviceId) {
      logger.warn('Auth failed: no deviceId available after open');
      this.socket?.close(4002, 'No device id');
      return;
    }

    this.setStatus('connected');
    logger.info('Sending MSG_AUTH packet', { deviceId });
    this.send({ type: MSG_AUTH, payload: token, deviceId });

    this.authTimer = setTimeout(() => {
      logger.error('Auth timeout: server did not ACK in time');
      this.socket?.close(4001, 'Auth timeout');
    }, this.config.authTimeout ?? 5_000);
  }

  private handleMessage(event: MessageEvent): void {
    const raw =
      event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;

    if (!raw) {
      logger.warn('Received non-binary/unknown message format');
      return;
    }

    const msg = decodePacket(raw);
    if (!msg) {
      logger.warn('Packet drop: failed to decode');
      return;
    }

    switch (msg.type) {
      case MSG_AUTH:
        return this.handleAuth(msg);
      case MSG_KEEPALIVE:
        return this.handlePong();
      default:
        logger.debug('Passing packet to router', { type: msg.type });
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
    logger.info('Auth response received', { payload: msg.payload });

    if (msg.payload === 'ACK') {
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      this.setStatus('authed');
      logger.info('Handshake complete, status: AUTHED');
      this.startKeepalive();
    } else {
      logger.error('Authentication rejected by server');
      this.socket?.close(4002, 'Auth rejected');
    }
  }

  private handlePong(): void {
    logger.debug('Keepalive: received PONG');
    this.lastPong = Date.now();
  }

  private handleClose(event: CloseEvent): void {
    logger.warn('WebSocket connection closed', {
      code: event.code,
      reason: event.reason,
      clean: event.wasClean,
    });

    this.stopKeepalive();
    this.clearAuthTimer();
    this.socket = null;
    this.setStatus('disconnected');

    if (event.code === 4002 || !this.getToken()) {
      logger.info('Reconnect skipped: permanent error or logged out');
      return;
    }
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    logger.error('WebSocket internal error occurred', { event });
    this.emit('error', event);
  }

  // ─── Keepalive ────────────────────────────────────────────────────────────

  private startKeepalive(): void {
    this.stopKeepalive();
    const interval = this.config.keepaliveInterval ?? 30_000;
    const timeout = this.config.keepaliveTimeout ?? 90_000;

    logger.debug('Starting keepalive loop', { interval, timeout });
    this.keepaliveTimer = setInterval(() => {
      const timeSinceLastPong = Date.now() - this.lastPong;

      if (timeSinceLastPong > timeout) {
        logger.error('Keepalive timeout: no pong for too long', {
          timeSinceLastPong,
        });
        this.socket?.close(4000, 'Keepalive timeout');
        return;
      }

      if (this.socket?.readyState === WebSocket.OPEN) {
        logger.debug('Sending PING');
        this.send({ type: MSG_KEEPALIVE, payload: 'PING' });
      }
    }, interval);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      logger.debug('Stopping keepalive loop');
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ─── Reconnect ────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.stopReconnect();
    const base = this.config.reconnectDelay ?? 1_000;
    const max = this.config.maxReconnectDelay ?? 30_000;
    const delay = Math.min(base * 2 ** this.reconnectAttempts, max);
    this.reconnectAttempts++;

    logger.info('Scheduling reconnect', {
      delay,
      attempt: this.reconnectAttempts,
    });
    this.reconnectTimer = setTimeout(() => {
      if (!this.getToken()) {
        logger.debug('Reconnect canceled: no token');
        return;
      }
      this.connect(this.getToken, this.getMyDeviceId);
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      logger.debug('Canceling scheduled reconnect');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Misc ─────────────────────────────────────────────────────────────────

  private clearAuthTimer(): void {
    if (this.authTimer !== null) {
      logger.debug('Clearing auth timeout timer');
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  private setStatus(status: WSStatus): void {
    logger.info(`WS status change: ${this.status} -> ${status}`);
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
