import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// O pacote shared vai junto no bundle (não é dependência de runtime do app empacotado).
const externalizeDeps = { exclude: ['@tofalando/shared'] };

export default defineConfig({
  main: { build: { externalizeDeps } },
  preload: { build: { externalizeDeps } },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    // Worklets saem como arquivo (data: URL embutida seria barrada pela CSP de script da T23).
    build: { assetsInlineLimit: (arquivo: string) => (arquivo.endsWith('.worklet.js') ? false : undefined) },
  },
});
