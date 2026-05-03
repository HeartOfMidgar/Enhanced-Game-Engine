/**
 * Minimal key-value + capped-list interface for game state. Defaults to an
 * in-memory implementation; the Redis adapter (optional peer) plugs in for
 * multi-process deployments.
 */
export interface Storage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Append to the head of a capped list. Older entries beyond `maxLen` are dropped. */
  pushList<T>(key: string, value: T, maxLen?: number): Promise<void>;
  /** Read the most recent N entries, newest first. */
  readList<T = unknown>(key: string, count: number): Promise<T[]>;
  ping(): Promise<boolean>;
  /** Free underlying resources. */
  close(): Promise<void>;
}

interface MemEntry<T = unknown> {
  value: T;
  expiresAt?: number;
}

export class MemoryStorage implements Storage {
  private readonly kv = new Map<string, MemEntry>();
  private readonly lists = new Map<string, unknown[]>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.kv.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
      this.kv.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const entry: MemEntry<T> = { value };
    if (ttlSeconds !== undefined) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    this.kv.set(key, entry as MemEntry);
  }

  async delete(key: string): Promise<void> {
    this.kv.delete(key);
    this.lists.delete(key);
  }

  async pushList<T>(key: string, value: T, maxLen = 100): Promise<void> {
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.unshift(value);
    if (list.length > maxLen) list.length = maxLen;
  }

  async readList<T>(key: string, count: number): Promise<T[]> {
    const list = this.lists.get(key);
    if (!list) return [];
    return list.slice(0, count) as T[];
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.kv.clear();
    this.lists.clear();
  }
}
