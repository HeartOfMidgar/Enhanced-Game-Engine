export interface Demo {
  id: string;
  name: string;
  description: string;
  badge?: { label: string; kind?: 'optional' };
  /** Mounts the demo into `host`. Returns a cleanup function. */
  run(host: HTMLElement): Promise<() => void> | (() => void);
}

import { audio } from './audio.js';
import { basicScene } from './basic-scene.js';
import { devtools } from './devtools.js';
import { ecs } from './ecs.js';
import { input } from './input.js';
import { networking } from './networking.js';
import { particles } from './particles.js';
import { physics } from './physics.js';
import { solanaAuth } from './solana-auth.js';
import { solanaStaking } from './solana-staking.js';

export const demos: readonly Demo[] = [
  basicScene,
  ecs,
  input,
  audio,
  physics,
  particles,
  networking,
  solanaAuth,
  solanaStaking,
  devtools,
];
