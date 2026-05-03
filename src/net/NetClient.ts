import { EventEmitter } from '../core/EventEmitter.js';

import { Protocol, type AnyProtocol } from './protocol.js';

export interface NetClientOptions {
  /** Server URL, e.g. ws://localhost:3000 . */
  url: string;
  /** Custom protocol; defaults to control-only. */
  protocol?: AnyProtocol;
  /** Auto-reconnect on close. */
  reconnect?: boolean;
  /** Initial reconnect delay (ms); doubles each attempt up to `maxReconnectDelay`. */
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  /** Send a `ping` every Nms; default 25_000. Set 0 to disable. */
  heartbeatMs?: number;
}

export interface NetClientEventMap extends Record<string, unknown[]> {
  open: [];
  close: [code: number, reason: string];
  message: [message: unknown];
  error: [error: unknown];
  reconnecting: [attempt: number, delay: number];
}

/**
 * Tiny browser/Node WebSocket client with auto-reconnect, JSON framing via
 * {@link Protocol}, and a {@link EventEmitter} surface.
 */
export class NetClient {
  readonly events = new EventEmitter<NetClientEventMap>();

  private socket?: WebSocket;
  private readonly options: Required<Omit<NetClientOptions, 'protocol'>> & { protocol: AnyProtocol };
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private intentionalClose = false;
  private reconnectAttempt = 0;

  constructor(options: NetClientOptions) {
    this.options = {
      url: options.url,
      protocol: options.protocol ?? new Protocol(),
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1_000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      heartbeatMs: options.heartbeatMs ?? 25_000,
    };
  }

  connect(): void {
    this.intentionalClose = false;
    this.openSocket();
  }

  disconnect(code = 1000, reason = ''): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.socket?.close(code, reason);
    this.socket = undefined;
  }

  send(message: unknown): void {
    const sock = this.socket;
    if (!sock || sock.readyState !== sock.OPEN) return;
    const text = typeof message === 'string' ? message : this.options.protocol.encode(message);
    sock.send(text);
  }

  /** Convenience: join a room via the standard control message. */
  joinRoom(room: string, meta?: Record<string, unknown>): void {
    this.send({ type: 'join', room, ...(meta ? { meta } : {}) });
  }

  leaveRoom(room: string): void {
    this.send({ type: 'leave', room });
  }

  isOpen(): boolean {
    return this.socket?.readyState === this.socket?.OPEN;
  }

  private openSocket(): void {
    const sock = new WebSocket(this.options.url);
    this.socket = sock;
    sock.onopen = () => {
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.events.emit('open');
    };
    sock.onmessage = (event: MessageEvent<string>) => {
      const parsed = this.options.protocol.parse(event.data);
      if (!parsed.ok) {
        this.events.emit('error', new Error(`invalid message: ${parsed.error}`));
        return;
      }
      this.events.emit('message', parsed.data);
    };
    sock.onerror = (err) => this.events.emit('error', err);
    sock.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();
      this.events.emit('close', event.code, event.reason);
      this.socket = undefined;
      if (this.options.reconnect && !this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.options.maxReconnectDelay,
      this.options.reconnectDelay * 2 ** (this.reconnectAttempt - 1),
    );
    this.events.emit('reconnecting', this.reconnectAttempt, delay);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private startHeartbeat(): void {
    if (this.options.heartbeatMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', ts: Date.now() });
    }, this.options.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
}
