/**
 * Maps human-readable action names ("jump", "fire") to one or more device
 * inputs (key codes, mouse buttons, gamepad buttons, gamepad axes).
 *
 * Bindings are keyed by string identifiers:
 *
 *   Keyboard:  "Key:Space"       (uses KeyboardEvent.code)
 *   Mouse:     "Mouse:0"         (event.button)
 *   GamepadBtn:"Pad:0:0"         (gamepad index, button index)
 *   GamepadAxis:"Axis:0:0:+"     (gamepad index, axis index, direction +/-)
 */
export type Binding =
  | `Key:${string}`
  | `Mouse:${number}`
  | `Pad:${number}:${number}`
  | `Axis:${number}:${number}:${'+' | '-'}`;

export interface ActionDefinition {
  /** Bindings that can trigger this action. */
  bindings: readonly Binding[];
  /** Threshold for analog axes; default 0.25. */
  threshold?: number;
}

export type ActionMapDefinition = Record<string, readonly Binding[] | ActionDefinition>;

interface ResolvedAction {
  bindings: ReadonlyArray<Binding>;
  threshold: number;
  /** Pressed this frame (rising edge). */
  pressed: boolean;
  /** Held this frame (any binding active). */
  held: boolean;
  /** Released this frame (falling edge). */
  released: boolean;
  /** Latest analog value in [-1, 1] for the axis bindings; 0 if none active. */
  value: number;
}

export class ActionMap<TActions extends string = string> {
  private actions = new Map<string, ResolvedAction>();

  constructor(definition?: ActionMapDefinition) {
    if (definition) this.load(definition);
  }

  load(definition: ActionMapDefinition): void {
    for (const [name, raw] of Object.entries(definition)) {
      const def: ActionDefinition = isBindingArray(raw)
        ? { bindings: raw, threshold: 0.25 }
        : { bindings: raw.bindings, threshold: raw.threshold ?? 0.25 };
      this.actions.set(name, {
        bindings: def.bindings,
        threshold: def.threshold ?? 0.25,
        pressed: false,
        held: false,
        released: false,
        value: 0,
      });
    }
  }

  define(action: TActions, bindings: readonly Binding[], threshold = 0.25): void {
    this.actions.set(action, {
      bindings,
      threshold,
      pressed: false,
      held: false,
      released: false,
      value: 0,
    });
  }

  has(action: TActions): boolean {
    return this.actions.has(action);
  }

  /** True for one frame when the action transitions from up to down. */
  pressed(action: TActions): boolean {
    return this.actions.get(action)?.pressed ?? false;
  }

  /** True for the entire span the action is held. */
  held(action: TActions): boolean {
    return this.actions.get(action)?.held ?? false;
  }

  /** True for one frame when the action transitions from down to up. */
  released(action: TActions): boolean {
    return this.actions.get(action)?.released ?? false;
  }

  /** Analog value in [-1, 1] (axes only). 0 if action is binary. */
  value(action: TActions): number {
    return this.actions.get(action)?.value ?? 0;
  }

  /**
   * Recompute action state. Called once per frame by InputManager with the
   * raw device snapshots.
   */
  update(snapshot: InputSnapshot): void {
    for (const action of this.actions.values()) {
      const wasHeld = action.held;
      let held = false;
      let value = 0;

      for (const binding of action.bindings) {
        const v = evaluate(binding, snapshot, action.threshold);
        if (v.held) held = true;
        if (Math.abs(v.value) > Math.abs(value)) value = v.value;
      }

      action.pressed = held && !wasHeld;
      action.released = !held && wasHeld;
      action.held = held;
      action.value = value;
    }
  }
}

export interface InputSnapshot {
  keys: Set<string>;
  mouseButtons: Set<number>;
  gamepadButtons: Map<number, Set<number>>;
  gamepadAxes: Map<number, Float32Array>;
}

function isBindingArray(value: readonly Binding[] | ActionDefinition): value is readonly Binding[] {
  return Array.isArray(value);
}

function evaluate(
  binding: Binding,
  snap: InputSnapshot,
  threshold: number,
): { held: boolean; value: number } {
  if (binding.startsWith('Key:')) {
    const code = binding.slice('Key:'.length);
    const held = snap.keys.has(code);
    return { held, value: held ? 1 : 0 };
  }
  if (binding.startsWith('Mouse:')) {
    const btn = Number.parseInt(binding.slice('Mouse:'.length), 10);
    const held = snap.mouseButtons.has(btn);
    return { held, value: held ? 1 : 0 };
  }
  if (binding.startsWith('Pad:')) {
    const [_, padStr, btnStr] = binding.split(':');
    const pad = Number.parseInt(padStr ?? '', 10);
    const btn = Number.parseInt(btnStr ?? '', 10);
    const held = snap.gamepadButtons.get(pad)?.has(btn) ?? false;
    return { held, value: held ? 1 : 0 };
  }
  if (binding.startsWith('Axis:')) {
    const [_, padStr, axisStr, dir] = binding.split(':');
    const pad = Number.parseInt(padStr ?? '', 10);
    const axis = Number.parseInt(axisStr ?? '', 10);
    const axes = snap.gamepadAxes.get(pad);
    if (!axes) return { held: false, value: 0 };
    const raw = axes[axis] ?? 0;
    const v = dir === '-' ? -raw : raw;
    return { held: v > threshold, value: Math.max(0, Math.min(1, v)) };
  }
  return { held: false, value: 0 };
}
