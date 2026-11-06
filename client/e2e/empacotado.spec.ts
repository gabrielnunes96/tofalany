import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/**
 * CA-43 (RF-32): o app empacotado (release/linux-unpacked, gerado por `npm run dist:linux`) abre, conecta e
 * entra — com o gancho de teclado nativo carregado de fora do asar. Pulado se o pacote não foi gerado.
 */
const EXECUTAVEL = join(__dirname, '../release/linux-unpacked/tofalany');
const CONVITE = 'convite-empacotado';

const ASAR = join(__dirname, '../release/linux-unpacked/resources/app.asar');
const PRINCIPAL = join(__dirname, '../out/main/index.js');
// Pacote mais velho que o build atual testaria código antigo: pula e pede para gerar de novo.
const desatualizado = existsSync(ASAR) && existsSync(PRINCIPAL) && statSync(ASAR).mtimeMs < statSync(PRINCIPAL).mtimeMs;
test.skip(!existsSync(EXECUTAVEL) || desatualizado, 'gere o pacote (de novo) com npm run dist:linux');

let servidor: FastifyInstance;
let pasta: string;
test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-pacote-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
});
test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

test('CA-43: o app empacotado abre, cadastra pelo convite e entra no servidor', async () => {
  const url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
  // O app empacotado ignora a pasta de dados de teste: a configuração vai para um XDG_CONFIG_HOME temporário.
  const app = await electron.launch({ executablePath: EXECUTAVEL, env: { ...globalThis.process['env'], XDG_CONFIG_HOME: pasta } });
  try {
    const janela = await app.firstWindow();
    expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
    await janela.getByLabel('Endereço do servidor').fill(url);
    await janela.getByRole('button', { name: 'Conectar' }).click();
    await janela.getByRole('button', { name: 'Tenho um convite' }).click();
    await janela.getByLabel('Código de convite').fill(CONVITE);
    await janela.getByLabel('Nome de usuário').fill('dono');
    await janela.getByLabel('Senha').fill('senha-forte-1');
    await janela.getByRole('button', { name: 'Criar conta' }).click();
    await expect(janela.getByRole('list', { name: 'Membros' })).toBeVisible();
    await janela.screenshot({ path: test.info().outputPath('app-empacotado.png') });
  } finally {
    await app.close();
  }
});
