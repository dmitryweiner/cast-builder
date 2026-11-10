import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { serviceWorkerPlugin } from './src/sw-plugin.ts';

/** The package name is the app's id: the storage key and the service worker's cache prefix. */
function appId(): string {
  const pkg: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
  if (typeof pkg === 'object' && pkg !== null && 'name' in pkg && typeof pkg.name === 'string') return pkg.name;
  throw new Error('package.json has no name');
}

const APP_ID = appId();

export default defineConfig({
  // Relative base lets the build work both on GitHub Pages (/<repo>/) and from any static folder.
  base: './',
  define: { __APP_ID__: JSON.stringify(APP_ID) },
  plugins: [serviceWorkerPlugin({ appId: APP_ID, publicDir: resolve(import.meta.dirname, 'public') })],
  // Three.js is most of the main chunk, and it changes twice a year while our
  // code changes with every deploy: a chunk of its own keeps it in the cache.
  build: {
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } } },
    // above the vendor chunk: we know Three weighs half a megabyte, but our own code doing so would be news
    chunkSizeWarningLimit: 600,
  },
  // manifold-3d's glue finds its .wasm via import.meta.url: pre-bundling
  // breaks the relative path, and an iife worker has no import.meta at all.
  // maker-kit is TypeScript sources, which the pre-bundler's scan reads as
  // JavaScript: Vite serves them as the app's own files instead.
  optimizeDeps: { exclude: ['manifold-3d', 'maker-kit'] },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // the CSG tests build real molds: seconds each
    testTimeout: 60000,
    // Node does not strip the types of files in node_modules: the kit's
    // TypeScript sources are transformed as the app's own.
    server: { deps: { inline: ['maker-kit'] } },
  },
});
