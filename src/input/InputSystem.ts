import { Priority, type System } from '../core/System.js';

import type { InputManager } from './InputManager.js';

/** Pumps the {@link InputManager} once per frame, before logic / physics. */
export class InputSystem implements System {
  readonly name = 'InputSystem';
  readonly priority = Priority.Input;

  constructor(private readonly input: InputManager) {}

  update(): void {
    this.input.update();
  }

  destroy(): void {
    this.input.destroy();
  }
}
