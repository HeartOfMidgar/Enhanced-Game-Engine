import { Priority, type System } from '../core/System.js';

import type { Renderer } from './Renderer.js';

/**
 * A trivial render system that simply tells the {@link Renderer} to draw the
 * Three.js scene each frame. Game-specific systems are responsible for keeping
 * the Three.js scene graph in sync with the ECS world (typically by mirroring
 * a `Transform` component into a `Mesh`'s position/rotation).
 */
export class RenderSystem implements System {
  readonly name = 'RenderSystem';
  readonly priority = Priority.Render;

  constructor(private readonly renderer: Renderer) {}

  update(): void {
    this.renderer.render();
  }

  destroy(): void {
    this.renderer.dispose();
  }
}
