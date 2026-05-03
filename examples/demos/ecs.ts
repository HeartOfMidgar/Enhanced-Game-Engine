import { Engine } from '@engine/core/Engine.js';
import type { System } from '@engine/core/System.js';
import { defineQuery } from '@engine/core/World.js';
import { Transform } from '@engine/render/components.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
} from 'three';

import { makeOverlay } from './overlay.js';
import { attachOrbit, attachStatsHud } from './scene-hud.js';

import { type Demo } from './index.js';

export const ecs: Demo = {
  id: 'ecs',
  name: 'ECS basics',
  description:
    'Spawn 200 entities into the bitecs world, query them by Transform, mirror to Three.js meshes.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x0d1117 });
    renderer.attach(host);
    renderer.camera.position.set(0, 4, 12);
    renderer.scene.add(new AmbientLight(0xffffff, 0.5));
    const sun = new DirectionalLight(0xffffff, 1.0);
    sun.position.set(6, 10, 4);
    renderer.scene.add(sun);

    const engine = new Engine();
    engine.world.add(engine.world.create(), Transform); // ensure component is registered

    const meshes = new Map<number, Mesh>();
    const geometry = new BoxGeometry(0.4, 0.4, 0.4);

    const COUNT = 200;
    for (let i = 0; i < COUNT; i += 1) {
      const eid = engine.world.create();
      engine.world.add(eid, Transform);
      Transform.x[eid] = (Math.random() - 0.5) * 16;
      Transform.y[eid] = (Math.random() - 0.5) * 8;
      Transform.z[eid] = (Math.random() - 0.5) * 8;

      const mat = new MeshStandardMaterial({
        color: new MeshStandardMaterial().color.setHSL(Math.random(), 0.5, 0.55),
        roughness: 0.5,
      });
      const mesh = new Mesh(geometry, mat);
      meshes.set(eid, mesh);
      renderer.scene.add(mesh);
    }

    const transformQuery = defineQuery([Transform]);

    engine.systems.register<System>({
      name: 'BounceSystem',
      update(dt) {
        const eids = transformQuery(engine.world.raw);
        for (const eid of eids) {
          Transform.y[eid] = (Transform.y[eid] ?? 0) + Math.sin((eid + engine.time.elapsed * 2)) * dt * 0.6;
        }
      },
    });
    const orbit = attachOrbit(renderer, { minDistance: 4, maxDistance: 50 });

    engine.systems.register<System>({
      name: 'SyncMeshes',
      priority: 900,
      update() {
        const eids = transformQuery(engine.world.raw);
        for (const eid of eids) {
          const mesh = meshes.get(eid);
          if (!mesh) continue;
          mesh.position.set(Transform.x[eid] ?? 0, Transform.y[eid] ?? 0, Transform.z[eid] ?? 0);
        }
        orbit.controls.update();
      },
    });
    engine.systems.register(new RenderSystem(renderer));
    engine.start();

    const removeHud = attachStatsHud(host, engine, {
      label: () => `${COUNT} entities`,
    });
    const removeOverlay = makeOverlay(
      host,
      `<b>ECS basics.</b> ${COUNT} entities, one Transform component, two systems (BounceSystem + SyncMeshes), and the standard RenderSystem. Drag to orbit.`,
    );

    return () => {
      removeOverlay();
      removeHud();
      orbit.dispose();
      engine.destroy();
      meshes.clear();
      host.innerHTML = '';
    };
  },
};
