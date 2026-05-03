import type { Engine } from './Engine.js';

/**
 * A System is a unit of per-tick logic that operates on the world.
 *
 * All hooks are optional, letting authors implement only what's relevant.
 */
export interface System {
  /** Optional human-readable name, defaults to the class name on registration. */
  readonly name?: string;
  /**
   * Lower priority numbers run first. When unset, defaults to {@link Priority.Default}.
   * Render systems should typically be {@link Priority.Render}.
   */
  readonly priority?: number;
  /** Optional list of system names that must already be registered. */
  readonly dependencies?: readonly string[];

  init?(engine: Engine): void | Promise<void>;
  /** Per-frame logic. `alpha` is the interpolation factor in [0, 1) between fixed steps. */
  update?(dt: number, alpha: number): void;
  /** Logic at the engine's fixed timestep (good for physics, deterministic sims). */
  fixedUpdate?(fixedDt: number): void;
  destroy?(): void;
}

/**
 * Standard priority bands. Systems are sorted ascending: Input → Logic → Physics → Render.
 */
export const Priority = {
  Input: 100,
  Logic: 500,
  Physics: 700,
  PostPhysics: 800,
  Render: 1000,
  PostRender: 1100,
  Default: 500,
} as const;

export class SystemDependencyError extends Error {
  constructor(
    public readonly system: string,
    public readonly missing: string,
  ) {
    super(`System "${system}" requires "${missing}" which is not registered.`);
    this.name = 'SystemDependencyError';
  }
}
