import {
  Body,
  NaiveBroadphase,
  SAPBroadphase,
  Vec3,
  World as CannonWorld,
  type Broadphase,
} from 'cannon-es';

export type BroadphaseKind = 'naive' | 'sap';

export interface PhysicsWorldOptions {
  /** Gravity vector. Default: `(0, -9.82, 0)`. */
  gravity?: { x: number; y: number; z: number };
  /** Broadphase strategy. SAP is generally faster for many bodies. */
  broadphase?: BroadphaseKind;
  /** Allow bodies to sleep (skips integration when at rest). Default: true. */
  allowSleep?: boolean;
}

/**
 * cannon-es wrapper. Owns the underlying World, exposes typed helpers, and
 * keeps a reverse map (entity → body) so a PhysicsSystem can sync from ECS.
 */
export class PhysicsWorld {
  readonly raw: CannonWorld;
  readonly bodyByEntity = new Map<number, Body>();

  constructor(options: PhysicsWorldOptions = {}) {
    this.raw = new CannonWorld();
    const g = options.gravity ?? { x: 0, y: -9.82, z: 0 };
    this.raw.gravity.set(g.x, g.y, g.z);
    this.raw.allowSleep = options.allowSleep ?? true;
    this.raw.broadphase = createBroadphase(options.broadphase ?? 'sap', this.raw);
  }

  add(entity: number, body: Body): void {
    this.bodyByEntity.set(entity, body);
    this.raw.addBody(body);
  }

  remove(entity: number): void {
    const body = this.bodyByEntity.get(entity);
    if (!body) return;
    this.raw.removeBody(body);
    this.bodyByEntity.delete(entity);
  }

  step(dt: number): void {
    this.raw.step(dt);
  }

  setGravity(x: number, y: number, z: number): void {
    this.raw.gravity.set(x, y, z);
  }
}

function createBroadphase(kind: BroadphaseKind, world: CannonWorld): Broadphase {
  return kind === 'sap' ? new SAPBroadphase(world) : new NaiveBroadphase();
}

export { Body, Vec3 };
export * from 'cannon-es';
