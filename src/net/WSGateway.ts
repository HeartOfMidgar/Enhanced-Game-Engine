import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server as HttpServer } from 'node:http';

import { WebSocketServer, type WebSocket as WSConnection, type ServerOptions } from 'ws';

import { EventEmitter } from '../core/EventEmitter.js';

import {
  Protocol,
  type ParseResult,
  type ControlMessage,
  type AnyProtocol,
} from './protocol.js';
import { RateLimiter, getClientIP, type RateLimitConfig } from './rateLimit.js';
import { Room } from './Room.js';

export interface Connection {
  readonly id: string;
  readonly ip: string;
  /** Application-defined metadata (auth state, wallet, etc.). */
  readonly meta: Record<string, unknown>;
  send(message: unknown): void;
  close(code?: number, reason?: string): void;
}

export interface WSGatewayOptions {
  /** Either bind to an http(s).Server or open a fresh server on a port. */
  server?: HttpServer;
  port?: number;
  host?: string;
  /** zod-validated message protocol. Defaults to control-only. */
  protocol?: AnyProtocol;
  /** Rate-limit config applied per-connection key (IP by default). */
  rateLimit?: Partial<RateLimitConfig>;
  /** Override the rate-limit key. Default: client IP. */
  rateLimitKey?: (req: IncomingMessage) => string;
  /** Extra ws ServerOptions. */
  ws?: Partial<ServerOptions>;
  /** Heartbeat interval in ms (server pings clients to detect dead sockets). */
  heartbeatMs?: number;
}

export interface GatewayEventMap extends Record<string, unknown[]> {
  connection: [connection: Connection];
  disconnect: [connection: Connection, code: number, reason: string];
  message: [connection: Connection, message: unknown];
  invalid: [connection: Connection, raw: unknown, error: string];
  error: [connection: Connection, error: unknown];
}

/**
 * ws-based WebSocket gateway. Owns connections, rooms, and the protocol.
 *
 * Connections automatically participate in protocol parsing, rate limiting,
 * heartbeats, and room membership ('join' / 'leave' control messages). Game
 * code subscribes to `gateway.events` for application-level messages.
 */
export class WSGateway {
  readonly events = new EventEmitter<GatewayEventMap>();
  readonly rooms = new Map<string, Room>();

  private readonly wss: WebSocketServer;
  private readonly protocol: AnyProtocol;
  private readonly limiter: RateLimiter;
  private readonly rateLimitKeyFn: (req: IncomingMessage) => string;
  private readonly heartbeatMs: number;
  private readonly connections = new Map<WSConnection, ConnectionImpl>();
  private heartbeatHandle?: ReturnType<typeof setInterval>;

  constructor(options: WSGatewayOptions = {}) {
    const wsOptions: ServerOptions = {
      ...(options.server ? { server: options.server } : {}),
      ...(options.server ? {} : { port: options.port ?? 3000 }),
      ...(options.host ? { host: options.host } : {}),
      ...options.ws,
    };
    this.wss = new WebSocketServer(wsOptions);
    this.protocol = options.protocol ?? new Protocol();
    this.limiter = new RateLimiter(options.rateLimit);
    this.rateLimitKeyFn =
      options.rateLimitKey ?? ((req) => getClientIP(req.headers, req.socket));
    this.heartbeatMs = options.heartbeatMs ?? 30_000;

    this.wss.on('connection', (socket, req) => this.onConnection(socket, req));
    this.startHeartbeat();
  }

  room(id: string): Room {
    let room = this.rooms.get(id);
    if (!room) {
      room = new Room(id);
      this.rooms.set(id, room);
      room.events.on('empty', () => this.rooms.delete(id));
    }
    return room;
  }

  broadcast(message: unknown): void {
    for (const conn of this.connections.values()) {
      conn.send(message);
    }
  }

  close(): void {
    if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
    this.heartbeatHandle = undefined;
    for (const conn of this.connections.values()) {
      conn.close(1001, 'gateway shutdown');
    }
    this.connections.clear();
    this.rooms.clear();
    this.limiter.destroy();
    this.wss.close();
  }

  private onConnection(socket: WSConnection, req: IncomingMessage): void {
    const ip = getClientIP(req.headers, req.socket);
    const id = randomUUID();
    const conn: ConnectionImpl = {
      id,
      ip,
      meta: {},
      socket,
      isAlive: true,
      rooms: new Set(),
      send: (message) => {
        if (socket.readyState !== socket.OPEN) return;
        const text = typeof message === 'string' ? message : this.protocol.encode(message);
        socket.send(text);
      },
      close: (code, reason) => socket.close(code, reason),
    };
    this.connections.set(socket, conn);

    socket.on('message', (raw) => {
      const key = this.rateLimitKeyFn(req);
      const rl = this.limiter.check(key);
      if (!rl.allowed) {
        conn.send({ type: 'error', code: 'rate_limited', message: rl.error ?? 'rate limited' });
        return;
      }
      const text = raw.toString();
      const parsed: ParseResult<unknown> = this.protocol.parse(text);
      if (!parsed.ok) {
        this.events.emit('invalid', conn, text, parsed.error);
        conn.send({ type: 'error', code: 'invalid_message', message: parsed.error });
        return;
      }

      // Handle control messages locally, otherwise propagate to the app.
      if (isControlMessage(parsed.data)) {
        this.handleControl(conn, parsed.data);
        return;
      }
      this.events.emit('message', conn, parsed.data);
    });

    socket.on('pong', () => {
      conn.isAlive = true;
    });

    socket.on('close', (code, reasonBuffer) => {
      const reason = reasonBuffer?.toString() ?? '';
      for (const roomId of conn.rooms) {
        this.rooms.get(roomId)?.remove(conn);
      }
      this.connections.delete(socket);
      this.events.emit('disconnect', conn, code, reason);
    });

    socket.on('error', (err) => this.events.emit('error', conn, err));

    this.events.emit('connection', conn);
  }

  private handleControl(conn: ConnectionImpl, msg: ControlMessage): void {
    switch (msg.type) {
      case 'ping':
        conn.send({ type: 'pong', id: msg.id, ts: msg.ts });
        return;
      case 'join': {
        const room = this.room(msg.room);
        room.add(conn);
        conn.rooms.add(msg.room);
        return;
      }
      case 'leave': {
        const room = this.rooms.get(msg.room);
        if (room) room.remove(conn);
        conn.rooms.delete(msg.room);
        return;
      }
      default:
        // hello, pong, error — no server-side handling.
        this.events.emit('message', conn, msg);
    }
  }

  private startHeartbeat(): void {
    if (typeof setInterval === 'undefined' || this.heartbeatMs <= 0) return;
    this.heartbeatHandle = setInterval(() => {
      for (const [socket, conn] of this.connections) {
        if (!conn.isAlive) {
          socket.terminate();
          this.connections.delete(socket);
          continue;
        }
        conn.isAlive = false;
        try {
          socket.ping();
        } catch {
          // socket may already be closed
        }
      }
    }, this.heartbeatMs);
  }
}

interface ConnectionImpl extends Connection {
  socket: WSConnection;
  isAlive: boolean;
  rooms: Set<string>;
  meta: Record<string, unknown>;
}

function isControlMessage(value: unknown): value is ControlMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'hello' ||
    type === 'join' ||
    type === 'leave' ||
    type === 'ping' ||
    type === 'pong' ||
    type === 'error'
  );
}
