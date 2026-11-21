import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** chat-fixar-e-buscar (T9): fixar com dois apps, ir até uma fixada antiga e buscar com filtros. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/chat-fixar-e-buscar/prints');
const CONVITE = 'convite-e2e';

type Banco = { prepare(s: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): unknown } };
let pasta: string;
let servidor: FastifyInstance & { banco: Banco };
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-fixar-'));
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

async function cadastrar(): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  // A primeira conta é a do administrador (tem "Fixar mensagens").
  for (const usuario of ['dono', 'ana', 'beto']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode, `cadastro de ${usuario}`).toBe(201);
    ids[usuario] = r.json().usuario.id as number;
  }
  return ids;
}

const idGeral = () => (servidor.banco.prepare("SELECT id FROM canais WHERE nome = 'geral'").get() as { id: number }).id;

test('fixar: quem pode fixa, o outro app vê a linha e a lista na hora; membro comum não vê "Fixar" (CA-1, CA-2, CA-5)', async () => {
  test.setTimeout(90_000);
  await cadastrar();
  const dono = await entrar('dono');
  const ana = await entrar('ana');
  const campoAna = ana.janela.getByLabel('Mensagem para #geral');
  await campoAna.fill('o churrasco é sábado às 15h');
  await campoAna.press('Enter');

  // A Ana (membro comum) não vê "Fixar".
  const minha = ana.janela.getByRole('listitem', { name: 'Mensagem de ana' });
  await minha.hover();
  await expect(minha.getByRole('button', { name: 'Responder' })).toBeVisible();
  await expect(minha.getByRole('button', { name: 'Fixar' })).toHaveCount(0);

  // O dono fixa.
  const daAna = dono.janela.getByRole('listitem', { name: 'Mensagem de ana' });
  await daAna.hover();
  await daAna.getByRole('button', { name: 'Fixar' }).click();
  await expect(ana.janela.getByRole('listitem', { name: 'dono fixou uma mensagem' })).toBeVisible();
  await ana.janela.getByRole('button', { name: 'Mensagens fixadas' }).click();
  const painel = ana.janela.getByRole('list', { name: 'Mensagens fixadas' });
  await expect(painel).toContainText('o churrasco é sábado às 15h');
  await expect(painel).toContainText('Fixada por dono');
  await ana.janela.waitForTimeout(200);
  await ana.janela.screenshot({ path: join(PRINTS, 'fixadas.png') });
});

test('ir até uma fixada de 3000 mensagens atrás e voltar para as mais recentes (CA-6)', async () => {
  test.setTimeout(120_000);
  const ids = await cadastrar();
  const { inserirMensagem } = await import('../../server/dist/dominio/mensagens.js');
  const banco = servidor.banco as unknown as Parameters<typeof inserirMensagem>[0];
  const geral = idGeral();
  const antiga = inserirMensagem(banco, { canalId: geral }, ids.beto!, 'a regra do grupo, lá de trás');
  (banco as unknown as { transaction(f: () => void): () => void }).transaction(() => {
    for (let i = 0; i < 3000; i++) inserirMensagem(banco, { canalId: geral }, ids.beto!, `conversa ${i}`);
  })();
  servidor.banco.prepare('INSERT INTO mensagens_fixadas (mensagem_id, fixada_por, fixada_em) VALUES (?, ?, ?)').run(antiga, ids.dono, Date.now());

  const ana = await entrar('ana');
  await expect(ana.janela.getByText('conversa 2999')).toBeVisible();
  await ana.janela.getByRole('button', { name: 'Mensagens fixadas' }).click();
  await ana.janela.getByRole('list', { name: 'Mensagens fixadas' }).getByText('a regra do grupo, lá de trás').click();
  const alvo = ana.janela.locator(`[data-mensagem-id="${antiga}"]`);
  await expect(alvo).toHaveClass(/destacada/);
  await expect(ana.janela.getByText('conversa 2999')).toHaveCount(0);
  await ana.janela.getByRole('button', { name: 'Ir para as mais recentes' }).click();
  await expect(ana.janela.getByText('conversa 2999')).toBeVisible();
});

test('buscar: sem acento e por prefixo, com filtro de onde, e abrir um resultado de outro canal (CA-8, CA-10, CA-13)', async () => {
  test.setTimeout(90_000);
  const ids = await cadastrar();
  const { inserirMensagem } = await import('../../server/dist/dominio/mensagens.js');
  const { criarCanal } = await import('../../server/dist/dominio/canais.js');
  const banco = servidor.banco as unknown as Parameters<typeof inserirMensagem>[0];
  const geral = idGeral();
  const jogos = criarCanal(banco as never, 'texto', 'jogos', ids.dono!).id;
  inserirMensagem(banco, { canalId: geral }, ids.beto!, 'Você vai jogar hoje?');
  const lá = inserirMensagem(banco, { canalId: jogos }, ids.beto!, 'Vocês jogam amanhã no canal de jogos');
  for (let i = 0; i < 80; i++) inserirMensagem(banco, { canalId: jogos }, ids.beto!, `enchendo ${i}`);

  const ana = await entrar('ana');
  const campo = ana.janela.getByLabel('Buscar mensagens');
  await campo.fill('voce jog');
  await campo.press('Enter');
  const resultados = ana.janela.getByRole('list', { name: 'Resultados da busca' });
  await expect(resultados.getByRole('listitem')).toHaveCount(1);
  await expect(resultados.locator('mark')).toHaveText(['Você', 'jogar']);
  await ana.janela.getByRole('combobox', { name: 'Onde', exact: true }).selectOption('todos');
  await expect(resultados.getByRole('listitem')).toHaveCount(2);
  await expect(resultados).toContainText('#jogos');
  await ana.janela.waitForTimeout(200);
  await ana.janela.screenshot({ path: join(PRINTS, 'busca.png') });
  await resultados.getByText('amanhã no canal de jogos').click();
  await expect(ana.janela.getByLabel('Mensagem para #jogos')).toBeVisible();
  await expect(ana.janela.locator(`[data-mensagem-id="${lá}"]`)).toHaveClass(/destacada/);
});
