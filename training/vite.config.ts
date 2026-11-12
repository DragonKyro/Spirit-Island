// Bundles the headless training entry points into plain Node ESM under
// training/dist/, so the Python side can run them with `node` alone (no TS loader).

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('..'),
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: true,
    target: 'node20',
    outDir: here('./dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: { 'spirit-env': here('./spirit/env-server.ts') },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
});
