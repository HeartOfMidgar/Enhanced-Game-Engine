import { describe, expect, it, vi } from 'vitest';

import { Engine } from './Engine.js';
import { Priority, type System } from './System.js';

describe('Engine', () => {
  it('initialises and runs systems in priority order', () => {
    const order: string[] = [];
    const engine = new Engine();
    engine.systems.register<System>({
      name: 'A',
      priority: Priority.Render,
      update() {
        order.push('A');
      },
    });
    engine.systems.register<System>({
      name: 'B',
      priority: Priority.Input,
      update() {
        order.push('B');
      },
    });
    engine.init();
    engine.systems.update(0.016, 0);
    expect(order).toEqual(['B', 'A']);
    engine.destroy();
  });

  it('drives fixedUpdate at the fixed timestep, with interpolation alpha', () => {
    const fixedSpy = vi.fn();
    const updateSpy = vi.fn();
    const engine = new Engine({ fixedTimeStep: 1 / 60 });
    engine.systems.register<System>({
      name: 'Sim',
      fixedUpdate: fixedSpy,
      update: updateSpy,
    });
    engine.start();
    // Force three fixed steps of accumulated time + a partial frame.
    engine.tick(performance.now() + 50); // 50ms ≈ 3 fixed steps
    expect(fixedSpy).toHaveBeenCalled();
    expect(fixedSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(updateSpy).toHaveBeenCalled();
    const [dt, alpha] = updateSpy.mock.calls[0] ?? [0, 0];
    expect(typeof dt).toBe('number');
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    engine.destroy();
  });

  it('emits lifecycle events', () => {
    const engine = new Engine();
    const onInit = vi.fn();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onDestroy = vi.fn();
    engine.events.on('engine:init', onInit);
    engine.events.on('engine:start', onStart);
    engine.events.on('engine:stop', onStop);
    engine.events.on('engine:destroy', onDestroy);
    engine.init();
    engine.start();
    engine.stop();
    engine.destroy();
    expect(onInit).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
    expect(onDestroy).toHaveBeenCalled();
  });

  it('plugins receive init() and destroy()', () => {
    const init = vi.fn();
    const destroy = vi.fn();
    const engine = new Engine();
    engine.use({ name: 'P', init, destroy });
    expect(init).toHaveBeenCalledWith(engine);
    engine.destroy();
    expect(destroy).toHaveBeenCalled();
  });
});
