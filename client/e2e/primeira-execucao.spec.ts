import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let servidor: FastifyInstance;
let urlServidor: string;

test.beforeAll(async () => {
  // Servidor compilado (ESM): o Playwright carrega este arquivo como CommonJS.
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({ NOME_SERVIDOR: 'Turma E2E', LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }),
  );
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  urlServidor = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await servidor.close();
});

async function abrirApp(pastaDados: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: pastaDados } });
  return { app, janela: await app.firstWindow() };
}

async function informarServidor(janela: Page, url: string) {
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
}

async function criarConta(janela: Page, usuario: string, convite = CONVITE) {
  await janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await janela.getByLabel('Código de convite').fill(convite);
  await janela.getByLabel('Nome de usuário').fill(usuario);
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Criar conta' }).click();
}

test('CA-1: primeira execução pede a URL, recusa a inacessível e guarda a válida', async () => {
  const pastaDados = mkdtempSync(join(tmpdir(), 'tofalando-e2e-'));
  let { app, janela } = await abrirApp(pastaDados);

  const campo = janela.getByLabel('Endereço do servidor');
  await expect(campo).toBeVisible();

  // Porta 1 em loopback: conexão recusada.
  await informarServidor(janela, '127.0.0.1:1');
  await expect(janela.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(campo).toBeVisible();

  await informarServidor(janela, urlServidor);
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await app.close();

  // Ao reabrir, a URL guardada é usada sem perguntar de novo.
  ({ app, janela } = await abrirApp(pastaDados));
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  // Trocar servidor → cancelar mantém o servidor que funcionava.
  await janela.getByRole('button', { name: 'Trocar servidor' }).click();
  await expect(janela.getByLabel('Endereço do servidor')).toBeVisible();
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  // Desistir no meio da troca (fechar o app) não apaga o servidor guardado.
  await janela.getByRole('button', { name: 'Trocar servidor' }).click();
  await app.close();
  ({ app, janela } = await abrirApp(pastaDados));
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await app.close();
});

test('CA-2, CA-5 e CA-6: cadastro com convite, primeira conta admin, reabrir entra direto, sair', async () => {
  const pastaDados = mkdtempSync(join(tmpdir(), 'tofalando-e2e-'));
  let { app, janela } = await abrirApp(pastaDados);
  await informarServidor(janela, urlServidor);

  // CA-2 pela tela: convite errado não cria conta.
  await criarConta(janela, 'dono', 'convite-errado');
  await expect(janela.getByRole('alert')).toHaveText('Código de convite inválido.');

  // CA-5: a primeira conta é administrador.
  await janela.getByLabel('Código de convite').fill(CONVITE);
  await janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(janela.getByTestId('usuario-logado')).toHaveText('Olá, dono');
  await expect(janela.getByText('Administrador', { exact: false })).toBeVisible();
  await app.close();

  // CA-6: reabrir entra direto, sem pedir senha.
  ({ app, janela } = await abrirApp(pastaDados));
  await expect(janela.getByTestId('usuario-logado')).toHaveText('Olá, dono');

  // Sair volta ao login; entrar de novo funciona; reabrir depois de sair pede login.
  await noMenu(janela, 'Sair');
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await janela.getByLabel('Nome de usuário').fill('DONO');
  await janela.getByLabel('Senha', { exact: true }).fill('senha-errada');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('senha-errada');
  await janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(janela.getByRole('alert')).toHaveText('Usuário ou senha incorretos.');
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(janela.getByTestId('usuario-logado')).toHaveText('Olá, dono');
  await noMenu(janela, 'Sair');
  await app.close();

  ({ app, janela } = await abrirApp(pastaDados));
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await app.close();
});
