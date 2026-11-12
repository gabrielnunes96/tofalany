import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu, secaoConfig, fecharConfig } from './menu';

/** 0.15.1: configurações em janela com seções, autenticação em dois fatores e as novidades de novo. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/ajustes-0-15-1/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-seguranca-'));
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

/** Abre um app novo (pasta de dados própria = outro computador) e preenche usuário e senha. */
async function entrar(pastaApp: string): Promise<Page> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, pastaApp) } });
  abertos.push(app);
  const j = await app.firstWindow();
  await j.getByLabel('Endereço do servidor').fill(url);
  await j.getByRole('button', { name: 'Conectar' }).click();
  await j.getByLabel('Nome de usuário').fill('ana');
  await j.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await j.getByRole('button', { name: 'Entrar' }).click();
  return j;
}

async function codigoAgora(segredo: string): Promise<string> {
  const { codigoDoPasso, passoDe } = await import('../../server/dist/auth/totp.js');
  // Passo seguinte ao atual: o servidor aceita um de folga e não repete o que ligou.
  return codigoDoPasso(segredo, passoDe(Date.now()) + 1);
}

test('configurações em janela; 2FA ligado pelo app é pedido só no login de um computador novo; novidades de novo', async () => {
  for (const usuario of ['dono', 'ana']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode).toBe(201);
  }
  const j = await entrar('ana-pc1');
  await expect(j.getByTestId('usuario-logado')).toHaveText('Olá, ana');

  // Meu perfil abre a janela de configurações na seção Minha conta.
  await noMenu(j, 'Meu perfil');
  const dialogo = j.getByRole('dialog', { name: 'Configurações' });
  await expect(dialogo.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
  await j.getByRole('button', { name: 'Ligar a autenticação em dois fatores' }).click();
  await j.getByLabel('Confirme a sua senha').fill('Senha-forte-1');
  await j.getByRole('button', { name: 'Continuar' }).click();
  await expect(j.getByRole('img', { name: 'QR code para o app de autenticação' })).toBeVisible();
  await j.waitForTimeout(300);
  await j.screenshot({ path: join(PRINTS, 'dois-fatores-qr.png') });
  const segredo = (await j.getByTestId('segredo-2fa').textContent())!.replace(/\s/g, '');
  const { codigoDoPasso, passoDe } = await import('../../server/dist/auth/totp.js');
  await j.getByLabel('Código do app').fill(codigoDoPasso(segredo, passoDe(Date.now())));
  await j.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(j.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem')).toHaveCount(8);
  await j.getByRole('button', { name: 'Já guardei' }).click();
  await expect(j.getByText('8 códigos de recuperação sem usar')).toBeVisible();

  // Novidades de novo, na mesma janela.
  await secaoConfig(j, 'Novidades');
  await expect(j.getByRole('region', { name: 'Versão 0.15.0' })).toContainText('Loja de pontos');
  await j.waitForTimeout(300);
  await j.screenshot({ path: join(PRINTS, 'configuracoes-novidades.png') });
  await fecharConfig(j);

  // Outro computador: depois da senha, pede o código; com o código certo, entra.
  const k = await entrar('ana-pc2');
  await expect(k.getByLabel('Código de autenticação')).toBeVisible();
  await k.getByLabel('Código de autenticação').fill('000000');
  await k.getByRole('button', { name: 'Entrar' }).click();
  await expect(k.getByRole('alert')).toContainText('Código incorreto');
  await k.getByLabel('Código de autenticação').fill(await codigoAgora(segredo));
  await k.getByRole('button', { name: 'Entrar' }).click();
  await expect(k.getByTestId('usuario-logado')).toHaveText('Olá, ana');
});
