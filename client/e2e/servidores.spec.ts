import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Backlog v2, item 7: vários servidores no mesmo app, cada um com o seu login. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v2/prints');

let pasta: string;
const servidores: FastifyInstance[] = [];
const abertos: ElectronApplication[] = [];

async function subir(nome: string, convite: string): Promise<string> {
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  const s = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: convite, TENTATIVAS_POR_MINUTO: '1000', NOME_SERVIDOR: nome }));
  await s.listen({ port: 0, host: '127.0.0.1' });
  servidores.push(s);
  return `http://127.0.0.1:${(s.server.address() as AddressInfo).port}`;
}

test.beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-servidores-'));
});
test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await Promise.all(servidores.splice(0).map((s) => s.close()));
  rmSync(pasta, { recursive: true, force: true });
});

async function abrir(): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, 'ana') } });
  abertos.push(app);
  return { app, janela: await app.firstWindow() };
}

async function cadastrarPorLink(j: Page, link: string) {
  await j.getByLabel('Endereço do servidor').fill(link);
  await j.getByRole('button', { name: 'Conectar' }).click();
  await j.getByLabel('Nome de usuário').fill('ana');
  await j.getByLabel('Senha').fill('senha-forte-1');
  await j.getByRole('button', { name: 'Criar conta' }).click();
  await expect(j.getByRole('list', { name: 'Membros' })).toBeVisible();
}

test('backlog v2, item 7: entra em dois servidores e troca entre eles pela coluna, sem pedir senha de novo', async () => {
  const a = await subir('Turma da Faculdade', 'convite-turma');
  const b = await subir('Família', 'convite-familia');
  const { app, janela: j } = await abrir();

  await cadastrarPorLink(j, `${a}/convite/convite-turma`);
  const coluna = j.getByRole('navigation', { name: 'Servidores' });
  await expect(coluna.getByRole('button', { name: /Turma da Faculdade/ })).toHaveAttribute('aria-current', 'page');

  await coluna.getByRole('button', { name: 'Adicionar servidor' }).click();
  await cadastrarPorLink(j, `${b}/convite/convite-familia`);
  await expect(coluna.getByRole('button', { name: /Família/ })).toHaveAttribute('aria-current', 'page');
  await expect(coluna.getByRole('button', { name: /Turma da Faculdade/ })).toHaveText('TF');
  await j.screenshot({ path: join(PRINTS, 'varios-servidores.png') });

  // Volta para o primeiro: entra direto, com a sessão dele.
  await coluna.getByRole('button', { name: /Turma da Faculdade/ }).click();
  await expect(j.getByRole('list', { name: 'Membros' })).toBeVisible();
  await expect(j.getByText(/· Turma da Faculdade$/)).toBeVisible();

  // Reabrir o app: lembra dos dois e abre o último usado.
  await app.close();
  const de_novo = await abrir();
  const colunaNova = de_novo.janela.getByRole('navigation', { name: 'Servidores' });
  await expect(colunaNova.getByRole('button', { name: /Família/ })).toBeVisible();
  await expect(colunaNova.getByRole('button', { name: /Turma da Faculdade/ })).toHaveAttribute('aria-current', 'page');
  await colunaNova.getByRole('button', { name: /Família/ }).click();
  await expect(de_novo.janela.getByText(/· Família$/)).toBeVisible();
});
