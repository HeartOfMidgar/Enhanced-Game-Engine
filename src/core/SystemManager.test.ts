import { describe, expect, it, vi } from 'vitest';

import { Engine } from './Engine.js';
import { Priority, SystemDependencyError, type System } from './System.js';

describe('SystemManager', () => {
  it('registers, gets, and unregisters systems', () => {
    const engine = new Engine();
    const sys: System = { name: 'Test', update: vi.fn() };
    engine.systems.register(sys);
    expect(engine.systems.has('Test')).toBe(true);
    expect(engine.systems.get<System>('Test')).toBe(sys);
    expect(engine.systems.unregister('Test')).toBe(true);
    expect(engine.systems.has('Test')).toBe(false);
    engine.destroy();
  });

  it('throws SystemDependencyError when dep is missing', () => {
    const engine = new Engine();
    expect(() =>
      engine.systems.register<System>({
        name: 'NeedsDep',
        dependencies: ['Missing'],
        update() {},
      }),
    ).toThrow(SystemDependencyError);
    engine.destroy();
  });

  it('disabled systems do not run their update / fixedUpdate', () => {
    const engine = new Engine();
    const update = vi.fn();
    const fixedUpdate = vi.fn();
    engine.systems.register<System>({ name: 'X', update, fixedUpdate });
    engine.init();
    engine.systems.setEnabled('X', false);
    engine.systems.update(0.016, 0);
    engine.systems.fixedUpdate(0.016);
    expect(update).not.toHaveBeenCalled();
    expect(fixedUpdate).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('continues after a system throws', () => {
    const engine = new Engine();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    engine.systems.register<System>({
      name: 'Bad',
      priority: Priority.Logic,
      update() {
        throw new Error('boom');
      },
    });
    engine.systems.register<System>({
      name: 'Good',
      priority: Priority.Logic + 10,
      update: second,
    });
    engine.init();
    engine.systems.update(0.016, 0);
    expect(second).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    engine.destroy();
  });

  it('telemetry surfaces priority/enabled/timing', () => {
    const engine = new Engine();
    engine.systems.register<System>({ name: 'A', priority: 100, update() {} });
    engine.init();
    engine.systems.update(0.016, 0);
    const t = engine.systems.telemetry();
    expect(t.A).toBeDefined();
    expect(t.A?.priority).toBe(100);
    expect(t.A?.enabled).toBe(true);
    expect(t.A?.updateMs).toBeGreaterThanOrEqual(0);
    engine.destroy();
  });
});
