import { DependencyContainer } from './DependencyContainer.js';
import { EventEmitter } from './EventEmitter.js';
import type { Plugin } from './Plugin.js';
import { SceneManager } from './Scene.js';
import { ServiceTokens, type EngineEventMap } from './ServiceTokens.js';
import { type System } from './System.js';
import { SystemManager } from './SystemManager.js';
import { Time } from './Time.js';
import { TypeRegistry } from './TypeRegistry.js';
import { World } from './World.js';

export interface EngineOptions {
  /** Enable verbose console logging. */
  debug?: boolean;
  /** Fixed simulation step in seconds. Default: 1/60. */
  fixedTimeStep?: number;
  /** Hard cap on real frame dt to avoid spiral-of-death. Default: 0.25s. */
  maxFrameTime?: number;
  /** Custom container (e.g., from a parent app). One is created if omitted. */
  container?: DependencyContainer;
  /** Initial world capacity hint. */
  worldSize?: number;
  /**
   * Custom frame scheduler. Defaults to `requestAnimationFrame` in the browser
   * and `setImmediate` (or `setTimeout(0)`) on the server.
   */
  scheduler?: FrameScheduler;
}

/** A scheduler runs `cb` "soon", returning a token that {@link cancel} can stop. */
export interface FrameScheduler {
  schedule(cb: (now: number) => void): unknown;
  cancel(handle: unknown): void;
}

const browserScheduler: FrameScheduler = {
  schedule: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h as number),
};

const nodeScheduler: FrameScheduler = (() => {
  // ~60Hz target on the server; consumers running headless may swap this out.
  const interval = 1000 / 60;
  return {
    schedule(cb) {
      return setTimeout(() => cb(performance.now()), interval);
    },
    cancel(h) {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
  };
})();

const defaultScheduler: FrameScheduler =
  typeof requestAnimationFrame !== 'undefined' ? browserScheduler : nodeScheduler;

/**
 * The Engine is the root coordinator: it owns the World, the SystemManager,
 * the Plugin registry, an EventEmitter bus, the Time tracker, the DI container,
 * and the main game loop.
 *
 * Lifecycle:
 *
 *   const engine = new Engine();
 *   engine.systems.register(new MyRenderSystem());
 *   engine.use(new MyPlugin());
 *   engine.start();
 *   // later
 *   engine.stop();
 *   engine.destroy();
 */
export class Engine {
  readonly debug: boolean;
  readonly container: DependencyContainer;
  readonly events = new EventEmitter<EngineEventMap>();
  readonly time = new Time();
  readonly world: World;
  readonly systems: SystemManager;
  readonly scenes: SceneManager;
  readonly types = new TypeRegistry();

  /** Fixed simulation step in seconds. */
  fixedDt: number;

  /** Maximum real frame dt (clamps catastrophic frame stalls). */
  maxFrameTime: number;

  isRunning = false;
  isInitialized = false;

  private readonly plugins = new Map<string, Plugin>();
  private readonly scheduler: FrameScheduler;
  private accumulator = 0;
  private lastTime = 0;
  private frameHandle: unknown = undefined;
  private boundTick: (now: number) => void;

  constructor(options: EngineOptions = {}) {
    this.debug = options.debug ?? false;
    this.fixedDt = options.fixedTimeStep ?? 1 / 60;
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
    this.time.maxFrameTime = this.maxFrameTime;
    this.scheduler = options.scheduler ?? defaultScheduler;

    this.container = options.container ?? new DependencyContainer();
    this.world = new World(options.worldSize !== undefined ? { size: options.worldSize } : {});
    this.systems = new SystemManager(this);
    this.scenes = new SceneManager(this.world);

    this.container.registerInstance(ServiceTokens.ENGINE, this);
    this.container.registerInstance(ServiceTokens.WORLD, this.world);
    this.container.registerInstance(ServiceTokens.EVENTS, this.events);
    this.container.registerInstance(ServiceTokens.TIME, this.time);
    this.container.registerInstance(ServiceTokens.SYSTEMS, this.systems);

    this.boundTick = (now) => this.tick(now);

    if (this.debug) console.info('[Engine] initialized');
  }

  /** Register a plugin. May be async. The engine awaits init() if running. */
  use<P extends Plugin>(plugin: P, name?: string): P {
    const key = name ?? plugin.name ?? plugin.constructor.name ?? `plugin_${this.plugins.size}`;
    if (this.plugins.has(key)) {
      console.warn(`[Engine] Plugin "${key}" already registered; replacing.`);
      this.unuse(key);
    }
    this.plugins.set(key, plugin);
    try {
      const r = plugin.init?.(this);
      if (r instanceof Promise) {
        r.catch((err) => console.error(`[Engine] async init() of plugin "${key}" rejected:`, err));
      }
    } catch (err) {
      console.error(`[Engine] init() of plugin "${key}" threw:`, err);
    }
    if (this.debug) console.info(`[Engine] plugin "${key}" registered`);
    return plugin;
  }

  unuse(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    try {
      plugin.destroy?.();
    } catch (err) {
      console.error(`[Engine] destroy() of plugin "${name}" threw:`, err);
    }
    this.plugins.delete(name);
    return true;
  }

  getPlugin<P extends Plugin = Plugin>(name: string): P | undefined {
    return this.plugins.get(name) as P | undefined;
  }

  /** Initialize all systems. Idempotent. Called automatically by start(). */
  init(): void {
    if (this.isInitialized) return;
    this.systems.initializeAll();
    this.isInitialized = true;
    this.events.emit('engine:init', this);
  }

  /** Begin the main loop. */
  start(): void {
    if (this.isRunning) return;
    this.init();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.events.emit('engine:start', this);
    this.frameHandle = this.scheduler.schedule(this.boundTick);
    if (this.debug) console.info('[Engine] started');
  }

  /** Stop the main loop without destroying state. */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.frameHandle !== undefined) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = undefined;
    this.events.emit('engine:stop', this);
    if (this.debug) console.info('[Engine] stopped');
  }

  /**
   * Manually advance one frame. Useful for headless tests or when the consumer
   * runs their own scheduler. Pass the current high-resolution timestamp; the
   * engine computes dt internally.
   */
  tick(now: number = performance.now()): void {
    if (!this.isRunning) return;

    const realDt = Math.min((now - this.lastTime) / 1000, this.maxFrameTime);
    this.lastTime = now;
    this.accumulator += realDt;

    // Fixed-step simulation phase. Cap iterations per frame to avoid hangs.
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 8) {
      this.systems.fixedUpdate(this.fixedDt);
      this.events.emit('engine:fixed', this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }
    if (this.accumulator >= this.fixedDt) {
      // We're falling behind — drop accumulated time rather than spiral.
      this.accumulator = 0;
    }

    const alpha = this.accumulator / this.fixedDt;

    this.time.update(realDt);
    this.systems.update(realDt, alpha);
    this.events.emit('engine:tick', realDt, alpha);

    if (this.isRunning) {
      this.frameHandle = this.scheduler.schedule(this.boundTick);
    }
  }

  /** Tear everything down. After destroy(), this engine is unusable. */
  destroy(): void {
    this.stop();
    for (const [name, plugin] of [...this.plugins.entries()].reverse()) {
      try {
        plugin.destroy?.();
      } catch (err) {
        console.error(`[Engine] destroy() of plugin "${name}" threw:`, err);
      }
    }
    this.plugins.clear();
    this.systems.destroyAll();
    this.events.emit('engine:destroy', this);
    this.events.clear();
    this.container.clear();
    this.isInitialized = false;
    if (this.debug) console.info('[Engine] destroyed');
  }
}

export type { System };
