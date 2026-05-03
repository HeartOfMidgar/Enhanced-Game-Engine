import { Engine } from '@engine/core/Engine.js';
import { Priority, type System } from '@engine/core/System.js';
import { DebugPanel } from '@engine/devtools/DebugPanel.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial } from 'three';

import { makeOverlay } from './overlay.js';
import { attachOrbit } from './scene-hud.js';

import { type Demo } from './index.js';

class HeavySystem implements System {
  readonly name = 'HeavySystem';
  readonly priority = Priority.Logic;
  private busy = 0;
  update(): void {
    // Eat ~3ms of CPU to make the perf graph interesting.
    const target = performance.now() + 3;
    while (performance.now() < target) this.busy += 1;
  }
}

class AnotherSystem implements System {
  readonly name = 'AnotherSystem';
  readonly dependencies = ['HeavySystem'];
  readonly priority = Priority.Logic + 1;
  update(): void {}
}

export const devtools: Demo = {
  id: 'devtools',
  name: 'Devtools — DebugPanel',
  description:
    'In-game debug panel with FPS, Systems, Entities, and Deps tabs. Press ` (Backquote) to toggle.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x14171c });
    renderer.attach(host);
    renderer.scene.add(new AmbientLight(0xffffff, 0.5));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(4, 6, 2);
    renderer.scene.add(sun);

    const cube = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xa3be8c, roughness: 0.5 }),
    );
    renderer.scene.add(cube);

    const orbit = attachOrbit(renderer, { minDistance: 2, maxDistance: 30 });

    const engine = new Engine({ debug: false });
    engine.types.registerSystem({ name: 'HeavySystem' });
    engine.types.registerSystem({ name: 'AnotherSystem', dependencies: ['HeavySystem'] });
    engine.systems.register(new HeavySystem());
    engine.systems.register(new AnotherSystem());
    engine.systems.register<System>({
      name: 'Spin',
      priority: Priority.Logic + 5,
      update(dt) {
        cube.rotation.y += dt * 0.6;
        cube.rotation.x += dt * 0.3;
        orbit.controls.update();
      },
    });
    engine.systems.register(new RenderSystem(renderer));
    engine.use(new DebugPanel());
    engine.start();

    const removeOverlay = makeOverlay(
      host,
      `<b>Devtools.</b> Press <code>~</code> to toggle the debug panel. Tabs: FPS graph, per-system perf, entity/component overview, system dependency graph (with cycle detection). Drag to orbit.`,
    );

    return () => {
      removeOverlay();
      orbit.dispose();
      engine.destroy();
      host.innerHTML = '';
    };
  },
};
