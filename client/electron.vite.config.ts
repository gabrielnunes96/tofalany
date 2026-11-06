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
    plugins: [
      react(),
      {
        // CA-46 / técnica §6: CSP no app empacotado (no dev o Vite precisa de script inline e do servidor dele).
        // O host do servidor é conferido no processo principal (main/rede.ts); aqui fica o resto da política.
        name: 'csp-producao',
        apply: 'build',
        transformIndexHtml: (html: string) =>
          html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' data: blob: http: https: ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
          ),
      },
    ],
    // Worklets saem como arquivo (data: URL embutida seria barrada pela CSP de script da T23).
    build: { assetsInlineLimit: (arquivo: string) => (arquivo.endsWith('.worklet.js') ? false : undefined) },
  },
});
