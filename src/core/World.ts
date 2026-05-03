import {
  addEntity,
  removeEntity,
  createWorld,
  defineComponent,
  addComponent,
  removeComponent,
  hasComponent,
  defineQuery,
  type IWorld,
  type ComponentType,
  type Type,
} from 'bitecs';

/**
 * Thin typed wrapper over bitecs' world & query APIs so consumers don't have
 * to import bitecs directly and we can layer entity metadata in one place.
 */
export type Entity = number;

export interface WorldOptions {
  /** Initial entity capacity hint. */
  size?: number;
}

export class World {
  /** Underlying bitecs world. Exposed for advanced users / interop. */
  readonly raw: IWorld;

  constructor(options: WorldOptions = {}) {
    this.raw = options.size !== undefined ? createWorld(options.size) : createWorld();
  }

  /** Spawn a new entity. */
  create(): Entity {
    return addEntity(this.raw);
  }

  /** Despawn an entity (removes all components). */
  destroy(entity: Entity): void {
    removeEntity(this.raw, entity);
  }

  /** Attach a component to an entity. */
  add<S extends Record<string, Type>>(entity: Entity, component: ComponentType<S>): void {
    addComponent(this.raw, component, entity);
  }

  /** Remove a component from an entity. */
  remove<S extends Record<string, Type>>(entity: Entity, component: ComponentType<S>): void {
    removeComponent(this.raw, component, entity);
  }

  /** Check whether an entity has a component. */
  has<S extends Record<string, Type>>(entity: Entity, component: ComponentType<S>): boolean {
    return hasComponent(this.raw, component, entity);
  }
}

// Re-export the bitecs primitives consumers actually need so they don't need a
// direct dependency on bitecs in their own package.
export { defineComponent, defineQuery };
export type { ComponentType, Type, IWorld };
