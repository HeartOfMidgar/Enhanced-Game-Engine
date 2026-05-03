import { describe, expect, it } from 'vitest';

import { ActionMap, type InputSnapshot } from './ActionMap.js';

function snapshot(partial: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    keys: partial.keys ?? new Set(),
    mouseButtons: partial.mouseButtons ?? new Set(),
    gamepadButtons: partial.gamepadButtons ?? new Map(),
    gamepadAxes: partial.gamepadAxes ?? new Map(),
  };
}

describe('ActionMap', () => {
  it('keyboard: pressed/held/released transitions are correct', () => {
    const map = new ActionMap({ jump: ['Key:Space'] });
    map.update(snapshot());
    expect(map.held('jump')).toBe(false);

    map.update(snapshot({ keys: new Set(['Space']) }));
    expect(map.pressed('jump')).toBe(true);
    expect(map.held('jump')).toBe(true);
    expect(map.released('jump')).toBe(false);

    map.update(snapshot({ keys: new Set(['Space']) }));
    expect(map.pressed('jump')).toBe(false);
    expect(map.held('jump')).toBe(true);

    map.update(snapshot());
    expect(map.released('jump')).toBe(true);
    expect(map.held('jump')).toBe(false);
  });

  it('mouse button bindings work', () => {
    const map = new ActionMap({ fire: ['Mouse:0'] });
    map.update(snapshot({ mouseButtons: new Set([0]) }));
    expect(map.held('fire')).toBe(true);
  });

  it('gamepad button + axis bindings', () => {
    const map = new ActionMap({
      moveRight: ['Axis:0:0:+'],
      action: ['Pad:0:0'],
    });
    const axes = new Map([[0, new Float32Array([0.8, 0])]]);
    const buttons = new Map([[0, new Set([0])]]);
    map.update(snapshot({ gamepadAxes: axes, gamepadButtons: buttons }));
    expect(map.held('moveRight')).toBe(true);
    expect(map.value('moveRight')).toBeCloseTo(0.8, 3);
    expect(map.held('action')).toBe(true);
  });

  it('axis below threshold is not held', () => {
    const map = new ActionMap({ moveRight: { bindings: ['Axis:0:0:+'], threshold: 0.5 } });
    const axes = new Map([[0, new Float32Array([0.2, 0])]]);
    map.update(snapshot({ gamepadAxes: axes }));
    expect(map.held('moveRight')).toBe(false);
  });

  it('returns false for unknown actions', () => {
    const map = new ActionMap({ jump: ['Key:Space'] });
    expect(map.held('nope' as 'jump')).toBe(false);
    expect(map.value('nope' as 'jump')).toBe(0);
  });
});
