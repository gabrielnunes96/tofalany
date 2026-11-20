import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Reações e respostas (0.16.0): responder com dois apps abertos (T7). */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/reacoes-e-respostas/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance & { banco: unknown };
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-respostas-'));
  mkdirSync(PRINTS, { recursive: true });
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = (await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }))) as typeof servidor;
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

async function cadastrar(): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const usuario of ['dono', 'ana', 'beto']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode, `cadastro de ${usuario}`).toBe(201);
    ids[usuario] = r.json().usuario.id as number;
  }
  return ids;
}

test('responder: faixa, aviso como menção, sem aviso, Esc, original apagada (CA-10, CA-12, CA-14, CA-15, CA-17)', async () => {
  test.setTimeout(90_000);
  await cadastrar();
  const ana = await entrar('ana');
  const beto = await entrar('beto');
  const notificacoesDoBeto = await interceptarNotificacoes(beto.app);
  await beto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur());

  const campoBeto = beto.janela.getByLabel('Mensagem para #geral');
  await campoBeto.fill('vamos jogar hoje?\ndepois das 21h');
  await campoBeto.press('Enter');
  const original = ana.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await expect(original).toContainText('vamos jogar hoje?');

  // Responder com aviso (padrão).
  await original.hover();
  await original.getByRole('button', { name: 'Responder' }).click();
  const faixa = ana.janela.getByRole('group', { name: 'Respondendo a beto' });
  await expect(faixa).toContainText('vamos jogar hoje?');
  await ana.janela.waitForTimeout(200);
  await ana.janela.screenshot({ path: join(PRINTS, 'respondendo.png') });
  const campoAna = ana.janela.getByLabel('Mensagem para #geral');
  await campoAna.fill('bora!');
  await campoAna.press('Enter');
  await expect(faixa).toBeHidden();
  const resposta = beto.janela.getByRole('listitem', { name: 'Mensagem de ana' }).filter({ hasText: 'bora!' });
  await expect(resposta.getByRole('button', { name: /Resposta a você: vamos jogar hoje\?/ })).toBeVisible();
  await expect(resposta).toHaveClass(/mencionou-me/);
  await expect.poll(notificacoesDoBeto).toEqual(['↩ ana respondeu a você em #geral | bora!']);
  await beto.janela.waitForTimeout(200);
  await beto.janela.screenshot({ path: join(PRINTS, 'resposta.png') });

  // Sem aviso: não notifica nem destaca.
  await original.hover();
  await original.getByRole('button', { name: 'Responder' }).click();
  await ana.janela.getByRole('button', { name: 'Avisar beto' }).click();
  await campoAna.fill('sem aviso');
  await campoAna.press('Enter');
  const quieta = beto.janela.getByRole('listitem', { name: 'Mensagem de ana' }).filter({ hasText: 'sem aviso' });
  await expect(quieta).toBeVisible();
  await expect(quieta).not.toHaveClass(/mencionou-me/);
  // Sem aviso, é uma mensagem comum: a notificação (se a pessoa recebe as do canal) não diz "respondeu a você".
  await expect.poll(notificacoesDoBeto).toEqual(['↩ ana respondeu a você em #geral | bora!', '#geral — ana | sem aviso']);

  // Esc cancela; a próxima sai sem vínculo.
  await original.hover();
  await original.getByRole('button', { name: 'Responder' }).click();
  await campoAna.press('Escape');
  await expect(ana.janela.getByRole('group', { name: /Respondendo a/ })).toBeHidden();
  await campoAna.fill('solta');
  await campoAna.press('Enter');
  await expect(beto.janela.getByRole('listitem', { name: 'Mensagem de ana' }).filter({ hasText: 'solta' }).locator('.trecho-resposta')).toHaveCount(0);

  // A original é apagada: as respostas mostram "Mensagem original apagada" nos dois apps.
  const minhaOriginal = beto.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await beto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.focus());
  await minhaOriginal.hover();
  await minhaOriginal.getByRole('button', { name: 'Apagar' }).click();
  await minhaOriginal.getByRole('button', { name: 'Confirmar' }).click();
  await expect(ana.janela.getByText('Mensagem original apagada')).toHaveCount(2);
  await expect(beto.janela.getByText('Mensagem original apagada')).toHaveCount(2);
});

test('ir até uma original 300 mensagens acima (CA-11)', async () => {
  test.setTimeout(90_000);
  const ids = await cadastrar();
  const { inserirMensagem } = await import('../../server/dist/dominio/mensagens.js');
  const banco = servidor.banco as Parameters<typeof inserirMensagem>[0];
  const geral = (banco as { prepare(s: string): { get(): unknown } }).prepare("SELECT id FROM canais WHERE nome = 'geral'").get() as { id: number };
  const original = inserirMensagem(banco, { canalId: geral.id }, ids.beto!, 'a original lá de cima');
  for (let i = 0; i < 300; i++) inserirMensagem(banco, { canalId: geral.id }, ids.beto!, `enchendo ${i}`);
  inserirMensagem(banco, { canalId: geral.id }, ids.ana!, 'lembra disso?', Date.now(), { usuarios: [ids.beto!], todos: false }, { a: original, avisa: ids.beto! });

  const ana = await entrar('ana');
  const trecho = ana.janela.getByRole('button', { name: /Resposta a beto: a original lá de cima/ });
  await expect(trecho).toBeVisible();
  await expect(ana.janela.locator('[data-mensagem-id]')).not.toHaveCount(302);
  await trecho.click();
  const alvo = ana.janela.locator(`[data-mensagem-id="${original}"]`);
  await expect(alvo).toBeInViewport();
  await expect(alvo).toHaveClass(/destacada/);
  await expect(alvo).toBeFocused();
  await ana.janela.screenshot({ path: join(PRINTS, 'ir-ate-original.png') });
});
