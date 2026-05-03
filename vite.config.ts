import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'examples'),
  publicDir: resolve(__dirname, 'examples/public'),
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, 'dist/examples'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: [
      '@quarryprotocol/quarry-sdk',
      '@saberhq/solana-contrib',
      '@saberhq/token-utils',
      'ioredis',
    ],
  },
});
