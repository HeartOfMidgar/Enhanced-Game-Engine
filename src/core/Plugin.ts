import type { Engine } from './Engine.js';

/**
 * A Plugin extends the engine with optional, late-bound functionality
 * (debug panels, networking, blockchain adapters, asset pipelines, ...).
 *
 * Unlike Systems, plugins are NOT executed in the per-frame loop — they wire
 * themselves into the engine via init() and listen to events / register
 * services on the container.
 */
export interface Plugin {
  /** Stable identifier; if omitted the engine assigns one on registration. */
  readonly name?: string;
  init?(engine: Engine): void | Promise<void>;
  destroy?(): void;
}
