import { defineConfig } from '@playwright/test';

// Os apps abertos pelos testes herdam este ambiente: janela sem roubar o foco (TOFALANDO_E2E no processo principal).
process.env.TOFALANDO_E2E ??= '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  // Som dos testes numa saída falsa do PulseAudio/PipeWire: o áudio funciona, mas não sai na caixa de som.
  globalSetup: './e2e/silencio.ts',
});
