import { TextureLoader, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { EventEmitter } from '../core/EventEmitter.js';

export type AssetKind = 'texture' | 'gltf' | 'audio' | 'json' | 'text' | 'binary';

export interface AssetDescriptor {
  /** Stable id used for retrieval. */
  id: string;
  /** Resource URL. */
  url: string;
  kind: AssetKind;
}

export interface AssetProgress {
  loaded: number;
  total: number;
  ratio: number;
  current?: AssetDescriptor;
}

export interface AssetEventMap extends Record<string, unknown[]> {
  progress: [progress: AssetProgress];
  error: [descriptor: AssetDescriptor, error: unknown];
  loaded: [descriptor: AssetDescriptor, asset: unknown];
  complete: [];
}

/**
 * Generic asset manager. Loads textures, glTF, audio (as ArrayBuffer for the
 * AudioManager to decode), JSON, text, and binary blobs. Each asset is keyed
 * by a stable id and cached.
 *
 * Consumers can either:
 *   - call {@link AssetManager.load} per-asset and `await` the result, or
 *   - call {@link AssetManager.loadAll} with a manifest for batch progress.
 */
export class AssetManager {
  readonly events = new EventEmitter<AssetEventMap>();

  private readonly cache = new Map<string, unknown>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly textureLoader = new TextureLoader();
  private readonly gltfLoader = new GLTFLoader();

  has(id: string): boolean {
    return this.cache.has(id);
  }

  get<T = unknown>(id: string): T | undefined {
    return this.cache.get(id) as T | undefined;
  }

  /** Load (or return cached) a single asset. */
  async load<T = unknown>(descriptor: AssetDescriptor): Promise<T> {
    const cached = this.cache.get(descriptor.id);
    if (cached !== undefined) return cached as T;
    const inFlight = this.inflight.get(descriptor.id);
    if (inFlight) return inFlight as Promise<T>;

    const promise = this.fetchByKind(descriptor)
      .then((asset) => {
        this.cache.set(descriptor.id, asset);
        this.inflight.delete(descriptor.id);
        this.events.emit('loaded', descriptor, asset);
        return asset;
      })
      .catch((err) => {
        this.inflight.delete(descriptor.id);
        this.events.emit('error', descriptor, err);
        throw err;
      });

    this.inflight.set(descriptor.id, promise);
    return promise as Promise<T>;
  }

  /** Load every asset in a manifest, emitting aggregate `progress` events. */
  async loadAll(descriptors: readonly AssetDescriptor[]): Promise<Map<string, unknown>> {
    const total = descriptors.length;
    let loaded = 0;
    const results = new Map<string, unknown>();

    const update = (current?: AssetDescriptor) => {
      this.events.emit('progress', {
        loaded,
        total,
        ratio: total === 0 ? 1 : loaded / total,
        current,
      });
    };
    update();

    await Promise.all(
      descriptors.map(async (descriptor) => {
        try {
          const asset = await this.load(descriptor);
          results.set(descriptor.id, asset);
        } finally {
          loaded += 1;
          update(descriptor);
        }
      }),
    );

    this.events.emit('complete');
    return results;
  }

  /** Drop the cache and dispose any GPU resources we own. */
  clear(): void {
    for (const value of this.cache.values()) {
      const tex = value as { dispose?: () => void };
      tex.dispose?.();
    }
    this.cache.clear();
    this.inflight.clear();
  }

  private async fetchByKind(descriptor: AssetDescriptor): Promise<unknown> {
    switch (descriptor.kind) {
      case 'texture':
        return this.loadTexture(descriptor.url);
      case 'gltf':
        return this.loadGltf(descriptor.url);
      case 'audio':
      case 'binary': {
        const res = await fetch(descriptor.url);
        if (!res.ok) throw new Error(`fetch ${descriptor.url}: ${res.status}`);
        return res.arrayBuffer();
      }
      case 'json': {
        const res = await fetch(descriptor.url);
        if (!res.ok) throw new Error(`fetch ${descriptor.url}: ${res.status}`);
        return res.json();
      }
      case 'text': {
        const res = await fetch(descriptor.url);
        if (!res.ok) throw new Error(`fetch ${descriptor.url}: ${res.status}`);
        return res.text();
      }
      default:
        throw new Error(`Unknown asset kind: ${(descriptor as { kind: string }).kind}`);
    }
  }

  private loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  private loadGltf(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }
}
