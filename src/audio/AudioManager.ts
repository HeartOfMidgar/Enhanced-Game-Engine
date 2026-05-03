export interface AudioManagerOptions {
  /** Provide an existing AudioContext (e.g., to share with WebMIDI / Tone.js). */
  context?: AudioContext;
  /** Initial bus volumes (0..1). */
  volumes?: { master?: number; music?: number; sfx?: number };
}

export interface PlayOptions {
  /** Bus to route through. Default: 'sfx'. */
  bus?: 'music' | 'sfx';
  /** 0..1 volume (multiplied with bus volume). */
  volume?: number;
  /** Loop the buffer. */
  loop?: boolean;
  /** Detune in cents. */
  detune?: number;
  /** Playback rate. */
  rate?: number;
}

export interface PlayHandle {
  /** Stop playback as soon as possible. */
  stop(): void;
  /** Underlying source node (for advanced manipulation). */
  source: AudioBufferSourceNode;
}

/**
 * Lightweight WebAudio engine with three buses:
 *   - master (final output)
 *   - music  (music)
 *   - sfx    (sound effects)
 *
 * Buffers are loaded by URL via {@link AudioManager.load} and cached.
 */
export class AudioManager {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;

  private readonly buffers = new Map<string, AudioBuffer>();

  constructor(options: AudioManagerOptions = {}) {
    if (options.context) {
      this.context = options.context;
    } else {
      const Ctor =
        (typeof window !== 'undefined' &&
          ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext)) ||
        undefined;
      if (!Ctor)
        throw new Error('AudioManager: AudioContext is not available in this environment.');
      this.context = new Ctor();
    }

    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.master.gain.value = options.volumes?.master ?? 1;

    this.music = this.context.createGain();
    this.music.connect(this.master);
    this.music.gain.value = options.volumes?.music ?? 1;

    this.sfx = this.context.createGain();
    this.sfx.connect(this.master);
    this.sfx.gain.value = options.volumes?.sfx ?? 1;
  }

  /** Resume the underlying AudioContext (required after user gesture). */
  async resume(): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  /** Load and decode a buffer from a URL. Cached by URL. */
  async load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AudioManager.load: ${res.status} ${url}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await this.context.decodeAudioData(arrayBuffer);
    this.buffers.set(url, buffer);
    return buffer;
  }

  /** Pre-register a buffer under a key. */
  set(key: string, buffer: AudioBuffer): void {
    this.buffers.set(key, buffer);
  }

  /** Play a previously loaded buffer or buffer reference. */
  play(keyOrBuffer: string | AudioBuffer, options: PlayOptions = {}): PlayHandle {
    const buffer = typeof keyOrBuffer === 'string' ? this.buffers.get(keyOrBuffer) : keyOrBuffer;
    if (!buffer) {
      throw new Error(`AudioManager.play: no buffer registered for "${String(keyOrBuffer)}".`);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    if (options.detune !== undefined) source.detune.value = options.detune;
    if (options.rate !== undefined) source.playbackRate.value = options.rate;

    const gain = this.context.createGain();
    gain.gain.value = options.volume ?? 1;

    source.connect(gain);
    gain.connect(options.bus === 'music' ? this.music : this.sfx);

    source.start(0);

    return {
      source,
      stop: () => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
        source.disconnect();
        gain.disconnect();
      },
    };
  }

  /** Set bus volume in [0..1]. */
  setVolume(bus: 'master' | 'music' | 'sfx', value: number): void {
    const node = bus === 'master' ? this.master : bus === 'music' ? this.music : this.sfx;
    node.gain.value = Math.max(0, Math.min(1, value));
  }

  destroy(): void {
    try {
      this.master.disconnect();
      this.music.disconnect();
      this.sfx.disconnect();
      void this.context.close();
    } catch {
      // best-effort
    }
    this.buffers.clear();
  }
}
