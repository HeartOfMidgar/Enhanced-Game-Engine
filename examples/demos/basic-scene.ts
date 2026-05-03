import { Engine } from '@engine/core/Engine.js';
import type { System } from '@engine/core/System.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusKnotGeometry,
} from 'three';

import { makeOverlay } from './overlay.js';
import { attachOrbit, attachStatsHud } from './scene-hud.js';

import { type Demo } from './index.js';

export const basicScene: Demo = {
  id: 'basic-scene',
  name: 'Basic scene',
  description:
    'Engine boot, three.js renderer, ambient + directional lighting, a small cluster of moving objects. Drag to orbit.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x0d1117 });
    renderer.attach(host);
    renderer.camera.position.set(4, 4, 9);

    renderer.scene.add(new AmbientLight(0xffffff, 0.45));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(4, 6, 2);
    renderer.scene.add(sun);

    const grid = new GridHelper(20, 20, 0x2c313c, 0x1d2129);
    grid.position.y = -1.2;
    renderer.scene.add(grid);

    const hero = new Mesh(
      new TorusKnotGeometry(0.7, 0.22, 128, 24),
      new MeshStandardMaterial({ color: 0x88c0d0, roughness: 0.35, metalness: 0.4 }),
    );
    renderer.scene.add(hero);

    const sat1 = new Mesh(
      new BoxGeometry(0.8, 0.8, 0.8),
      new MeshStandardMaterial({ color: 0xa3be8c, roughness: 0.4 }),
    );
    const sat2 = new Mesh(
      new BoxGeometry(0.6, 0.6, 0.6),
      new MeshStandardMaterial({ color: 0xebcb8b, roughness: 0.4 }),
    );
    const sat3 = new Mesh(
      new IcosahedronGeometry(0.5, 0),
      new MeshStandardMaterial({ color: 0xbf616a, roughness: 0.5, flatShading: true }),
    );
    renderer.scene.add(sat1, sat2, sat3);

    // Decorative ring of small cubes around the hero so the viewport never
    // looks empty regardless of orbit angle.
    const ring = new Group();
    const RING = 24;
    for (let i = 0; i < RING; i += 1) {
      const angle = (i / RING) * Math.PI * 2;
      const r = 3.5;
      const c = new Mesh(
        new BoxGeometry(0.15, 0.15, 0.15),
        new MeshStandardMaterial({
          color: new Color().setHSL(i / RING, 0.6, 0.55),
          roughness: 0.4,
        }),
      );
      c.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      ring.add(c);
    }
    renderer.scene.add(ring);

    const orbit = attachOrbit(renderer, { minDistance: 3, maxDistance: 30, target: [0, 0, 0] });

    const engine = new Engine();
    engine.systems.register(new RenderSystem(renderer));
    engine.systems.register<System>({
      name: 'Animate',
      update(dt) {
        const t = engine.time.elapsed;
        hero.rotation.y += dt * 0.6;
        hero.rotation.x += dt * 0.3;
        sat1.position.set(Math.cos(t * 0.9) * 2.2, 0.6 + Math.sin(t * 1.4) * 0.3, Math.sin(t * 0.9) * 2.2);
        sat2.position.set(Math.cos(-t * 0.7) * 2.6, -0.4 + Math.cos(t * 1.1) * 0.4, Math.sin(-t * 0.7) * 2.6);
        sat3.position.set(Math.cos(t * 1.3 + 1) * 1.6, Math.sin(t * 1.5) * 0.8, Math.sin(t * 1.3 + 1) * 1.6);
        sat1.rotation.y += dt * 1.4;
        sat2.rotation.x += dt * 1.1;
        sat3.rotation.y -= dt * 0.9;
        ring.rotation.y += dt * 0.15;
        orbit.controls.update();
      },
    });
    engine.start();

    const removeHud = attachStatsHud(host, engine, { label: () => 'basic-scene' });
    const removeOverlay = makeOverlay(
      host,
      `<b>Basic scene.</b> Engine + Three.js renderer + a single Animate system orchestrating a torus knot, three orbiting satellites, and a 24-cube ring. Drag to orbit, scroll to zoom. The HUD's live FPS confirms the loop is running.`,
    );

    return () => {
      removeOverlay();
      removeHud();
      orbit.dispose();
      engine.destroy();
      host.innerHTML = '';
    };
  },
};
