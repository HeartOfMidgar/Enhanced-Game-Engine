/**
 * Reference networking server. Wire your game logic on top by subscribing to
 * `gateway.events` and writing to `gateway.rooms`.
 *
 * Run with:  npm run dev:server
 */

import { z } from 'zod';

import { Protocol } from '../src/net/protocol.js';
import { WSGateway } from '../src/net/WSGateway.js';

const ChatMessage = z.object({
  type: z.literal('chat'),
  from: z.string().max(64),
  body: z.string().max(512),
});

const protocol = new Protocol({
  game: z.discriminatedUnion('type', [ChatMessage]),
});

const port = Number.parseInt(process.env.PORT ?? '3001', 10);

const gateway = new WSGateway({
  port,
  protocol,
  rateLimit: { limit: 200, windowMs: 60_000 },
  heartbeatMs: 30_000,
});

console.info(`[server] WSGateway listening on ws://localhost:${port}`);

gateway.events.on('connection', (conn) => {
  console.info(`[server] connect ${conn.id} (${conn.ip})`);
});

gateway.events.on('disconnect', (conn, code) => {
  console.info(`[server] disconnect ${conn.id} (code=${code})`);
});

gateway.events.on('message', (conn, message) => {
  if (typeof message !== 'object' || message === null) return;
  const m = message as { type: string };
  if (m.type !== 'chat') return;
  // Echo to every room the sender is in.
  for (const room of gateway.rooms.values()) {
    if (room.has(conn)) room.broadcast(m);
  }
});

gateway.events.on('invalid', (conn, _raw, err) => {
  console.warn(`[server] invalid message from ${conn.id}: ${err}`);
});

const shutdown = (): void => {
  console.info('[server] shutting down');
  gateway.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
