import { type Entity, type World } from './World.js';

/**
 * A Scene is a logical bundle of entities that can be loaded / unloaded as a unit.
 *
 * The engine itself doesn't enforce scene boundaries inside the ECS world;
 * scenes are a higher-level grouping that maps an opaque set of entities to
 * a name so games can swap them as a chunk (level transitions, menu vs game).
 */
export class Scene {
  readonly name: string;
  readonly entities = new Set<Entity>();

  constructor(name: string) {
    this.name = name;
  }

  add(entity: Entity): void {
    this.entities.add(entity);
  }

  remove(entity: Entity): void {
    this.entities.delete(entity);
  }

  /** Destroy every entity in this scene from the given world. */
  unload(world: World): void {
    for (const entity of this.entities) {
      world.destroy(entity);
    }
    this.entities.clear();
  }
}

export class SceneManager {
  private readonly scenes = new Map<string, Scene>();
  private active?: Scene;

  constructor(private readonly world: World) {}

  create(name: string): Scene {
    const scene = new Scene(name);
    this.scenes.set(name, scene);
    return scene;
  }

  get(name: string): Scene | undefined {
    return this.scenes.get(name);
  }

  setActive(name: string): Scene {
    const scene = this.scenes.get(name);
    if (!scene) throw new Error(`Scene "${name}" is not registered.`);
    this.active = scene;
    return scene;
  }

  getActive(): Scene | undefined {
    return this.active;
  }

  unload(name: string): void {
    const scene = this.scenes.get(name);
    if (!scene) return;
    scene.unload(this.world);
    this.scenes.delete(name);
    if (this.active === scene) this.active = undefined;
  }
}
