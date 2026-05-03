# Usage guide

This guide walks through booting an engine, mounting subsystems, and writing
your first system.

## Install

```bash
npm install game-engine-enhanced three bitecs cannon-es zod ws
```

The runtime peers (`three`, `bitecs`, `cannon-es`, `zod`, `ws`) are already in
the engine's `dependencies`; if you're cloning this repo for development, just
`npm install` at the root.

## Boot the engine

```ts
import { Engine } from 'game-engine-enhanced';

const engine = new Engine({
  fixedTimestep: 1 / 60, // physics tick rate
  maxFps: 0,             // 0 = uncapped
});

engine.start();
```

## Mount subsystems

Most features ship as plugins. Only mount what you need.

```ts
import { RenderPlugin } from 'game-engine-enhanced/render';
import { PhysicsPlugin } from 'game-engine-enhanced/physics';
import { InputPlugin } from 'game-engine-enhanced/input';
import { AudioPlugin } from 'game-engine-enhanced/audio';
import { DebugPanel } from 'game-engine-enhanced/devtools';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;

await engine.use(new RenderPlugin({ canvas }));
await engine.use(new PhysicsPlugin());
await engine.use(new InputPlugin({ target: window }));
await engine.use(new AudioPlugin());
await engine.use(new DebugPanel({ enabled: true }));

engine.start();
```

## Spawn an entity

```ts
import { Transform, MeshRef } from 'game-engine-enhanced/render';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';

const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());

const e = engine.world.create();
engine.world.addComponent(e, Transform, { position: [0, 1, 0] });
engine.world.addComponent(e, MeshRef, { mesh });
```

## Write a system

A system is just an object implementing one or more lifecycle hooks. Order is
controlled by `priority`.

```ts
import { Priority, type System } from 'game-engine-enhanced';

const SpinSystem: System = {
  name: 'spin',
  priority: Priority.Logic,
  update(dt) {
    // Rotate every entity with a Transform.
    for (const eid of engine.world.queryAll(Transform)) {
      Transform.rotation.y[eid] += dt;
    }
  },
};

engine.systems.register(SpinSystem);
```

## Action mapping

Map raw devices to game-level actions:

```ts
import { ActionMap } from 'game-engine-enhanced/input';

const actions = new ActionMap({
  jump:  ['Key:Space', 'Pad:0:0'],
  move:  { bindings: ['Axis:0:0:+', 'Axis:0:0:-'], threshold: 0.2 },
  fire:  ['Mouse:0', 'Pad:0:7'],
});

// In a system: actions.update(inputManager.snapshot()); if (actions.pressed('jump')) ...
```

## Asset loading

```ts
import { AssetManager } from 'game-engine-enhanced/assets';

const assets = new AssetManager();
assets.events.on('progress', (p) => console.log(`${(p.ratio * 100).toFixed(0)}%`));

await assets.loadAll([
  { id: 'hero',  url: '/models/hero.glb',  kind: 'gltf'    },
  { id: 'brick', url: '/textures/brick.png', kind: 'texture' },
  { id: 'theme', url: '/audio/theme.ogg',    kind: 'audio'   },
]);
```

## Scenes

```ts
const scene = engine.scenes.create('level-1');
scene.onEnter = () => { /* spawn entities */ };
scene.onExit  = () => { /* cleanup */ };

await engine.scenes.activate('level-1');
```

## Tear down

```ts
engine.stop();
engine.destroy();
```

## Project conventions

- Strict TypeScript, no `any` in user code.
- Always `await engine.use(plugin)` — plugins may load asynchronously.
- Prefer `Priority` enum values over hand-rolled numbers.
- Keep render and physics work in the right phase (`update` vs `fixedUpdate`).
- Listen via `engine.events.on(...)`; never reach into private engine state.
