import { EventEmitter } from '../core/EventEmitter.js';

import type { Connection } from './WSGateway.js';

export interface RoomEventMap extends Record<string, unknown[]> {
  join: [connection: Connection];
  leave: [connection: Connection];
  message: [connection: Connection, message: unknown];
  empty: [];
}

/**
 * A Room is a logical group of connections. Rooms route incoming messages to
 * a handler and broadcast outgoing messages to all members.
 *
 * Rooms are intentionally minimal — game-specific behaviour (state schemas,
 * authoritative simulation, persistence) is layered on top by extension or
 * composition.
 */
export class Room {
  readonly id: string;
  readonly events = new EventEmitter<RoomEventMap>();

  private readonly connections = new Set<Connection>();

  constructor(id: string) {
    this.id = id;
  }

  size(): number {
    return this.connections.size;
  }

  has(connection: Connection): boolean {
    return this.connections.has(connection);
  }

  list(): Connection[] {
    return Array.from(this.connections);
  }

  add(connection: Connection): void {
    if (this.connections.has(connection)) return;
    this.connections.add(connection);
    this.events.emit('join', connection);
  }

  remove(connection: Connection): void {
    if (!this.connections.delete(connection)) return;
    this.events.emit('leave', connection);
    if (this.connections.size === 0) this.events.emit('empty');
  }

  /** Broadcast a message to every connection except `except`. */
  broadcast(message: unknown, except?: Connection): void {
    for (const conn of this.connections) {
      if (conn === except) continue;
      conn.send(message);
    }
  }

  receive(connection: Connection, message: unknown): void {
    this.events.emit('message', connection, message);
  }
}
