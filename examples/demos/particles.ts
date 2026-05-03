import { Engine } from '@engine/core/Engine.js';
import type { System } from '@engine/core/System.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from 'three';

import { makeOverlay } from './overlay.js';
import { attachOrbit, attachStatsHud } from './scene-hud.js';

import { type Demo } from './index.js';

export const particles: Demo = {
  id: 'particles',
  name: 'Particles',
  description:
    'A 6,000-point cloud with per-particle velocity, pre-warmed so it never starts as a clump. Drag to orbit, scroll to zoom.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x0a0d12 });
    renderer.attach(host);
    renderer.camera.position.set(0, 0, 18);

    const COUNT = 6_000;
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const c = new Color();

    /** Re-spawn particle `i` from the centre with a fresh outward velocity. */
    function reset(i: number): void {
      const base = i * 3;
      positions[base] = (Math.random() - 0.5) * 0.5;
      positions[base + 1] = (Math.random() - 0.5) * 0.5;
      positions[base + 2] = (Math.random() - 0.5) * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      velocities[base] = Math.cos(angle) * speed;
      velocities[base + 1] = (Math.random() - 0.5) * 4;
      velocities[base + 2] = Math.sin(angle) * speed;
      c.setHSL(Math.random(), 0.75, 0.6);
      colors[base] = c.r;
      colors[base + 1] = c.g;
      colors[base + 2] = c.b;
    }
    for (let i = 0; i < COUNT; i += 1) reset(i);

    /** Single-frame integration step shared by the pre-warm and the live system. */
    function step(dt: number): void {
      for (let i = 0; i < COUNT; i += 1) {
        const idx = i * 3;
        (positions[idx] as number) += (velocities[idx] as number) * dt;
        (positions[idx + 1] as number) += (velocities[idx + 1] as number) * dt;
        (positions[idx + 2] as number) += (velocities[idx + 2] as number) * dt;
        const x = positions[idx] ?? 0;
        const y = positions[idx + 1] ?? 0;
        const z = positions[idx + 2] ?? 0;
        if (Math.hypot(x, y, z) > 12) reset(i);
      }
    }

    // Pre-warm so the very first rendered frame already shows a populated
    // cloud — important when the host environment throttles requestAnimationFrame
    // (e.g. an inactive tab or an embedded iframe preview).
    for (let s = 0; s < 90; s += 1) step(1 / 60);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: 0.12,
      vertexColors: true,
      depthWrite: false,
      transparent: true,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    renderer.scene.add(points);

    const orbit = attachOrbit(renderer, { minDistance: 4, maxDistance: 60 });

    const engine = new Engine();
    engine.systems.register(new RenderSystem(renderer));
    engine.systems.register<System>({
      name: 'ParticleSim',
      update(dt) {
        step(dt);
        (geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
        orbit.controls.update();
      },
    });
    engine.start();

    const removeHud = attachStatsHud(host, engine, {
      label: () => `${COUNT.toLocaleString()} particles`,
    });
    const removeOverlay = makeOverlay(
      host,
      `<b>Particles.</b> ${COUNT.toLocaleString()} points with per-particle velocity, recycled when they exit a 12-unit sphere. The HUD's frame time tells you whether the loop is GPU- or CPU-bound. Pre-warmed for 90 frames before the first render so the cloud is already populated.`,
    );

    return () => {
      removeOverlay();
      removeHud();
      orbit.dispose();
      engine.destroy();
      geometry.dispose();
      material.dispose();
      host.innerHTML = '';
    };
  },
};
