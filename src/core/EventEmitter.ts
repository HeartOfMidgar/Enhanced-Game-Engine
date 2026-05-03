/**
 * Type-safe event emitter.
 *
 * Generic over an event map describing the payload tuple for each event name:
 *
 * ```ts
 * type Events = {
 *   ready: [];
 *   tick: [dt: number];
 *   collision: [a: number, b: number];
 * };
 * const bus = new EventEmitter<Events>();
 * bus.on('tick', (dt) => { ... }); // dt: number
 * ```
 */
export type EventMap = Record<string, unknown[]>;

export type EventHandler<TArgs extends unknown[]> = (...args: TArgs) => void;

interface HandlerEntry<TArgs extends unknown[]> {
  fn: EventHandler<TArgs>;
  once: boolean;
}

export class EventEmitter<TEvents extends EventMap = EventMap> {
  private readonly handlers = new Map<keyof TEvents, Array<HandlerEntry<TEvents[keyof TEvents]>>>();

  on<K extends keyof TEvents>(event: K, fn: EventHandler<TEvents[K]>): this {
    this.add(event, fn as EventHandler<TEvents[keyof TEvents]>, false);
    return this;
  }

  once<K extends keyof TEvents>(event: K, fn: EventHandler<TEvents[K]>): this {
    this.add(event, fn as EventHandler<TEvents[keyof TEvents]>, true);
    return this;
  }

  off<K extends keyof TEvents>(event: K, fn: EventHandler<TEvents[K]>): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    const filtered = list.filter((entry) => entry.fn !== fn);
    if (filtered.length === 0) {
      this.handlers.delete(event);
    } else {
      this.handlers.set(event, filtered);
    }
    return this;
  }

  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return false;
    // Iterate over a snapshot so handlers can safely mutate the list.
    const snapshot = list.slice();
    let invoked = false;
    for (const entry of snapshot) {
      invoked = true;
      try {
        (entry.fn as EventHandler<TEvents[K]>)(...args);
      } catch (err) {
        // Don't let a bad handler kill the dispatch loop.
        console.error(`[EventEmitter] Handler for "${String(event)}" threw:`, err);
      }
    }
    if (snapshot.some((e) => e.once)) {
      this.handlers.set(
        event,
        list.filter((entry) => !entry.once || !snapshot.includes(entry)),
      );
      if (this.handlers.get(event)?.length === 0) this.handlers.delete(event);
    }
    return invoked;
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  eventNames(): Array<keyof TEvents> {
    return Array.from(this.handlers.keys());
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event === undefined) {
      this.handlers.clear();
    } else {
      this.handlers.delete(event);
    }
    return this;
  }

  clear(): void {
    this.handlers.clear();
  }

  private add<K extends keyof TEvents>(
    event: K,
    fn: EventHandler<TEvents[keyof TEvents]>,
    once: boolean,
  ): void {
    const list = this.handlers.get(event) ?? [];
    list.push({ fn, once });
    this.handlers.set(event, list);
  }
}
