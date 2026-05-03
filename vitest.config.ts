import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * The engine spans several runtime targets (Node-only ECS/net/chain code and
 * browser-only render/input/audio code) so we drive Vitest as a **workspace**
 * with two projects:
 *
 * - `node`     — runs `src/(core|net|chain|storage|assets)/**` in Node.
 * - `browser`  — runs `src/(input|audio|render|devtools)/**` under jsdom.
 *
 * Coverage is intentionally scoped to the modules we unit-test in this phase
 * (`src/core`, `src/chain/solana/verifyWallet`, `src/chain/solana/staking`,
 * `src/net/protocol`, `src/net/rateLimit`, `src/assets/AssetManager`,
 * `src/input/ActionMap`). DOM-heavy subsystems (Renderer, AudioManager, the
 * full InputManager, DebugPanel) are exercised through the examples playground
 * rather than unit tests and are excluded so they don't drag the global
 * threshold below the plan's ~70% target on the tested modules.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/core/**/*.ts',
        'src/chain/solana/verifyWallet.ts',
        'src/chain/solana/staking/**/*.ts',
        'src/net/protocol.ts',
        'src/net/rateLimit.ts',
        'src/assets/AssetManager.ts',
        'src/input/ActionMap.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/core/**/*.test.ts',
            'src/net/**/*.test.ts',
            'src/chain/**/*.test.ts',
            'src/storage/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          environment: 'jsdom',
          include: [
            'src/assets/**/*.test.ts',
            'src/input/**/*.test.ts',
            'src/audio/**/*.test.ts',
            'src/render/**/*.test.ts',
            'src/devtools/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
