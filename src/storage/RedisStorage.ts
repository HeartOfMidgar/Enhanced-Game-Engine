import type { Storage } from './Storage.js';

/**
 * Redis adapter for {@link Storage}.
 *
 * `ioredis` is an optional peer dependency. Install it explicitly to use this
 * adapter:
 *
 *   npm install ioredis
 */

/**
 * Structural shape of the subset of `ioredis` we use. Declared inline so the
 * engine doesn't take a hard type-time dependency on `ioredis`.
 */
export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
  setex(key: string, ttl: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export interface RedisStorageOptions {
  /** Existing ioredis client. Provide instead of `url` if you manage the connection. */
  client?: RedisLike;
  /** Connection URL, e.g. redis://localhost:6379 . Required if `client` is omitted. */
  url?: string;
  /** Key prefix to namespace this storage. */
  prefix?: string;
}

/**
 * Construct a {@link Storage} backed by Redis. Lazy-imports ioredis so the
 * dependency is only resolved when this constructor is actually called.
 */
export async function createRedisStorage(options: RedisStorageOptions = {}): Promise<Storage> {
  let client: RedisLike;
  if (options.client) {
    client = options.client;
  } else {
    if (!options.url) {
      throw new Error('createRedisStorage: provide either { client } or { url }.');
    }
    let mod: { default: new (url: string) => RedisLike };
    try {
      // @ts-expect-error - optional peer dependency, may not be installed
      mod = (await import('ioredis')) as unknown as {
        default: new (url: string) => RedisLike;
      };
    } catch (err) {
      throw new Error(
        'createRedisStorage: failed to import ioredis. Install it with `npm install ioredis`.',
        { cause: err as Error },
      );
    }
    client = new mod.default(options.url);
  }
  return new RedisStorage(client, options.prefix ?? '');
}

class RedisStorage implements Storage {
  constructor(
    private readonly client: RedisLike,
    private readonly prefix: string,
  ) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await this.client.setex(this.k(key), ttlSeconds, text);
    } else {
      await this.client.set(this.k(key), text);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async pushList<T>(key: string, value: T, maxLen = 100): Promise<void> {
    const text = JSON.stringify(value);
    await this.client.lpush(this.k(key), text);
    await this.client.ltrim(this.k(key), 0, maxLen - 1);
  }

  async readList<T>(key: string, count: number): Promise<T[]> {
    const list = await this.client.lrange(this.k(key), 0, count - 1);
    return list.map((s) => {
      try {
        return JSON.parse(s) as T;
      } catch {
        return s as unknown as T;
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.client.ping();
      return typeof r === 'string' && r.toUpperCase() === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // best-effort
    }
  }
}
