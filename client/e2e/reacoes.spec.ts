import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Reações e respostas (0.16.0): reagir com dois apps abertos, em canal e em DM (T7). */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/reacoes-e-respostas/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-reacoes-'));
  mkdirSync(PRINTS, { recursive: true });
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

async function entrar(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(janela.getByLabel('Mensagem para #geral')).toBeVisible();
  return { app, janela };
}

/** Troca a notificação real do sistema por um registro, no processo principal do app. */
async function interceptarNotificacoes(app: ElectronApplication) {
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { notificacoes: string[] };
    g.notificacoes = [];
    Notification.prototype.show = function (this: Electron.Notification) {
      g.notificacoes.push(`${this.title} | ${this.body}`);
    };
  });
  return () => app.evaluate(() => (globalThis as unknown as { notificacoes: string[] }).notificacoes);
}

async function cadastrar() {
  for (const usuario of ['dono', 'ana', 'beto']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode, `cadastro de ${usuario}`).toBe(201);
  }
}

test('reações no canal: atalho e seletor, ao vivo no outro app, quem reagiu, tirar; reagir não notifica (CA-1, CA-3, CA-4, CA-9)', async () => {
  test.setTimeout(90_000);
  await cadastrar();
  const ana = await entrar('ana');
  const beto = await entrar('beto');
  const notificacoesDoBeto = await interceptarNotificacoes(beto.app);

  const campo = beto.janela.getByLabel('Mensagem para #geral');
  await campo.fill('bora jogar hoje?');
  await campo.press('Enter');
  const naAna = ana.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await expect(naAna).toContainText('bora jogar hoje?');

  // O beto vai para outra janela (sem foco): uma reação não pode virar notificação.
  await beto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur());

  // Atalho de um clique.
  await naAna.hover();
  await naAna.getByRole('button', { name: 'Reagir com 👍' }).click();
  await expect(naAna.getByRole('button', { name: '👍, 1 reação, inclusive você' })).toBeVisible();
  const noBeto = beto.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await expect(noBeto.getByRole('button', { name: '👍, 1 reação' })).toBeVisible();

  // Seletor completo com busca em português.
  await naAna.hover();
  await naAna.getByRole('button', { name: 'Reagir', exact: true }).click();
  const seletor = ana.janela.getByRole('dialog', { name: 'Escolher reação' });
  await expect(seletor.getByRole('region', { name: 'Carinhas e emoções' })).toBeVisible();
  await seletor.getByRole('searchbox').fill('fogo');
  await ana.janela.waitForTimeout(300);
  await ana.janela.screenshot({ path: join(PRINTS, 'seletor-emoji.png') });
  await seletor.getByRole('searchbox').press('Enter');
  await expect(seletor).toBeHidden();
  await expect(noBeto.getByRole('button', { name: '🔥, 1 reação' })).toBeVisible();

  // O beto também reage com 👍; a ana vê quem reagiu.
  await noBeto.getByRole('button', { name: '👍, 1 reação' }).click();
  const joinha = naAna.getByRole('button', { name: '👍, 2 reações, inclusive você' });
  await expect(joinha).toBeVisible();
  await joinha.hover();
  await expect(joinha.locator('.reacao-dica')).toHaveText('você e beto');
  await ana.janela.waitForTimeout(300);
  await ana.janela.screenshot({ path: join(PRINTS, 'reacoes.png') });

  // Clicar de novo tira só a da própria pessoa.
  await joinha.click();
  await expect(noBeto.getByRole('button', { name: '👍, 1 reação, inclusive você' })).toBeVisible();
  expect(await notificacoesDoBeto()).toEqual([]);
});

test('reações numa conversa direta: os dois reagem e veem ao vivo (CA-18)', async () => {
  test.setTimeout(90_000);
  await cadastrar();
  const ana = await entrar('ana');
  const beto = await entrar('beto');
  await ana.janela.getByRole('button', { name: 'Conversar com beto' }).click();
  const campo = ana.janela.getByLabel('Mensagem para beto');
  await campo.fill('só entre nós');
  await campo.press('Enter');
  // As conversas diretas ficam na aba Amigos da barra.
  await beto.janela.getByRole('tab', { name: /Amigos/ }).click();
  const dms = beto.janela.getByRole('list', { name: 'Mensagens diretas' });
  await dms.getByRole('button', { name: /^ana/ }).click();
  const noBeto = beto.janela.getByRole('listitem', { name: 'Mensagem de ana' });
  await noBeto.hover();
  await noBeto.getByRole('button', { name: 'Reagir com ❤️' }).click();
  await expect(ana.janela.getByRole('listitem', { name: 'Mensagem de ana' }).getByRole('button', { name: '❤️, 1 reação' })).toBeVisible();
});
