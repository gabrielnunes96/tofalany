import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@tofalando/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  test: { name: 'server', include: ['test/**/*.test.ts', 'src/**/*.test.ts'] },
});
