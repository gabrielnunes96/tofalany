import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Vários servidores na mesma instalação, como no Discord: o administrador cria, os outros entram pelo convite. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v2/prints');

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-comunidades-'));
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

async function abrir(nome: string): Promise<Page> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  return app.firstWindow();
}

async function cadastrarPorLink(j: Page, link: string, usuario: string) {
  await j.getByLabel('Endereço do servidor').fill(link);
  await j.getByRole('button', { name: 'Conectar' }).click();
  await j.getByLabel('Nome de usuário').fill(usuario);
  await j.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await j.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await j.getByRole('button', { name: 'Criar conta' }).click();
  await expect(j.getByRole('list', { name: 'Membros' })).toBeVisible();
}

test('vários servidores: o administrador cria "Família"; a ana entra pelo convite e vê só ele; nada vaza entre servidores', async () => {
  const dono = await abrir('dono');
  await cadastrarPorLink(dono, `${url}/convite/convite-turma`, 'dono');
  const coluna = dono.getByRole('navigation', { name: 'Servidores' });

  // Criar servidor pelo "+" da coluna (só o administrador do principal vê a opção).
  await coluna.getByRole('button', { name: 'Adicionar servidor' }).click();
  await dono.getByRole('menuitem', { name: /Criar servidor/ }).click();
  await dono.getByLabel('Nome do servidor').fill('Família');
  await dono.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(dono.getByText(/· Família$/)).toBeVisible();
  await expect(coluna.getByRole('button', { name: /Família/ })).toHaveAttribute('aria-current', 'page');
  await expect(coluna.getByRole('button', { name: /Turma/ })).toBeVisible();
  await dono.getByLabel('Mensagem para #geral').fill('bem-vindos à família');
  await dono.getByLabel('Mensagem para #geral').press('Enter');

  // A ana entra pelo link de convite da Família: só ela aparece na coluna.
  const codigo = (servidor.banco.prepare('SELECT convite FROM comunidades WHERE id = 2').get() as { convite: string }).convite;
  const ana = await abrir('ana');
  await cadastrarPorLink(ana, `${url}/c/2/convite/${codigo}`, 'ana');
  await expect(ana.getByText(/· Família$/)).toBeVisible();
  await expect(ana.getByRole('list', { name: /Mensagens em #geral|Mensagens de #geral|#geral/ }).first()).toContainText('bem-vindos à família');
  const colunaAna = ana.getByRole('navigation', { name: 'Servidores' });
  await expect(colunaAna.getByRole('button', { name: /Turma/ })).toHaveCount(0);
  // A ana não é administradora: o "+" só entra com convite (não oferece criar).
  await expect(colunaAna.getByRole('button', { name: 'Adicionar servidor' })).not.toHaveAttribute('aria-expanded');

  await ana.getByLabel('Mensagem para #geral').fill('cheguei');
  await ana.getByLabel('Mensagem para #geral').press('Enter');
  await expect(dono.getByRole('main')).toContainText('cheguei');
  await dono.screenshot({ path: join(PRINTS, 'varios-servidores-na-instalacao.png') });

  // O dono volta para a Turma: lá não há nada da Família, e a ana não é membro.
  await coluna.getByRole('button', { name: /Turma/ }).click();
  await expect(dono.getByText(/· Turma$/)).toBeVisible();
  await expect(dono.getByRole('main')).not.toContainText('cheguei');
  await expect(dono.getByRole('list', { name: 'Membros' })).not.toContainText('ana');
});
