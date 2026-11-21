import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/**
 * volume-da-voz (T-6): os níveis do nivelamento medidos no Chromium do app (OfflineAudioContext com os mesmos nós do
 * microfone). Prova o CA-2, o CA-3 e o CA-4, que os testes unitários não conseguem medir.
 */
const principal = join(__dirname, '../out/main/index.js');

type Medida = { entradaDb: number; saidaDb: number; picoDb: number };

let pasta: string;
let app: ElectronApplication;
let janela: Page;

test.beforeAll(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-nivel-'));
  app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: pasta, TOFALANDO_MIDIA_FALSA: '1' } });
  janela = await app.firstWindow();
  await janela.waitForFunction(() => typeof (window as unknown as { __medirNivel?: unknown }).__medirNivel === 'function');
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  rmSync(pasta, { recursive: true, force: true });
});

const medir = (nivelar: boolean, ganho: number, niveis: number[]) =>
  janela.evaluate(
    ([o, n]) =>
      (window as unknown as { __medirNivel: (o: { nivelar: boolean; ganho: number }, n: number[]) => Promise<Medida[]> }).__medirNivel(o, n),
    [{ nivelar, ganho }, niveis] as const,
  );

const em = (medidas: Medida[], entradaDb: number) => medidas.find((m) => m.entradaDb === entradaDb)!;

test('CA-2: nivelado, a diferença entre −40 e −6 dBFS cai de 34 dB para no máximo 11 dB; o pico não passa de −1 dBFS', async () => {
  const m = await medir(true, 1, [-40, -20, -6, 0]);
  expect(em(m, -6).saidaDb - em(m, -40).saidaDb).toBeLessThanOrEqual(11);
  for (const x of m) expect(x.picoDb).toBeLessThanOrEqual(-1);
  // A fala comum sai no nível de hoje (a compensação do compressor está calibrada).
  expect(Math.abs(em(m, -20).saidaDb - -20)).toBeLessThanOrEqual(1.5);
});

test('CA-3: sem nivelar, a voz sai igual à de hoje (a correção desfaz a compensação do limitador)', async () => {
  const m = await medir(false, 1, [-40, -20, -6]);
  for (const x of m) expect(Math.abs(x.saidaDb - x.entradaDb)).toBeLessThanOrEqual(0.2);
});

test('CA-4: ganho de 200% soma 6 dB (± 1); com 300% e sem nivelar, o limitador segura o pico abaixo de −1 dBFS', async () => {
  const um = await medir(true, 1, [-40, -20, -6]);
  const dois = await medir(true, 2, [-40, -20, -6]);
  for (const e of [-40, -20, -6]) expect(Math.abs(em(dois, e).saidaDb - em(um, e).saidaDb - 6)).toBeLessThanOrEqual(1);
  const tres = await medir(false, 3, [-6, 0]);
  for (const x of tres) expect(x.picoDb).toBeLessThanOrEqual(-1);
});
