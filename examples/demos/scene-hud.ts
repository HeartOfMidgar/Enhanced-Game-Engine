import type { Engine } from '@engine/core/Engine.js';
import type { Renderer } from '@engine/render/Renderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Helpers shared by the 3D demos:
 *
 * - {@link attachOrbit} — mouse drag to rotate, wheel to zoom, right-drag to pan
 *   on top of any {@link Renderer}.
 * - {@link attachStatsHud} — a tiny floating FPS / frame-time HUD wired to the
 *   engine's tick event, so it's obvious at a glance that the loop is running
 *   (and how many particles / entities are in flight).
 */

export interface OrbitOptions {
  target?: [number, number, number];
  enableDamping?: boolean;
  enablePan?: boolean;
  minDistance?: number;
  maxDistance?: number;
}

export function attachOrbit(
  renderer: Renderer,
  options: OrbitOptions = {},
): {
  controls: OrbitControls;
  dispose: () => void;
} {
  const controls = new OrbitControls(renderer.camera, renderer.three.domElement);
  controls.enableDamping = options.enableDamping ?? true;
  controls.dampingFactor = 0.08;
  controls.enablePan = options.enablePan ?? true;
  if (options.target) controls.target.set(...options.target);
  if (options.minDistance !== undefined) controls.minDistance = options.minDistance;
  if (options.maxDistance !== undefined) controls.maxDistance = options.maxDistance;
  controls.update();
  return {
    controls,
    dispose: () => controls.dispose(),
  };
}

export interface StatsHudOptions {
  /** Optional extra label refreshed each tick (e.g. entity count). */
  label?: () => string;
}

export function attachStatsHud(
  host: HTMLElement,
  engine: Engine,
  options: StatsHudOptions = {},
): () => void {
  const hud = document.createElement('div');
  hud.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:12px',
    'z-index:9',
    'background:rgba(20,22,28,0.78)',
    'border:1px solid #2c313c',
    'border-radius:6px',
    'padding:6px 10px',
    'font:12px/1.4 ui-monospace,monospace',
    'color:#d8dee9',
    'pointer-events:none',
    'min-width:120px',
  ].join(';');
  hud.textContent = 'fps —';
  host.appendChild(hud);

  let frames = 0;
  let acc = 0;
  let fps = 0;
  let frameMs = 0;

  const handler = (dt: number): void => {
    frames += 1;
    acc += dt;
    frameMs = dt * 1000;
    if (acc >= 0.5) {
      fps = frames / acc;
      frames = 0;
      acc = 0;
    }
    const extra = options.label ? ` · ${options.label()}` : '';
    hud.textContent = `fps ${fps.toFixed(0)} · ${frameMs.toFixed(1)}ms${extra}`;
  };

  engine.events.on('engine:tick', handler);

  return () => {
    engine.events.off('engine:tick', handler);
    hud.remove();
  };
}
