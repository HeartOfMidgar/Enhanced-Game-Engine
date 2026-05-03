/**
 * Lightweight runtime registry for component & system types.
 *
 * Its sole job is to let tooling (debug panels, serializers) discover what's
 * been declared by name without owning instantiation. For DI use
 * {@link DependencyContainer}; for systems use {@link SystemManager}.
 */

export interface ComponentTypeInfo<TSchema = unknown> {
  name: string;
  schema?: TSchema;
  category?: string;
  description?: string;
}

export interface SystemTypeInfo {
  name: string;
  category?: string;
  description?: string;
  dependencies?: readonly string[];
}

export class TypeRegistry {
  private readonly components = new Map<string, ComponentTypeInfo>();
  private readonly systems = new Map<string, SystemTypeInfo>();

  registerComponent<TSchema>(info: ComponentTypeInfo<TSchema>): void {
    this.components.set(info.name, info as ComponentTypeInfo);
  }

  registerSystem(info: SystemTypeInfo): void {
    this.systems.set(info.name, info);
  }

  getComponent(name: string): ComponentTypeInfo | undefined {
    return this.components.get(name);
  }

  getSystem(name: string): SystemTypeInfo | undefined {
    return this.systems.get(name);
  }

  listComponents(): ComponentTypeInfo[] {
    return Array.from(this.components.values());
  }

  listSystems(): SystemTypeInfo[] {
    return Array.from(this.systems.values());
  }

  clear(): void {
    this.components.clear();
    this.systems.clear();
  }
}
