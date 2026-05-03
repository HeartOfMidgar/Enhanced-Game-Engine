import { describe, expect, it } from 'vitest';

import { Time } from './Time.js';

describe('Time', () => {
  it('clamps frame time at maxFrameTime', () => {
    const t = new Time();
    t.maxFrameTime = 0.05;
    t.update(10); // huge stall
    expect(t.dt).toBe(0.05);
    expect(t.elapsed).toBe(0.05);
  });

  it('accumulates elapsed and frameCount', () => {
    const t = new Time();
    t.update(0.016);
    t.update(0.016);
    t.update(0.016);
    expect(t.frameCount).toBe(3);
    expect(t.elapsed).toBeCloseTo(0.048, 5);
  });

  it('updates fps after fpsUpdateRate', () => {
    const t = new Time();
    t.fpsUpdateRate = 0.5;
    for (let i = 0; i < 30; i += 1) t.update(0.02); // 0.6s of frames @ ~50fps
    expect(t.fps).toBeGreaterThan(0);
  });

  it('reset clears state', () => {
    const t = new Time();
    t.update(0.016);
    t.reset();
    expect(t.dt).toBe(0);
    expect(t.elapsed).toBe(0);
    expect(t.fps).toBe(0);
    expect(t.frameCount).toBe(0);
  });
});
