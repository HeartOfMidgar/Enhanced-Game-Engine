import { describe, expect, it } from 'vitest';

import { TypeRegistry } from './TypeRegistry.js';

describe('TypeRegistry', () => {
  it('registers and retrieves component & system info', () => {
    const reg = new TypeRegistry();
    reg.registerComponent({ name: 'Transform', category: 'Spatial' });
    reg.registerSystem({ name: 'PhysicsSystem', dependencies: ['InputSystem'] });
    expect(reg.getComponent('Transform')?.category).toBe('Spatial');
    expect(reg.getSystem('PhysicsSystem')?.dependencies).toEqual(['InputSystem']);
    expect(reg.listComponents()).toHaveLength(1);
    expect(reg.listSystems()).toHaveLength(1);
  });

  it('clear empties everything', () => {
    const reg = new TypeRegistry();
    reg.registerComponent({ name: 'A' });
    reg.clear();
    expect(reg.listComponents()).toHaveLength(0);
  });
});
