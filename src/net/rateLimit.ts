/**
 * In-memory token-bucket-ish rate limiter.
 *
 * Sliding window with a configurable block penalty, designed to replace the
 * `express-rate-limit` dependency for both HTTP routes and per-connection
 * WebSocket throttling. Strictly typed, zero external dependencies.
 */

export interface RateLimitConfig {
  /** Maximum requests within `windowMs`. */
  limit: number;
  /** Window duration in ms. */
  windowMs: number;
  /** How long to block a key after exceeding the limit. */
  blockDurationMs: number;
  /** Cleanup cadence; defaults to 5 * windowMs. */
  cleanupIntervalMs?: number;
}

interface Entry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

export interface CheckResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  error?: string;
}

export class RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly config: Required<RateLimitConfig>;
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      limit: config.limit ?? 100,
      windowMs: config.windowMs ?? 60_000,
      blockDurationMs: config.blockDurationMs ?? 300_000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 300_000,
    };
    this.startCleanup();
  }

  /** Allow another request from `key`? Side-effecting (counts the call). */
  isAllowed(key: string): boolean {
    const now = Date.now();
    let entry = this.entries.get(key);

    if (!entry) {
      entry = { count: 1, windowStart: now, blocked: false, blockedUntil: 0 };
      this.entries.set(key, entry);
      return true;
    }

    if (entry.blocked) {
      if (now < entry.blockedUntil) return false;
      entry.blocked = false;
      entry.count = 1;
      entry.windowStart = now;
      return true;
    }

    if (now - entry.windowStart >= this.config.windowMs) {
      entry.count = 1;
      entry.windowStart = now;
      return true;
    }

    entry.count += 1;
    if (entry.count > this.config.limit) {
      entry.blocked = true;
      entry.blockedUntil = now + this.config.blockDurationMs;
      return false;
    }
    return true;
  }

  /** Combined isAllowed + remaining + reset metadata. */
  check(key: string, subKey?: string): CheckResult {
    const composite = subKey ? `${key}:${subKey}` : key;
    const allowed = this.isAllowed(composite);
    const resetIn = this.getResetTime(composite);
    return {
      allowed,
      remaining: this.getRemaining(composite),
      resetIn,
      error: allowed ? undefined : `Rate limited; retry in ${Math.ceil(resetIn / 1000)}s`,
    };
  }

  getRemaining(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return this.config.limit;
    if (entry.blocked) return 0;
    return Math.max(0, this.config.limit - entry.count);
  }

  getResetTime(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    if (entry.blocked) return Math.max(0, entry.blockedUntil - Date.now());
    return Math.max(0, entry.windowStart + this.config.windowMs - Date.now());
  }

  block(key: string, durationMs = this.config.blockDurationMs): void {
    const now = Date.now();
    this.entries.set(key, {
      count: this.config.limit + 1,
      windowStart: now,
      blocked: true,
      blockedUntil: now + durationMs,
    });
  }

  unblock(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.blocked = false;
    entry.blockedUntil = 0;
    entry.count = 0;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): { size: number; blocked: number } {
    const now = Date.now();
    let blocked = 0;
    for (const entry of this.entries.values()) {
      if (entry.blocked && now < entry.blockedUntil) blocked += 1;
    }
    return { size: this.entries.size, blocked };
  }

  destroy(): void {
    if (this.cleanupHandle) clearInterval(this.cleanupHandle);
    this.cleanupHandle = null;
    this.entries.clear();
  }

  private startCleanup(): void {
    if (typeof setInterval === 'undefined') return;
    this.cleanupHandle = setInterval(() => {
      const now = Date.now();
      const max = this.config.windowMs * 2;
      for (const [key, entry] of this.entries) {
        const aged = now - entry.windowStart > max;
        const expiredBlock = entry.blocked && now >= entry.blockedUntil;
        if (aged && (!entry.blocked || expiredBlock)) {
          this.entries.delete(key);
        }
      }
    }, this.config.cleanupIntervalMs);
  }
}

/**
 * Extract a client IP from headers / socket. Supports common proxy headers.
 */
export function getClientIP(
  headers?: Record<string, string | string[] | undefined>,
  socket?: { remoteAddress?: string },
): string {
  if (headers) {
    const fwd = headers['x-forwarded-for'];
    if (fwd) {
      const ip = Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0];
      if (ip) return ip.trim();
    }
    const real = headers['x-real-ip'];
    if (real) return Array.isArray(real) ? (real[0] ?? 'unknown') : real;
  }
  return socket?.remoteAddress ?? 'unknown';
}
