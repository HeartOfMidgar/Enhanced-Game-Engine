import { describe, expect, it } from 'vitest';

import { DependencyContainer, createToken } from './DependencyContainer.js';

interface Greeter {
  hello(): string;
}

const GREETER = createToken<Greeter>('Greeter');
const COUNTER = createToken<{ value: number }>('Counter');

describe('DependencyContainer', () => {
  it('singleton lifecycle returns the same instance', () => {
    const c = new DependencyContainer();
    c.register(COUNTER, () => ({ value: 1 }));
    const a = c.get(COUNTER);
    const b = c.get(COUNTER);
    expect(a).toBe(b);
  });

  it('transient lifecycle returns fresh instances', () => {
    const c = new DependencyContainer();
    c.register(COUNTER, () => ({ value: 1 }), { lifecycle: 'transient' });
    expect(c.get(COUNTER)).not.toBe(c.get(COUNTER));
  });

  it('registerInstance preloads', () => {
    const c = new DependencyContainer();
    const inst: Greeter = { hello: () => 'hi' };
    c.registerInstance(GREETER, inst);
    expect(c.get(GREETER)).toBe(inst);
  });

  it('getByTag returns all dependencies for a tag', () => {
    const TAG = 'plugin';
    const A = createToken<number>('A');
    const B = createToken<number>('B');
    const C = createToken<number>('C');
    const c = new DependencyContainer();
    c.register(A, () => 1, { tags: [TAG] });
    c.register(B, () => 2, { tags: [TAG] });
    c.register(C, () => 3);
    expect(c.getByTag<number>(TAG).sort()).toEqual([1, 2]);
  });

  it('child container delegates to parent', () => {
    const parent = new DependencyContainer();
    parent.registerInstance(GREETER, { hello: () => 'parent' });
    const child = parent.createChild();
    expect(child.get(GREETER).hello()).toBe('parent');
    child.register(GREETER, () => ({ hello: () => 'child' }));
    expect(child.get(GREETER).hello()).toBe('child');
    expect(parent.get(GREETER).hello()).toBe('parent');
  });

  it('throws when resolving an unregistered token', () => {
    const c = new DependencyContainer();
    expect(() => c.get(GREETER)).toThrow(/Greeter/);
  });

  it('tryGet returns undefined when missing', () => {
    const c = new DependencyContainer();
    expect(c.tryGet(GREETER)).toBeUndefined();
    c.registerInstance(GREETER, { hello: () => 'hi' });
    expect(c.tryGet(GREETER)).toBeDefined();
  });
});
