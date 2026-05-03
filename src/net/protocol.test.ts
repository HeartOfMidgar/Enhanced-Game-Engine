import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Protocol, sanitizeForLog, SolanaAddress } from './protocol.js';

describe('Protocol', () => {
  it('parses control messages without a game schema', () => {
    const protocol = new Protocol();
    const result = protocol.parse({ type: 'ping', id: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.type).toBe('ping');
  });

  it('rejects malformed control messages', () => {
    const protocol = new Protocol();
    const result = protocol.parse({ type: 'join' }); // missing room
    expect(result.ok).toBe(false);
  });

  it('parses JSON strings', () => {
    const protocol = new Protocol();
    const result = protocol.parse(JSON.stringify({ type: 'ping' }));
    expect(result.ok).toBe(true);
  });

  it('returns a parse error for invalid JSON strings', () => {
    const protocol = new Protocol();
    const result = protocol.parse('{ broken');
    expect(result.ok).toBe(false);
  });

  it('accepts game-specific messages when a game schema is configured', () => {
    const Chat = z.object({ type: z.literal('chat'), body: z.string() });
    const protocol = new Protocol({ game: z.discriminatedUnion('type', [Chat]) });
    const ok = protocol.parse({ type: 'chat', body: 'hi' });
    expect(ok.ok).toBe(true);
    const fail = protocol.parse({ type: 'chat' }); // missing body
    expect(fail.ok).toBe(false);
  });

  it('accepts control messages even when a game schema is configured', () => {
    const Chat = z.object({ type: z.literal('chat'), body: z.string() });
    const protocol = new Protocol({ game: z.discriminatedUnion('type', [Chat]) });
    const r = protocol.parse({ type: 'ping' });
    expect(r.ok).toBe(true);
  });

  it('SolanaAddress validates base58 wallets', () => {
    expect(SolanaAddress.safeParse('11111111111111111111111111111111').success).toBe(true);
    expect(SolanaAddress.safeParse('not-a-key').success).toBe(false);
  });

  it('sanitizeForLog redacts sensitive fields', () => {
    const out = sanitizeForLog({ user: 'alice', signature: 'secret', password: 'pw' });
    expect(out).toEqual({ user: 'alice', signature: '[REDACTED]', password: '[REDACTED]' });
  });
});
