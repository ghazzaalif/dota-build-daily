/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file with the data embedded
// (used for the shareable preview). The normal build is the static SPA that
// fetches /data/*.json and /puzzles/{date}.json at runtime (PRD §10).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const embedded = fileURLToPath(new URL(`./src/data/embedded-${single ? 'single' : 'none'}.ts`, import.meta.url));
  return {
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    resolve: { alias: { 'virtual:embedded-data': embedded } },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2020',
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
  };
});
