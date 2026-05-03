# Networking

The networking subsystem is a small, opinionated WebSocket stack:

- `WSGateway` — server, manages connections and rooms.
- `Room` — server-side game/lobby unit; presence + broadcast.
- `NetClient` — typed client wrapper over `WebSocket`.
- `Protocol` — `zod`-validated message envelope (control + game messages).
- `RateLimiter` — in-memory sliding-window limiter for per-key throttling.
- `Storage` — pluggable key-value store; in-memory by default, optional Redis.

It deliberately replaces Colyseus and `express-rate-limit` with a much smaller
surface tuned for the engine's needs.

## Protocol

All messages are validated with `zod`. The engine ships built-in schemas for
control traffic (`hello`, `join`, `leave`, `ping`, `error`) and lets you supply
your own discriminated-union schema for game messages.

```ts
import { z } from 'zod';
import { Protocol, ControlMessage } from 'game-engine-enhanced/net';

const GameMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chat'), text: z.string().max(280) }),
  z.object({ type: z.literal('move'), x: z.number(), y: z.number() }),
]);

export const protocol = new Protocol(GameMessage);
export type GameMessage = z.infer<typeof GameMessage>;
```

## Server: `WSGateway`

```ts
import { WSGateway, RateLimiter } from 'game-engine-enhanced/net';
import { MemoryStorage } from 'game-engine-enhanced/storage';
import { protocol } from './protocol';

const gateway = new WSGateway({
  protocol,
  storage: new MemoryStorage(),
  rateLimiter: new RateLimiter({ limit: 60, windowMs: 10_000 }),
  port: 8080,
});

gateway.onConnection((conn) => {
  conn.on('chat', (msg, ctx) => {
    ctx.room?.broadcast({ type: 'chat', text: msg.text });
  });
});

await gateway.start();
```

### Rooms

A room is a logical collection of connections. `Room` exposes:

```ts
room.id;
room.size;
room.join(connection);
room.leave(connection);
room.broadcast(message); // to all
room.sendTo(connectionId, msg); // to one
room.presence; // metadata snapshot
```

Rooms can be created on demand or named explicitly:

```ts
gateway.onConnection((conn) => {
  const room = gateway.rooms.getOrCreate('lobby');
  room.join(conn);
});
```

### Authentication

The gateway has no opinion about auth — pass whatever you want in the
`hello` message and verify it in your `onConnection` handler. The Solana
adapter (`docs/chain.md`) provides signed-action helpers for this.

### Rate limiting

`RateLimiter` is a sliding-window limiter with a configurable block penalty.
The gateway uses it for both connection and per-message throttling; you can
also use it standalone:

```ts
const rl = new RateLimiter({ limit: 100, windowMs: 60_000, blockDurationMs: 5 * 60_000 });

if (!rl.isAllowed(clientIp)) return reject('rate-limited');
```

## Client: `NetClient`

```ts
import { NetClient } from 'game-engine-enhanced/net';
import { protocol } from './protocol';

const net = new NetClient({ url: 'ws://localhost:8080', protocol });

net.on('chat', (msg) => console.log(msg.text));
await net.connect();
net.send({ type: 'chat', text: 'hello world' });
```

The client auto-reconnects with exponential backoff and replays the last
`hello`. It exposes typed `on(type, handler)` based on the protocol you pass
in.

## Storage

`Storage` is a tiny KV interface used by the gateway for presence/session data:

```ts
export interface Storage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, by?: number): Promise<number>;
  exists(key: string): Promise<boolean>;
}
```

Two implementations ship with the engine:

- `MemoryStorage` — in-memory, default.
- `RedisStorage` — optional, requires `npm install ioredis`.

```ts
import { RedisStorage } from 'game-engine-enhanced/storage';

const storage = await RedisStorage.connect({ url: process.env.REDIS_URL! });
```

If `ioredis` isn't installed, `RedisStorage.connect` throws a clear
`ioredis is not installed. Run: npm install ioredis` error.

## Reference server

A working server is included at [`server/index.ts`](../server/index.ts). It
sets up an Express app, mounts the `WSGateway`, and runs a chat-echo room you
can hit from the `networking` demo in the examples playground.

```bash
npm run dev:server
```

## Testing tips

- Use a `MemoryStorage` and a fresh `RateLimiter` per test.
- Drive the gateway with two `NetClient` instances pointed at a random port
  to test broadcast semantics end-to-end.
- The protocol's `parse` method returns a typed result; assert against the
  discriminated union to keep tests readable.
