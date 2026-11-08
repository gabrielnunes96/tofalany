import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Amigos: clique direito numa pessoa → Adicionar amigo; a outra aceita na aba Amigos; volume pelo mesmo menu. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v2/prints');

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-amigos-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: 'convite-turma', TENTATIVAS_POR_MINUTO: '1000', NOME_SERVIDOR: 'Turma' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});
test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function entrar(nome: string): Promise<Page> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  const j = await app.firstWindow();
  await j.getByLabel('Endereço do servidor').fill(`${url}/convite/convite-turma`);
  await j.getByRole('button', { name: 'Conectar' }).click();
  await j.getByLabel('Nome de usuário').fill(nome);
  await j.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await j.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await j.getByRole('button', { name: 'Criar conta' }).click();
  await expect(j.getByRole('list', { name: 'Membros' })).toBeVisible();
  return j;
}

test('amigos: clique direito → Adicionar amigo; a outra pessoa aceita; os dois se veem na aba Amigos', async () => {
  const dono = await entrar('dono');
  const ana = await entrar('ana');
  const membros = dono.getByRole('list', { name: 'Membros' });
  await membros.getByRole('listitem', { name: /^ana/ }).click({ button: 'right' });
  const menu = dono.getByRole('menu', { name: 'Opções de ana' });
  await expect(menu.getByLabel('Volume de ana')).toHaveValue('100');
  await menu.getByLabel('Volume de ana').fill('150');
  await expect(menu.getByLabel('Volume de ana')).toHaveValue('150');
  await menu.getByRole('menuitem', { name: 'Adicionar amigo' }).click();
  await expect(menu).toHaveCount(0);

  // A ana vê o pedido na aba Amigos (com o número na aba) e aceita.
  const abaAna = ana.getByRole('tab', { name: /Amigos/ });
  await expect(abaAna).toContainText('1 não lida');
  await abaAna.click();
  await ana.getByRole('button', { name: 'Aceitar dono' }).click();
  await expect(ana.getByRole('list', { name: 'Amigos' })).toContainText('dono');

  await dono.getByRole('tab', { name: /Amigos/ }).click();
  await expect(dono.getByRole('list', { name: 'Amigos' })).toContainText('ana');
  // Clicar no amigo abre a conversa direta.
  await dono.getByRole('list', { name: 'Amigos' }).getByRole('button', { name: /ana/ }).click();
  await expect(dono.getByLabel('Mensagem para ana')).toBeVisible();
  await dono.screenshot({ path: join(PRINTS, 'amigos.png') });

  // Pelo menu, desfazer a amizade.
  await dono.getByRole('list', { name: 'Amigos' }).getByRole('listitem').first().click({ button: 'right' });
  await dono.getByRole('menuitem', { name: 'Desfazer amizade' }).click();
  await expect(dono.getByRole('list', { name: 'Amigos' })).not.toContainText('ana');
});
