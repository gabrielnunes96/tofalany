import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');

let servidor: FastifyInstance;
let urlServidor: string;

test.beforeAll(async () => {
  // Servidor compilado (ESM): o Playwright carrega este arquivo como CommonJS.
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ NOME_SERVIDOR: 'Turma E2E', LOG: 'false' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  urlServidor = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await servidor.close();
});

async function abrirApp(pastaDados: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [principal],
    env: { ...process.env, TOFALANDO_USER_DATA: pastaDados },
  });
}

test('CA-1: primeira execução pede a URL, recusa a inacessível e guarda a válida', async () => {
  const pastaDados = mkdtempSync(join(tmpdir(), 'tofalando-e2e-'));
  let app = await abrirApp(pastaDados);
  let janela = await app.firstWindow();

  const campo = janela.getByLabel('Endereço do servidor');
  await expect(campo).toBeVisible();

  // Porta 1 em loopback: conexão recusada.
  await campo.fill('127.0.0.1:1');
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await expect(janela.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(campo).toBeVisible();

  await campo.fill(urlServidor);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await expect(janela.getByTestId('servidor-conectado')).toBeVisible();
  await expect(janela.getByRole('heading', { name: 'Turma E2E' })).toBeVisible();
  await app.close();

  // Ao reabrir, a URL guardada é usada sem perguntar de novo.
  app = await abrirApp(pastaDados);
  janela = await app.firstWindow();
  await expect(janela.getByTestId('servidor-conectado')).toBeVisible();

  // Trocar servidor volta para a tela da URL; cancelar mantém o servidor que funcionava.
  await janela.getByRole('button', { name: 'Trocar servidor' }).click();
  await expect(janela.getByLabel('Endereço do servidor')).toBeVisible();
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela.getByTestId('servidor-conectado')).toBeVisible();

  // Desistir no meio da troca (fechar o app) não apaga o servidor guardado.
  await janela.getByRole('button', { name: 'Trocar servidor' }).click();
  await app.close();
  app = await abrirApp(pastaDados);
  janela = await app.firstWindow();
  await expect(janela.getByTestId('servidor-conectado')).toBeVisible();
  await app.close();
});
