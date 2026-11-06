import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-admin-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function entrar(nome: string, criar: boolean): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  if (criar) {
    await janela.getByRole('button', { name: 'Tenho um convite' }).click();
    await janela.getByLabel('Código de convite').fill(CONVITE);
  }
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha').fill('senha-forte-1');
  await janela.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click();
  await expect(janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return { app, janela };
}

test('CA-9, CA-11a, CA-11b: promover, remover conta e trocar convite pelo app', async () => {
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  await expect(ana.janela.getByRole('button', { name: 'Membros' })).toHaveCount(0);

  // CA-9: promover; a ana ganha as funções de administrador sem reiniciar.
  await dono.janela.getByRole('button', { name: 'Membros' }).click();
  const linhaAna = dono.janela.getByRole('list', { name: 'Contas do servidor' }).getByRole('listitem', { name: 'ana', exact: true });
  await linhaAna.getByRole('button', { name: 'Tornar administrador' }).click();
  await expect(linhaAna.getByText('Administrador')).toBeVisible();
  await expect(ana.janela.getByRole('button', { name: 'Membros' })).toBeVisible();
  await expect(ana.janela.getByText(/^Administrador · /)).toBeVisible();

  // CA-10 pela tela: rebaixar a ana de volta funciona (ainda sobra o dono).
  await linhaAna.getByRole('button', { name: 'Tornar membro' }).click();
  await expect(ana.janela.getByRole('button', { name: 'Membros' })).toHaveCount(0);

  // CA-11a: remover com confirmação; a ana cai no login com aviso e some da lista.
  await linhaAna.getByRole('button', { name: 'Remover conta' }).click();
  await linhaAna.getByRole('button', { name: 'Confirmar remoção' }).click();
  await expect(ana.janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(ana.janela.getByRole('status')).toHaveText('Sua conta foi removida deste servidor.');
  await expect(dono.janela.getByRole('list', { name: 'Contas do servidor' }).getByRole('listitem', { name: 'ana', exact: true })).toHaveCount(0);
  await ana.janela.getByLabel('Nome de usuário').fill('ana');
  await ana.janela.getByLabel('Senha').fill('senha-forte-1');
  await ana.janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(ana.janela.getByRole('alert')).toHaveText('Usuário ou senha incorretos.');

  // CA-11b: trocar o convite; o antigo deixa de valer.
  await dono.janela.getByRole('button', { name: 'Voltar' }).click();
  await dono.janela.getByRole('button', { name: 'Convite', exact: true }).click();
  await expect(dono.janela.getByTestId('codigo-convite')).toHaveText(CONVITE);
  await dono.janela.getByLabel('Novo código').fill('turma-nova-2026');
  await dono.janela.getByRole('button', { name: 'Trocar código' }).click();
  await expect(dono.janela.getByTestId('link-convite')).toHaveText(`${url}/convite/turma-nova-2026`);
  const antigo = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'bia', senha: 'senha-forte-1' } });
  expect(antigo.statusCode).toBe(403);

  // Auditoria: a conta removida aparece no filtro e as ações estão lá.
  await dono.janela.getByRole('button', { name: 'Voltar' }).click();
  await dono.janela.getByRole('button', { name: 'Auditoria' }).click();
  await dono.janela.getByLabel('Pessoa').selectOption({ label: 'ana (conta removida)' });
  const lista = dono.janela.getByRole('list', { name: 'Registros da auditoria' });
  await expect(lista).toContainText('dono removeu a conta de ana');
  await expect(lista).toContainText('dono alterou o cargo de ana (cargo: admin)');

  await ana.app.close();
  await dono.app.close();
});
