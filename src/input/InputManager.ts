import { ActionMap, type ActionMapDefinition, type InputSnapshot } from './ActionMap.js';

export interface InputManagerOptions {
  /** Element to attach pointer / keyboard listeners to. Defaults to `window`. */
  target?: HTMLElement | Window;
  /** Optional initial action map. */
  actions?: ActionMapDefinition;
  /** Disable gamepad polling. */
  disableGamepad?: boolean;
}

interface InternalListeners {
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  mousedown: (e: MouseEvent) => void;
  mouseup: (e: MouseEvent) => void;
  mousemove: (e: MouseEvent) => void;
  blur: () => void;
}

/**
 * Cross-device input manager: keyboard + mouse + gamepad. Wires browser event
 * listeners and exposes:
 *
 *   - low-level state via `keys`, `mouseButtons`, `mouse`, `gamepad*`
 *   - high-level action queries via {@link InputManager.actions}
 *
 * Call {@link InputManager.update} once per frame (typically from a System) to
 * poll gamepads and tick the {@link ActionMap}.
 */
export class InputManager {
  readonly actions: ActionMap;

  /** KeyboardEvent.code values currently pressed. */
  readonly keys = new Set<string>();
  /** Mouse button indices (event.button) currently pressed. */
  readonly mouseButtons = new Set<number>();
  /** Last known mouse position relative to the target element / window. */
  readonly mouse = { x: 0, y: 0, dx: 0, dy: 0 };

  /** Gamepad button indices currently pressed, by gamepad index. */
  readonly gamepadButtons = new Map<number, Set<number>>();
  /** Gamepad axis values, by gamepad index. */
  readonly gamepadAxes = new Map<number, Float32Array>();

  private readonly target: HTMLElement | Window;
  private readonly listeners: InternalListeners;
  private readonly disableGamepad: boolean;

  constructor(options: InputManagerOptions = {}) {
    this.target = options.target ?? (typeof window !== 'undefined' ? window : (undefined as never));
    this.disableGamepad = options.disableGamepad ?? false;
    this.actions = new ActionMap();
    if (options.actions) this.actions.load(options.actions);

    this.listeners = {
      keydown: (e) => this.keys.add(e.code),
      keyup: (e) => this.keys.delete(e.code),
      mousedown: (e) => this.mouseButtons.add(e.button),
      mouseup: (e) => this.mouseButtons.delete(e.button),
      mousemove: (e) => {
        const x = 'clientX' in e ? e.clientX : 0;
        const y = 'clientY' in e ? e.clientY : 0;
        this.mouse.dx = x - this.mouse.x;
        this.mouse.dy = y - this.mouse.y;
        this.mouse.x = x;
        this.mouse.y = y;
      },
      blur: () => {
        this.keys.clear();
        this.mouseButtons.clear();
      },
    };

    if (this.target) {
      this.target.addEventListener('keydown', this.listeners.keydown as EventListener);
      this.target.addEventListener('keyup', this.listeners.keyup as EventListener);
      this.target.addEventListener('mousedown', this.listeners.mousedown as EventListener);
      this.target.addEventListener('mouseup', this.listeners.mouseup as EventListener);
      this.target.addEventListener('mousemove', this.listeners.mousemove as EventListener);
      this.target.addEventListener('blur', this.listeners.blur as EventListener);
    }
  }

  /** Poll gamepads + update the action map. Call once per frame. */
  update(): void {
    if (!this.disableGamepad && typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i += 1) {
        const pad = pads[i];
        if (!pad) {
          this.gamepadButtons.delete(i);
          this.gamepadAxes.delete(i);
          continue;
        }
        let pressed = this.gamepadButtons.get(i);
        if (!pressed) {
          pressed = new Set();
          this.gamepadButtons.set(i, pressed);
        } else {
          pressed.clear();
        }
        for (let b = 0; b < pad.buttons.length; b += 1) {
          if (pad.buttons[b]?.pressed) pressed.add(b);
        }
        let axes = this.gamepadAxes.get(i);
        if (!axes || axes.length !== pad.axes.length) {
          axes = new Float32Array(pad.axes.length);
          this.gamepadAxes.set(i, axes);
        }
        for (let a = 0; a < pad.axes.length; a += 1) {
          axes[a] = pad.axes[a] ?? 0;
        }
      }
    }

    const snap: InputSnapshot = {
      keys: this.keys,
      mouseButtons: this.mouseButtons,
      gamepadButtons: this.gamepadButtons,
      gamepadAxes: this.gamepadAxes,
    };
    this.actions.update(snap);
    // Reset per-frame deltas.
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  destroy(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.listeners.keydown as EventListener);
    this.target.removeEventListener('keyup', this.listeners.keyup as EventListener);
    this.target.removeEventListener('mousedown', this.listeners.mousedown as EventListener);
    this.target.removeEventListener('mouseup', this.listeners.mouseup as EventListener);
    this.target.removeEventListener('mousemove', this.listeners.mousemove as EventListener);
    this.target.removeEventListener('blur', this.listeners.blur as EventListener);
    this.keys.clear();
    this.mouseButtons.clear();
    this.gamepadButtons.clear();
    this.gamepadAxes.clear();
  }
}
