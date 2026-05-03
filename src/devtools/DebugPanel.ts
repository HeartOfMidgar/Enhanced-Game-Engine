import type { Engine } from '../core/Engine.js';
import type { Plugin } from '../core/Plugin.js';

export interface DebugPanelOptions {
  /** Element to mount inside; defaults to `document.body`. */
  host?: HTMLElement;
  /** Initial visibility. */
  visible?: boolean;
  /** Initial tab. */
  tab?: 'fps' | 'systems' | 'entities' | 'deps';
  /** Toggle key (KeyboardEvent.code). Default: `Backquote`. */
  toggleKey?: string;
}

interface RingBuffer {
  data: Float32Array;
  index: number;
  full: boolean;
  capacity: number;
  push(v: number): void;
  read(): number[];
}

function createRing(capacity: number): RingBuffer {
  const data = new Float32Array(capacity);
  return {
    data,
    index: 0,
    full: false,
    capacity,
    push(v: number): void {
      data[this.index] = v;
      this.index = (this.index + 1) % capacity;
      if (this.index === 0) this.full = true;
    },
    read(): number[] {
      if (!this.full) return Array.from(data.slice(0, this.index));
      const head = data.slice(this.index);
      const tail = data.slice(0, this.index);
      return [...head, ...tail];
    },
  };
}

/**
 * Single dockable in-game debug panel that merges what used to be five
 * separate plugins:
 *
 *   - DebugPanelPlugin (host UI)
 *   - SystemPerformanceAnalyzer (per-system update / fixedUpdate timings)
 *   - ComponentUsageTracker (entity / world counts)
 *   - DependencyVisualizerPlugin (DI graph view)
 *   - DependencyAnalyzer (cycle detection)
 *
 * Use it as an engine plugin:
 *
 *   engine.use(new DebugPanel());
 *
 * Press the toggle key (default `~` / Backquote) to show/hide.
 */
export class DebugPanel implements Plugin {
  readonly name = 'DebugPanel';

  private engine?: Engine;
  private root?: HTMLDivElement;
  private body?: HTMLDivElement;
  private fpsCanvas?: HTMLCanvasElement;
  private fpsRing = createRing(120);
  private frameRing = createRing(120);
  private tab: NonNullable<DebugPanelOptions['tab']> = 'fps';
  private visible: boolean;
  private readonly toggleKey: string;
  private readonly host?: HTMLElement;
  private keyHandler?: (e: KeyboardEvent) => void;
  private tickHandler?: (dt: number, alpha: number) => void;

  constructor(options: DebugPanelOptions = {}) {
    if (options.host) this.host = options.host;
    this.visible = options.visible ?? true;
    if (options.tab) this.tab = options.tab;
    this.toggleKey = options.toggleKey ?? 'Backquote';
  }

  init(engine: Engine): void {
    if (typeof document === 'undefined') {
      console.warn('[DebugPanel] no document available; skipping mount.');
      return;
    }
    this.engine = engine;
    this.mount();
    this.tickHandler = (dt: number) => this.onTick(dt);
    engine.events.on('engine:tick', this.tickHandler);

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === this.toggleKey) {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  destroy(): void {
    if (this.tickHandler && this.engine) this.engine.events.off('engine:tick', this.tickHandler);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.root?.remove();
    this.root = undefined;
    this.engine = undefined;
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.root) this.root.style.display = this.visible ? 'block' : 'none';
  }

  setTab(tab: NonNullable<DebugPanelOptions['tab']>): void {
    this.tab = tab;
    this.render();
  }

  private mount(): void {
    const root = document.createElement('div');
    root.id = 'engine-debug-panel';
    root.style.cssText = `
      position: fixed; top: 8px; right: 8px; z-index: 99999;
      width: 320px; background: rgba(20, 22, 28, 0.92);
      color: #d8dee9; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      border: 1px solid #3b4252; border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,0.4);
      backdrop-filter: blur(6px); pointer-events: auto; user-select: none;
      display: ${this.visible ? 'block' : 'none'};
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;border-bottom:1px solid #3b4252;';
    for (const [id, label] of [
      ['fps', 'FPS'],
      ['systems', 'Systems'],
      ['entities', 'Entities'],
      ['deps', 'Deps'],
    ] as const) {
      const tab = document.createElement('button');
      tab.textContent = label;
      tab.style.cssText = `
        flex: 1; background: transparent; color: inherit; font: inherit;
        padding: 6px 8px; border: none; border-right: 1px solid #3b4252; cursor: pointer;
      `;
      tab.addEventListener('click', () => this.setTab(id));
      header.appendChild(tab);
    }
    root.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding: 8px 10px; max-height: 60vh; overflow: auto;';
    root.appendChild(body);

    (this.host ?? document.body).appendChild(root);
    this.root = root;
    this.body = body;
    this.render();
  }

  private onTick(dt: number): void {
    if (!this.engine) return;
    this.fpsRing.push(this.engine.time.fps);
    this.frameRing.push(dt * 1000);
    if (this.visible) this.render();
  }

  private render(): void {
    if (!this.body || !this.engine) return;
    const engine = this.engine;
    if (this.tab === 'fps') {
      this.body.innerHTML = '';
      const stats = document.createElement('div');
      stats.innerHTML = `
        <div>FPS: <b>${engine.time.fps.toFixed(1)}</b></div>
        <div>Frame: <b>${(engine.time.dt * 1000).toFixed(2)} ms</b></div>
        <div>Elapsed: ${engine.time.elapsed.toFixed(1)} s</div>
        <div>Frames: ${engine.time.frameCount}</div>
        <div>Fixed dt: ${(engine.fixedDt * 1000).toFixed(2)} ms</div>
      `;
      this.body.appendChild(stats);
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 60;
      canvas.style.cssText = 'margin-top: 6px; width: 100%; height: 60px; background: #1f2227;';
      this.body.appendChild(canvas);
      this.fpsCanvas = canvas;
      this.drawGraph();
    } else if (this.tab === 'systems') {
      const telem = engine.systems.telemetry();
      const rows = Object.entries(telem)
        .sort(([, a], [, b]) => a.priority - b.priority)
        .map(
          ([name, info]) =>
            `<tr><td>${escapeHtml(name)}</td><td>${info.priority}</td><td>${info.updateMs.toFixed(2)}</td><td>${info.fixedMs.toFixed(2)}</td><td>${info.enabled ? '✓' : '·'}</td></tr>`,
        )
        .join('');
      this.body.innerHTML = `
        <table style="width:100%; border-collapse: collapse;">
          <thead><tr style="text-align:left;color:#88c0d0;">
            <th>Name</th><th>Pri</th><th>Update ms</th><th>Fixed ms</th><th>On</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="5">no systems</td></tr>'}</tbody>
        </table>
      `;
    } else if (this.tab === 'entities') {
      // bitecs doesn't expose a count directly. We take a best-effort
      // estimate via the EID counter on the world (internal-but-stable).
      const world = engine.world.raw as unknown as { eidCounter?: number };
      const count =
        typeof world.eidCounter === 'number' ? world.eidCounter : '(unknown)';
      const components = engine.types.listComponents();
      const componentRows = components
        .map((c) => `<li>${escapeHtml(c.name)}${c.category ? ` <span style="color:#81a1c1">(${escapeHtml(c.category)})</span>` : ''}</li>`)
        .join('');
      this.body.innerHTML = `
        <div>Entities: <b>${count}</b></div>
        <div style="margin-top:6px;">Components (${components.length}):</div>
        <ul style="padding-left:18px;margin:4px 0;">${componentRows || '<li>(none registered)</li>'}</ul>
      `;
    } else if (this.tab === 'deps') {
      const sysList = engine.types.listSystems();
      const cycles = detectCycles(sysList);
      const sysRows = sysList
        .map((s) => {
          const deps = s.dependencies?.length
            ? `<span style="color:#a3be8c"> ← ${s.dependencies.map(escapeHtml).join(', ')}</span>`
            : '';
          return `<li>${escapeHtml(s.name)}${deps}</li>`;
        })
        .join('');
      this.body.innerHTML = `
        <div>Systems (${sysList.length}):</div>
        <ul style="padding-left:18px;margin:4px 0;">${sysRows || '<li>(none registered)</li>'}</ul>
        <div style="margin-top:8px;color:${cycles.length ? '#bf616a' : '#a3be8c'};">
          ${cycles.length ? `Cycles detected: ${cycles.length}` : 'No dependency cycles'}
        </div>
        ${cycles.map((c) => `<div style="color:#bf616a">↻ ${c.map(escapeHtml).join(' → ')}</div>`).join('')}
      `;
    }
  }

  private drawGraph(): void {
    if (!this.fpsCanvas) return;
    const ctx = this.fpsCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.fpsCanvas.width;
    const h = this.fpsCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1f2227';
    ctx.fillRect(0, 0, w, h);

    const fpsData = this.fpsRing.read();
    if (fpsData.length === 0) return;
    const max = 120;
    ctx.strokeStyle = '#a3be8c';
    ctx.beginPath();
    for (let i = 0; i < fpsData.length; i += 1) {
      const x = (i / fpsData.length) * w;
      const y = h - (Math.min((fpsData[i] ?? 0), max) / max) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#4c566a';
    for (const ref of [30, 60]) {
      const y = h - (ref / max) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function detectCycles(systems: ReadonlyArray<{ name: string; dependencies?: readonly string[] }>): string[][] {
  const cycles: string[][] = [];
  const graph = new Map<string, readonly string[]>();
  for (const s of systems) graph.set(s.name, s.dependencies ?? []);

  const VISITING = 1;
  const VISITED = 2;
  const state = new Map<string, number>();
  const path: string[] = [];

  const dfs = (node: string): void => {
    if (state.get(node) === VISITED) return;
    if (state.get(node) === VISITING) {
      const idx = path.indexOf(node);
      if (idx >= 0) cycles.push([...path.slice(idx), node]);
      return;
    }
    state.set(node, VISITING);
    path.push(node);
    for (const dep of graph.get(node) ?? []) dfs(dep);
    path.pop();
    state.set(node, VISITED);
  };

  for (const name of graph.keys()) dfs(name);
  return cycles;
}
