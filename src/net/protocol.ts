import { z, type ZodSchema, type ZodTypeAny } from 'zod';

/**
 * The engine ships a small set of envelope/control messages so the gateway,
 * room manager, and clients agree on framing. Game-specific messages plug in
 * by registering their own zod schemas in a {@link Protocol}.
 */

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/** Solana base58 wallet address (32–44 chars from the b58 alphabet). */
export const SolanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address');

/** Hex string of fixed length. */
export const Hex = (length: number): ZodSchema<string> =>
  z.string().regex(new RegExp(`^[a-fA-F0-9]{${length}}$`), `Expected ${length} hex chars`);

/** Sha-256 hex digest. */
export const Sha256Hex = Hex(64);

/** UUID v4-ish (loose validator). */
export const UuidLike = z.string().regex(/^[0-9a-fA-F-]{8,64}$/, 'Invalid id');

// ---------------------------------------------------------------------------
// Standard envelope messages
// ---------------------------------------------------------------------------

export const HelloMessage = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int().nonnegative(),
  client: z.string().max(64).optional(),
});

export const JoinRoomMessage = z.object({
  type: z.literal('join'),
  room: z.string().min(1).max(64),
  /** Optional bag of join-time metadata (auth tokens, names, ...). */
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const LeaveRoomMessage = z.object({
  type: z.literal('leave'),
  room: z.string().min(1).max(64),
});

export const PingMessage = z.object({
  type: z.literal('ping'),
  /** Round-trip-time correlation id; server echoes in `pong`. */
  id: z.number().int().nonnegative().optional(),
  ts: z.number().int().nonnegative().optional(),
});

export const PongMessage = z.object({
  type: z.literal('pong'),
  id: z.number().int().nonnegative().optional(),
  ts: z.number().int().nonnegative().optional(),
});

export const ErrorMessage = z.object({
  type: z.literal('error'),
  code: z.string().min(1).max(64),
  message: z.string().max(512),
});

/** Default control message union recognized by the engine's gateway. */
export const ControlMessage = z.discriminatedUnion('type', [
  HelloMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
]);

export type ControlMessage = z.infer<typeof ControlMessage>;

// ---------------------------------------------------------------------------
// Protocol — game-specific schemas plug in here
// ---------------------------------------------------------------------------

export interface ProtocolOptions<TGame extends ZodTypeAny | undefined = undefined> {
  /** A discriminated union of game-specific messages. */
  game?: TGame;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Bundles control messages with game-specific messages and exposes a single
 * {@link Protocol.parse} entry point used by both clients and servers.
 */
export class Protocol<TGame extends ZodTypeAny | undefined = undefined> {
  readonly game: TGame | undefined;

  constructor(options: ProtocolOptions<TGame> = {}) {
    this.game = options.game;
  }

  parse(
    raw: unknown,
  ): ParseResult<ControlMessage | (TGame extends ZodTypeAny ? z.infer<TGame> : never)> {
    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'parse error' };
      }
    }

    const control = ControlMessage.safeParse(data);
    if (control.success) {
      return { ok: true, data: control.data };
    }

    if (this.game) {
      const game = this.game.safeParse(data);
      if (game.success) {
        return {
          ok: true,
          data: game.data as TGame extends ZodTypeAny ? z.infer<TGame> : never,
        };
      }
      const issues = [...control.error.issues, ...game.error.issues].map((i) => i.message);
      return { ok: false, error: issues.join(', ') };
    }

    return { ok: false, error: control.error.issues.map((i) => i.message).join(', ') };
  }

  encode(message: unknown): string {
    return JSON.stringify(message);
  }
}

/**
 * Convenience alias for any concrete `Protocol` regardless of its
 * game-message schema. Used by `NetClient` and `WSGateway` so callers can
 * hand them protocols configured with arbitrary game-specific zod unions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProtocol = Protocol<any>;

/**
 * Strip sensitive fields from a message before logging.
 */
export function sanitizeForLog(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of ['signature', 'privateKey', 'secret', 'password', 'token']) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}
