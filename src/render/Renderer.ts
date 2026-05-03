import {
  PerspectiveCamera,
  Scene as ThreeScene,
  WebGLRenderer,
  type Camera,
  type WebGLRendererParameters,
} from 'three';

export interface RendererOptions {
  /** Canvas element to render into. Created if omitted. */
  canvas?: HTMLCanvasElement;
  /** Resize automatically when the window/container changes. */
  autoResize?: boolean;
  /** When `true`, devicePixelRatio is clamped to 2 for perf parity. */
  clampPixelRatio?: boolean;
  /** Initial clear color (hex). Default: 0x000000. */
  clearColor?: number;
  /** Initial alpha for the clear color. */
  clearAlpha?: number;
  /** Extra Three.js renderer parameters. */
  three?: Partial<WebGLRendererParameters>;
}

/**
 * Three.js renderer wrapper. Owns the WebGLRenderer, the active Scene, and
 * the active Camera. Render systems read entity transforms / meshes from the
 * world and translate them into Three.js primitives placed inside `scene`.
 */
export class Renderer {
  readonly three: WebGLRenderer;
  readonly scene = new ThreeScene();

  /** Current main camera; defaults to a 75deg perspective camera. */
  camera: Camera;

  private readonly autoResize: boolean;
  private readonly resizeListener?: () => void;

  constructor(options: RendererOptions = {}) {
    const canvas =
      options.canvas ??
      (typeof document !== 'undefined' ? document.createElement('canvas') : undefined);

    this.three = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      ...options.three,
    });

    if (options.clampPixelRatio !== false && typeof window !== 'undefined') {
      this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    this.three.setClearColor(options.clearColor ?? 0x000000, options.clearAlpha ?? 1);

    this.camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    this.camera.position.set(0, 1.5, 5);

    this.autoResize = options.autoResize ?? true;
    if (this.autoResize && typeof window !== 'undefined') {
      this.resizeListener = () => this.resize(window.innerWidth, window.innerHeight);
      window.addEventListener('resize', this.resizeListener);
      this.resizeListener();
    }
  }

  /** Replace the active camera. */
  setCamera(camera: Camera): void {
    this.camera = camera;
    if (this.autoResize && typeof window !== 'undefined') {
      this.resize(window.innerWidth, window.innerHeight);
    }
  }

  /** Resize the canvas + camera projection. */
  resize(width: number, height: number): void {
    this.three.setSize(width, height, false);
    if ('aspect' in this.camera) {
      (this.camera as PerspectiveCamera).aspect = width / Math.max(1, height);
      (this.camera as PerspectiveCamera).updateProjectionMatrix();
    }
  }

  /** Render the current scene from the current camera. */
  render(): void {
    this.three.render(this.scene, this.camera);
  }

  /** Detach listeners and free GPU resources. */
  dispose(): void {
    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
    }
    this.three.dispose();
  }

  /** Append the renderer's canvas to a host element. Convenience helper. */
  attach(host: HTMLElement): void {
    host.appendChild(this.three.domElement);
  }
}
