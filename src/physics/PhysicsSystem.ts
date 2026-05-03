import { Priority, type System } from '../core/System.js';

import type { PhysicsWorld } from './PhysicsWorld.js';

/**
 * Drives the physics world at the engine's fixed timestep.
 *
 * Game-specific systems own ECS↔body sync (writing positions/rotations from
 * cannon Bodies into a Transform component, and conversely seeding bodies
 * from authored data). This system only advances the simulation.
 */
export class PhysicsSystem implements System {
  readonly name = 'PhysicsSystem';
  readonly priority = Priority.Physics;

  constructor(private readonly physics: PhysicsWorld) {}

  fixedUpdate(fixedDt: number): void {
    this.physics.step(fixedDt);
  }
}
