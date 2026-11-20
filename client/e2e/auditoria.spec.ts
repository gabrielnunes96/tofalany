import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { itensDoMenu, noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-aud-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000', CARENCIA_OFFLINE_MS: '200' }),
  );
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrir(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  return { app, janela };
}

test('CA-48 e CA-52: administrador vê a auditoria com entradas e saídas; membro não vê a opção', async () => {
  // Administrador: primeira conta, criada pelo app.
  const dono = await abrir('dono');
  await dono.janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await dono.janela.getByLabel('Código de convite').fill(CONVITE);
  await dono.janela.getByLabel('Nome de usuário').fill('dono');
  await dono.janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await dono.janela.getByLabel('Confirmar senha').count()) await dono.janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await dono.janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(dono.janela.getByRole('list', { name: 'Membros' })).toContainText('dono');

  // Membro: conta criada direto na API; entra pelo app, não vê "Auditoria" e depois fecha o app.
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'Senha-forte-1' } });
  const ana = await abrir('ana');
  await ana.janela.getByLabel('Nome de usuário').fill('ana');
  await ana.janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await ana.janela.getByLabel('Confirmar senha').count()) await ana.janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await ana.janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(ana.janela.getByTestId('usuario-logado')).toHaveText('Olá, ana');
  await expect(ana.janela.getByText(/^Membro · /)).toBeVisible();
  expect(await itensDoMenu(ana.janela)).not.toContain('Auditoria');
  // A conexão em tempo real da ana chegou (senão fechar antes não gera online/offline).
  await expect(dono.janela.getByRole('list', { name: 'Membros' }).getByRole('listitem', { name: 'ana, online' })).toBeVisible();
  await ana.app.close();
  // Espera a saída da ana chegar (carência de 200 ms; sob carga a desconexão demora mais que um tempo fixo).
  await expect(dono.janela.getByRole('list', { name: 'Membros' }).getByRole('listitem', { name: 'ana, offline' })).toBeVisible({ timeout: 10_000 });

  // Administrador abre a auditoria e filtra pela ana.
  await noMenu(dono.janela, 'Auditoria');
  const lista = dono.janela.getByRole('list', { name: 'Registros da auditoria' });
  await expect(lista).toContainText('dono criou a conta');
  await expect(lista).toContainText('dono ficou online');
  await dono.janela.getByLabel('Pessoa').selectOption({ label: 'ana' });
  await expect(lista).toContainText('ana ficou offline');
  await expect(lista).toContainText('ana ficou online');
  await expect(lista).toContainText('ana entrou com usuário e senha');
  await expect(lista).toContainText('ana criou a conta');
  await expect(lista).not.toContainText('dono');

  await dono.janela.getByRole('button', { name: 'Voltar' }).click();
  await expect(dono.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  await dono.app.close();
});
