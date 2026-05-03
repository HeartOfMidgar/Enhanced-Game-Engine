# Plugins & devtools

Plugins are how subsystems hook into the engine. They register services with
the DI container and add systems to the system manager.

## The Plugin interface

```ts
export interface Plugin {
  /** Stable name; must be unique in the registry. */
  readonly name: string;

  /** Mount the plugin. Called once during `engine.use(plugin)`. */
  install(engine: Engine): void | Promise<void>;

  /** Optional teardown when the engine is destroyed. */
  uninstall?(engine: Engine): void | Promise<void>;
}
```

## Authoring a plugin

```ts
import {
  type Plugin,
  type Engine,
  Priority,
  ServiceTokens,
  createToken,
} from 'game-engine-enhanced';

const TimerToken = createToken<{ now: () => number }>('Timer');

export class TimerPlugin implements Plugin {
  readonly name = 'timer';

  install(engine: Engine) {
    engine.deps.register(TimerToken, { now: () => performance.now() });

    engine.systems.register({
      name: 'timer-tick',
      priority: Priority.Logic,
      update(dt) {
        /* ... */
      },
    });
  }
}
```

Mount it:

```ts
await engine.use(new TimerPlugin());
const timer = engine.deps.resolve(TimerToken);
```

### Async installs

`install` can return a Promise. This is how the renderer plugin can wait for a
canvas, the audio plugin can resume a `AudioContext`, or the chain plugin can
load optional dependencies on demand.

### Service tokens

Use `createToken<T>('name')` to declare a token with its service type. Tokens
are nominal — two tokens with the same name are still distinct types. Built-in
tokens live on `ServiceTokens`:

```ts
ServiceTokens.Engine;
ServiceTokens.World;
ServiceTokens.Renderer;
ServiceTokens.Physics;
ServiceTokens.Input;
ServiceTokens.Audio;
ServiceTokens.Assets;
ServiceTokens.Time;
ServiceTokens.Events;
```

## DebugPanel

The `DebugPanel` plugin is a single dockable HTML panel that consolidates the
old `DebugPanelPlugin`, `DependencyVisualizerPlugin`, `ComponentUsageTracker`,
`SystemPerformanceAnalyzer` and `DependencyAnalyzer` from the previous engine.

Tabs:

- **FPS** — current FPS, average frame time, fixed-step accumulator visualisation.
- **Entities** — live entity count, component breakdown, spawn/despawn events.
- **Systems** — execution order, per-system update / fixedUpdate timing.
- **Deps** — registered services, plugin list, force-directed dependency graph.

```ts
import { DebugPanel } from 'game-engine-enhanced/devtools';

await engine.use(
  new DebugPanel({
    enabled: import.meta.env.DEV,
    dock: 'right',
    hotkey: 'F1',
  }),
);
```

The panel is purely DOM-based — no Three.js overlays — so it works equally
well in editor scenes and full-screen games.

### Hooks for custom tabs

You can extend the panel from another plugin:

```ts
const panel = engine.deps.resolve(ServiceTokens.DebugPanel);
panel.addTab('Audio', (root) => {
  // mount your own UI inside `root`
});
```

## Authoring tips

- Register systems with sensible `Priority` values; don't fight the order.
- Clean up listeners in `uninstall` — plugins may be hot-reloaded in dev.
- If you publish a third-party plugin, namespace its services
  (e.g. `createToken('myCo.Logger')`).
- Never call `engine.start()` from inside a plugin.
