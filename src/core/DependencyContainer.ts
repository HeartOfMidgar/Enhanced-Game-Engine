/**
 * Lightweight dependency-injection container with type-safe service tokens.
 *
 * Tokens are nominally typed via {@link Token} so that `container.get(token)`
 * returns the right type without an explicit generic argument.
 */

/** A token whose nominal type encodes the value it resolves to. */
export interface Token<T> {
  readonly description: string;
  /** Phantom type used only at compile time. */
  readonly __type: T;
}

/** Construct a service token. */
export function createToken<T>(description: string): Token<T> {
  return { description, __type: undefined as unknown as T };
}

export type Factory<T> = (container: DependencyContainer) => T;

export type Lifecycle = 'singleton' | 'transient';

interface Registration<T> {
  factory: Factory<T>;
  lifecycle: Lifecycle;
  tags: ReadonlySet<string>;
  cached?: T | undefined;
}

export interface RegisterOptions {
  lifecycle?: Lifecycle;
  tags?: readonly string[];
}

export class DependencyContainer {
  private readonly registrations = new Map<Token<unknown>, Registration<unknown>>();
  private readonly tagIndex = new Map<string, Set<Token<unknown>>>();
  private readonly parent?: DependencyContainer;

  constructor(parent?: DependencyContainer) {
    this.parent = parent;
  }

  register<T>(token: Token<T>, factory: Factory<T>, options: RegisterOptions = {}): this {
    const lifecycle = options.lifecycle ?? 'singleton';
    const tags = new Set(options.tags ?? []);
    const reg: Registration<T> = { factory, lifecycle, tags };
    this.registrations.set(token as Token<unknown>, reg as Registration<unknown>);
    for (const tag of tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set();
        this.tagIndex.set(tag, set);
      }
      set.add(token as Token<unknown>);
    }
    return this;
  }

  registerInstance<T>(token: Token<T>, instance: T, tags: readonly string[] = []): this {
    return this.register(token, () => instance, { lifecycle: 'singleton', tags }).preload(token);
  }

  /** Eagerly resolve and cache a singleton, surfacing factory errors immediately. */
  preload<T>(token: Token<T>): this {
    const reg = this.registrations.get(token as Token<unknown>) as Registration<T> | undefined;
    if (!reg) return this;
    if (reg.lifecycle === 'singleton' && reg.cached === undefined) {
      reg.cached = reg.factory(this);
    }
    return this;
  }

  get<T>(token: Token<T>): T {
    const reg = this.registrations.get(token as Token<unknown>) as Registration<T> | undefined;
    if (reg) {
      if (reg.lifecycle === 'singleton') {
        if (reg.cached === undefined) reg.cached = reg.factory(this);
        return reg.cached;
      }
      return reg.factory(this);
    }
    if (this.parent) return this.parent.get(token);
    throw new Error(`Dependency not registered: ${token.description}`);
  }

  tryGet<T>(token: Token<T>): T | undefined {
    return this.has(token) ? this.get(token) : undefined;
  }

  has<T>(token: Token<T>): boolean {
    return (
      this.registrations.has(token as Token<unknown>) || (this.parent?.has(token) ?? false)
    );
  }

  /** Resolve every dependency tagged with the given string. Includes parent. */
  getByTag<T>(tag: string): T[] {
    const tokens = this.tagIndex.get(tag);
    const result: T[] = [];
    if (tokens) {
      for (const token of tokens) {
        result.push(this.get(token as Token<T>));
      }
    }
    if (this.parent) result.push(...this.parent.getByTag<T>(tag));
    return result;
  }

  createChild(): DependencyContainer {
    return new DependencyContainer(this);
  }

  clear(): void {
    this.registrations.clear();
    this.tagIndex.clear();
  }
}
