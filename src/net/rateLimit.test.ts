import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateLimiter, getClientIP } from './rateLimit.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to limit then blocks', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000, blockDurationMs: 5000 });
    expect(rl.isAllowed('k')).toBe(true);
    expect(rl.isAllowed('k')).toBe(true);
    expect(rl.isAllowed('k')).toBe(true);
    expect(rl.isAllowed('k')).toBe(false);
    rl.destroy();
  });

  it('check() returns rich result', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 1000, blockDurationMs: 1000 });
    expect(rl.check('k').allowed).toBe(true);
    expect(rl.check('k').allowed).toBe(true);
    const fail = rl.check('k');
    expect(fail.allowed).toBe(false);
    expect(fail.error).toMatch(/retry/);
    rl.destroy();
  });

  it('window resets after windowMs (without tripping block)', () => {
    vi.useFakeTimers();
    const rl = new RateLimiter({ limit: 3, windowMs: 100, blockDurationMs: 5000 });
    rl.isAllowed('k');
    rl.isAllowed('k');
    expect(rl.getRemaining('k')).toBe(1);
    vi.advanceTimersByTime(150);
    expect(rl.isAllowed('k')).toBe(true);
    expect(rl.getRemaining('k')).toBe(2);
    rl.destroy();
  });

  it('block expires after blockDurationMs', () => {
    vi.useFakeTimers();
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, blockDurationMs: 100 });
    rl.isAllowed('k');
    expect(rl.isAllowed('k')).toBe(false);
    vi.advanceTimersByTime(150);
    expect(rl.isAllowed('k')).toBe(true);
    rl.destroy();
  });

  it('block + unblock', () => {
    const rl = new RateLimiter();
    rl.block('k');
    expect(rl.isAllowed('k')).toBe(false);
    rl.unblock('k');
    expect(rl.isAllowed('k')).toBe(true);
    rl.destroy();
  });

  it('getClientIP extracts X-Forwarded-For first', () => {
    expect(
      getClientIP(
        { 'x-forwarded-for': '203.0.113.1, 198.51.100.10' },
        { remoteAddress: '127.0.0.1' },
      ),
    ).toBe('203.0.113.1');
    expect(getClientIP(undefined, { remoteAddress: '127.0.0.1' })).toBe('127.0.0.1');
    expect(getClientIP({})).toBe('unknown');
  });
});
