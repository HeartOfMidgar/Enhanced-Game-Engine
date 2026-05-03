import { createToken, type Token } from './DependencyContainer.js';
import type { EventEmitter } from './EventEmitter.js';
import type { Time } from './Time.js';

// Forward declarations to avoid circular imports.
export type EngineLike = unknown;
export type SystemManagerLike = unknown;
export type WorldLike = unknown;

export interface EngineEventMap extends Record<string, unknown[]> {
  'engine:init': [engine: EngineLike];
  'engine:start': [engine: EngineLike];
  'engine:stop': [engine: EngineLike];
  'engine:destroy': [engine: EngineLike];
  'engine:tick': [dt: number, alpha: number];
  'engine:fixed': [fixedDt: number];
  'system:registered': [name: string];
  'system:error': [name: string, error: unknown];
}

export const ServiceTokens = {
  ENGINE: createToken<EngineLike>('Engine'),
  SYSTEMS: createToken<SystemManagerLike>('SystemManager'),
  WORLD: createToken<WorldLike>('World'),
  EVENTS: createToken<EventEmitter<EngineEventMap>>('Events'),
  TIME: createToken<Time>('Time'),
} as const;

export type ServiceTokenMap = typeof ServiceTokens;
export type AnyServiceToken = ServiceTokenMap[keyof ServiceTokenMap] | Token<unknown>;
