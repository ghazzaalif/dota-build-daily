/// <reference types="vitest" />
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` builds one self-contained HTML file with the data embedded
// (used for the shareable preview). The normal build is the static SPA that
// fetches /data/*.json and /puzzles/{date}.json at runtime (PRD §10).
/**
 * Draft PRD §10: /draft must load on a direct visit or refresh. Copying the SPA shell to
 * draft/index.html and draft.html makes that work on any static host, with or without a
 * "/* → /index.html" rewrite rule configured on Render.
 */
function draftDeepLink(): Plugin {
  let outDir = 'dist';
  return {
    name: 'dbd-draft-deep-link',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const index = join(outDir, 'index.html');
      mkdirSync(join(outDir, 'draft'), { recursive: true });
      copyFileSync(index, join(outDir, 'draft', 'index.html'));
      copyFileSync(index, join(outDir, 'draft.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const embedded = fileURLToPath(new URL(`./src/data/embedded-${single ? 'single' : 'none'}.ts`, import.meta.url));
  return {
    plugins: [react(), ...(single ? [viteSingleFile()] : [draftDeepLink()])],
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
