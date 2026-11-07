import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-convite-'));
  const downloads = join(pasta, 'downloads');
  mkdirSync(downloads);
  writeFileSync(join(downloads, 'ToFalany-0.1.0.AppImage'), 'instalador');
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000', DOWNLOADS: downloads }),
  );
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrir(nome: string, args: string[] = []): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal, ...args], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  return { app, janela: await app.firstWindow() };
}

test('CA-1a: membro copia o link; a página tem o download e o botão; o app abre o cadastro preenchido', async () => {
  // Um membro (aqui o dono) copia o link de convite no app.
  const dono = await abrir('dono');
  await dono.janela.getByLabel('Endereço do servidor').fill(url);
  await dono.janela.getByRole('button', { name: 'Conectar' }).click();
  await dono.janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await dono.janela.getByLabel('Código de convite').fill(CONVITE);
  await dono.janela.getByLabel('Nome de usuário').fill('dono');
  await dono.janela.getByLabel('Senha').fill('senha-forte-1');
  await dono.janela.getByRole('button', { name: 'Criar conta' }).click();
  await noMenu(dono.janela, 'Copiar link de convite');
  await expect(dono.janela.getByRole('status')).toHaveText('Link de convite copiado.');
  const link = await dono.app.evaluate(({ clipboard }) => clipboard.readText());
  expect(link).toBe(`${url}/convite/${CONVITE}`);

  // Backlog v2, item 4: quem instalou pelo GitHub cola o link na primeira tela e cai no cadastro preenchido.
  const bia = await abrir('bia');
  await bia.janela.getByLabel('Endereço do servidor').fill(link);
  await bia.janela.getByRole('button', { name: 'Conectar' }).click();
  await expect(bia.janela.getByLabel('Código de convite')).toHaveValue(CONVITE);
  await bia.app.close();

  // A pessoa abre o link no navegador: página com download e o botão "Abrir no ToFalany".
  const pagina = await fetch(link);
  expect(pagina.status).toBe(200);
  const html = await pagina.text();
  expect(html).toContain('href="/downloads/ToFalany-0.1.0.AppImage"');
  const linkApp = /href="(tofalany:[^"]+)"/.exec(html)![1]!.replaceAll('&amp;', '&');

  // O sistema abre o app com o link: cadastro com servidor e código preenchidos; só falta nome e senha.
  const nova = await abrir('nova', [linkApp]);
  await expect(nova.janela.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
  await expect(nova.janela.getByText(`Servidor: ${url}`)).toBeVisible();
  await expect(nova.janela.getByLabel('Código de convite')).toHaveValue(CONVITE);
  await nova.janela.getByLabel('Nome de usuário').fill('bia');
  await nova.janela.getByLabel('Senha').fill('senha-forte-1');
  await nova.janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(nova.janela.getByTestId('usuario-logado')).toHaveText('Olá, bia');
  await expect(dono.janela.getByRole('list', { name: 'Membros' })).toContainText('bia');

  await nova.app.close();
  await dono.app.close();
});

test('link de convite com o app já aberto vai para a janela existente', async () => {
  const linkApp = `tofalany://convite?servidor=${encodeURIComponent(url)}&codigo=${CONVITE}`;
  const primeira = await abrir('mesma');
  await expect(primeira.janela.getByLabel('Endereço do servidor')).toBeVisible();

  // Segunda instância com a mesma pasta de dados (como o sistema faz ao abrir o link): repassa e fecha sozinha.
  const binario = createRequire(__filename)('electron') as string;
  const segunda = spawn(binario, [principal, linkApp], { env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, 'mesma') }, stdio: 'ignore' });
  const codigo = await new Promise<number | null>((r) => segunda.once('exit', r));
  expect(codigo).toBe(0);

  await expect(primeira.janela.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
  await expect(primeira.janela.getByLabel('Código de convite')).toHaveValue(CONVITE);
  await primeira.app.close();
});
