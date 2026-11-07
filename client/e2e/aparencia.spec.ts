import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

/** Backlog v2 (P2): temas, painel compacto e ocultar partes da tela. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v2/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-aparencia-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrir(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  return { app, janela: await app.firstWindow() };
}

async function cadastrarDono(): Promise<{ app: ElectronApplication; janela: Page }> {
  const d = await abrir('dono');
  await d.janela.getByLabel('Endereço do servidor').fill(url);
  await d.janela.getByRole('button', { name: 'Conectar' }).click();
  await d.janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await d.janela.getByLabel('Código de convite').fill(CONVITE);
  await d.janela.getByLabel('Nome de usuário').fill('dono');
  await d.janela.getByLabel('Senha').fill('senha-forte-1');
  await d.janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(d.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return d;
}

test('backlog v2, item 9: trocar o tema em Configurações vale na hora e fica guardado', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  const fundo = () => j.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const neon = await fundo();
  await j.screenshot({ path: join(PRINTS, 'tema-neon.png') });
  // Backlog v2, item 8: painel compacto; as opções ficam no menu ⚙️.
  await j.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(j.locator('#menu-usuario')).toContainText('Auditoria');
  await j.waitForTimeout(300);
  await j.screenshot({ path: join(PRINTS, 'painel-menu-aberto.png') });
  await j.keyboard.press('Escape');
  await expect(j.locator('#menu-usuario')).toHaveCount(0);

  await noMenu(j, 'Configurações');
  await j.getByRole('radio', { name: /Aurora/ }).check();
  await expect.poll(() => j.evaluate(() => document.documentElement.dataset.tema)).toBe('aurora');
  expect(await fundo()).not.toBe(neon);
  await j.getByRole('button', { name: 'Voltar' }).first().click();
  await j.screenshot({ path: join(PRINTS, 'tema-aurora.png') });

  await noMenu(j, 'Configurações');
  await j.getByRole('radio', { name: /Breu/ }).check();
  await j.getByRole('button', { name: 'Voltar' }).first().click();
  await j.screenshot({ path: join(PRINTS, 'tema-breu.png') });

  // Reabrir o app: o tema escolhido vem antes de tudo.
  await dono.app.close();
  const de_novo = await abrir('dono');
  await expect(de_novo.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  await expect.poll(() => de_novo.janela.evaluate(() => document.documentElement.dataset.tema)).toBe('breu');
});

test('backlog v2, item 10: esconder canais (Ctrl+B) e membros (botão); a escolha fica guardada', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  const canais = j.getByRole('list', { name: 'Canais de texto' });
  const membros = j.getByRole('list', { name: 'Membros' });
  await expect(canais).toBeVisible();

  await j.keyboard.press('Control+b');
  await expect(canais).toBeHidden();
  await j.getByRole('button', { name: 'Mostrar membros' }).click();
  await expect(membros).toBeHidden();
  // A conversa ocupa a largura toda e segue usável.
  await j.getByLabel('Mensagem para #geral').fill('tela limpa');
  await j.getByLabel('Mensagem para #geral').press('Enter');
  await expect(j.getByRole('list', { name: 'Mensagens de #geral' })).toContainText('tela limpa');
  await j.screenshot({ path: join(PRINTS, 'paineis-ocultos.png') });

  await dono.app.close();
  const de_novo = await abrir('dono');
  await expect(de_novo.janela.getByLabel('Mensagem para #geral')).toBeVisible();
  await expect(de_novo.janela.getByRole('list', { name: 'Canais de texto' })).toBeHidden();
  await de_novo.janela.getByRole('button', { name: 'Mostrar canais' }).click();
  await de_novo.janela.keyboard.press('Control+m');
  await expect(de_novo.janela.getByRole('list', { name: 'Canais de texto' })).toBeVisible();
  await expect(de_novo.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
});

test('backlog v2, item 10b: link vira clicável, com cartão de prévia; no YouTube, "Assistir" abre o player', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  // A prévia vem do servidor (que buscaria o YouTube); aqui ela é respondida sem internet.
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await j.route('**/api/previa?*', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=TDmH-2Zs9_8', tipo: 'youtube', videoId: 'TDmH-2Zs9_8', site: 'YouTube', titulo: 'Jogo de terror', descricao: 'Hollow', imagem: pixel }),
    }),
  );
  await j.getByLabel('Mensagem para #geral').fill('olha esse https://www.youtube.com/watch?v=TDmH-2Zs9_8.');
  await j.getByLabel('Mensagem para #geral').press('Enter');
  const lista = j.getByRole('list', { name: 'Mensagens de #geral' });
  await expect(lista.getByRole('link', { name: 'https://www.youtube.com/watch?v=TDmH-2Zs9_8', exact: true })).toBeVisible();
  const cartao = lista.getByRole('article', { name: 'Prévia: Jogo de terror' });
  await expect(cartao).toContainText('YouTube');
  await expect(cartao).toContainText('Hollow');
  await cartao.getByRole('button', { name: 'Assistir Jogo de terror aqui' }).click();
  await expect(cartao.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/TDmH-2Zs9_8\?/);
  await j.screenshot({ path: join(PRINTS, 'previa-youtube.png') });
  await cartao.getByRole('button', { name: 'Fechar vídeo' }).click();
  await expect(cartao.locator('iframe')).toHaveCount(0);
});
