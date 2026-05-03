import { describe, expect, it, vi } from 'vitest';

import { EventEmitter } from './EventEmitter.js';

interface TestEvents extends Record<string, unknown[]> {
  ready: [];
  tick: [n: number];
  collision: [a: number, b: number];
}

describe('EventEmitter', () => {
  it('on/emit/off basic flow', () => {
    const bus = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    bus.on('tick', fn);
    bus.emit('tick', 1);
    bus.emit('tick', 2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    bus.off('tick', fn);
    bus.emit('tick', 3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('once fires only once', () => {
    const bus = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    bus.once('ready', fn);
    bus.emit('ready');
    bus.emit('ready');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('emit is safe to mutate handler list during dispatch', () => {
    const bus = new EventEmitter<TestEvents>();
    const fn1 = vi.fn(() => bus.off('tick', fn2));
    const fn2 = vi.fn();
    bus.on('tick', fn1);
    bus.on('tick', fn2);
    bus.emit('tick', 1);
    expect(fn1).toHaveBeenCalledTimes(1);
    // fn2 is still in the snapshot from before fn1 mutated
    expect(fn2).toHaveBeenCalledTimes(1);
    bus.emit('tick', 2);
    // fn2 was removed; only fn1 fires now
    expect(fn1).toHaveBeenCalledTimes(2);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('handler errors are isolated', () => {
    const bus = new EventEmitter<TestEvents>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on('tick', bad);
    bus.on('tick', good);
    bus.emit('tick', 1);
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('passes multi-arg events', () => {
    const bus = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    bus.on('collision', fn);
    bus.emit('collision', 5, 7);
    expect(fn).toHaveBeenCalledWith(5, 7);
  });

  it('reports listener count and event names', () => {
    const bus = new EventEmitter<TestEvents>();
    bus.on('tick', () => {});
    bus.on('tick', () => {});
    bus.once('ready', () => {});
    expect(bus.listenerCount('tick')).toBe(2);
    expect(bus.listenerCount('ready')).toBe(1);
    expect(bus.eventNames()).toEqual(expect.arrayContaining(['tick', 'ready']));
  });
});
