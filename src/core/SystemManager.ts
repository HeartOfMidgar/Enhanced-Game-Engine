import type { Engine } from './Engine.js';
import { Priority, SystemDependencyError, type System } from './System.js';

interface Entry {
  name: string;
  system: System;
  priority: number;
  enabled: boolean;
  initialized: boolean;
  /** Last update() execution time in ms (for telemetry). */
  lastUpdateMs: number;
  /** Last fixedUpdate() execution time in ms. */
  lastFixedMs: number;
}

/**
 * Tracks systems registered with the engine, runs init / update / fixedUpdate / destroy
 * in priority order, and surfaces basic per-system telemetry.
 */
export class SystemManager {
  private readonly entries = new Map<string, Entry>();
  private sorted: Entry[] = [];
  private dirty = false;

  constructor(private readonly engine: Engine) {}

  /** Register a system instance. Throws if a dependency is unmet. */
  register<T extends System>(system: T, name?: string): T {
    const resolvedName = name ?? system.name ?? system.constructor.name ?? 'AnonymousSystem';

    if (this.entries.has(resolvedName)) {
      // Replace, but warn — usually a bug.
      console.warn(`[SystemManager] System "${resolvedName}" already registered; replacing.`);
      this.unregister(resolvedName);
    }

    if (system.dependencies) {
      for (const dep of system.dependencies) {
        if (!this.entries.has(dep)) {
          throw new SystemDependencyError(resolvedName, dep);
        }
      }
    }

    const entry: Entry = {
      name: resolvedName,
      system,
      priority: system.priority ?? Priority.Default,
      enabled: true,
      initialized: false,
      lastUpdateMs: 0,
      lastFixedMs: 0,
    };
    this.entries.set(resolvedName, entry);
    this.dirty = true;
    return system;
  }

  unregister(name: string): boolean {
    const entry = this.entries.get(name);
    if (!entry) return false;
    try {
      entry.system.destroy?.();
    } catch (err) {
      console.error(`[SystemManager] destroy() of "${name}" threw:`, err);
    }
    this.entries.delete(name);
    this.dirty = true;
    return true;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get<T extends System = System>(name: string): T | undefined {
    return this.entries.get(name)?.system as T | undefined;
  }

  list(): System[] {
    return this.sortedEntries().map((e) => e.system);
  }

  /** Set whether a system's update / fixedUpdate hooks should run. */
  setEnabled(name: string, enabled: boolean): boolean {
    const entry = this.entries.get(name);
    if (!entry) return false;
    entry.enabled = enabled;
    return true;
  }

  isEnabled(name: string): boolean {
    return this.entries.get(name)?.enabled ?? false;
  }

  /** Read-only telemetry snapshot keyed by system name. */
  telemetry(): Record<string, { priority: number; enabled: boolean; updateMs: number; fixedMs: number }> {
    const out: Record<string, { priority: number; enabled: boolean; updateMs: number; fixedMs: number }> = {};
    for (const [name, e] of this.entries) {
      out[name] = {
        priority: e.priority,
        enabled: e.enabled,
        updateMs: e.lastUpdateMs,
        fixedMs: e.lastFixedMs,
      };
    }
    return out;
  }

  /** Synchronously call init() on every uninitialized system, in priority order. */
  initializeAll(): void {
    for (const entry of this.sortedEntries()) {
      if (entry.initialized) continue;
      try {
        const r = entry.system.init?.(this.engine);
        if (r instanceof Promise) {
          r.catch((err) => console.error(`[SystemManager] async init() of "${entry.name}" rejected:`, err));
        }
        entry.initialized = true;
      } catch (err) {
        console.error(`[SystemManager] init() of "${entry.name}" threw:`, err);
      }
    }
  }

  fixedUpdate(fixedDt: number): void {
    for (const entry of this.sortedEntries()) {
      if (!entry.enabled || !entry.initialized || !entry.system.fixedUpdate) continue;
      const t0 = performance.now();
      try {
        entry.system.fixedUpdate(fixedDt);
      } catch (err) {
        console.error(`[SystemManager] fixedUpdate() of "${entry.name}" threw:`, err);
      }
      entry.lastFixedMs = performance.now() - t0;
    }
  }

  update(dt: number, alpha: number): void {
    for (const entry of this.sortedEntries()) {
      if (!entry.enabled || !entry.initialized || !entry.system.update) continue;
      const t0 = performance.now();
      try {
        entry.system.update(dt, alpha);
      } catch (err) {
        console.error(`[SystemManager] update() of "${entry.name}" threw:`, err);
      }
      entry.lastUpdateMs = performance.now() - t0;
    }
  }

  destroyAll(): void {
    // Destroy in reverse priority so renderers come down before logic / physics.
    const list = this.sortedEntries().slice().reverse();
    for (const entry of list) {
      try {
        entry.system.destroy?.();
      } catch (err) {
        console.error(`[SystemManager] destroy() of "${entry.name}" threw:`, err);
      }
    }
    this.entries.clear();
    this.sorted = [];
    this.dirty = false;
  }

  private sortedEntries(): Entry[] {
    if (this.dirty) {
      this.sorted = Array.from(this.entries.values()).sort((a, b) => a.priority - b.priority);
      this.dirty = false;
    }
    return this.sorted;
  }
}
