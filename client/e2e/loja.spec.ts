import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

/** Pontos e loja: saldo no painel, compra de tema pela loja, prévia, saldo ao vivo e Aparência com cadeado. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/pontos-e-loja/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance & { banco: unknown; tempoReal: { avisarLoja(id: number): void } };
let url: string;
const abertos: ElectronApplication[] = [];
let anaId = 0;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-loja-'));
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

async function creditar(usuarioId: number, pontos: number) {
  const { creditar: creditarNoBanco } = await import('../../server/dist/dominio/loja.js');
  creditarNoBanco(servidor.banco as Parameters<typeof creditarNoBanco>[0], usuarioId, pontos, null);
  servidor.tempoReal.avisarLoja(usuarioId);
}

/** O dono (administrador da instalação) e a ana são criados pela API; a ana entra pelo app. */
async function entrarComoAna(): Promise<Page> {
  for (const usuario of ['dono', 'ana']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode, `cadastro de ${usuario}`).toBe(201);
    if (usuario === 'ana') anaId = r.json().usuario.id as number;
  }
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, 'ana') } });
  abertos.push(app);
  const j = await app.firstWindow();
  await j.getByLabel('Endereço do servidor').fill(url);
  await j.getByRole('button', { name: 'Conectar' }).click();
  await j.getByLabel('Nome de usuário').fill('ana');
  await j.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await j.getByRole('button', { name: 'Entrar' }).click();
  await expect(j.getByTestId('usuario-logado')).toHaveText('Olá, ana');
  return j;
}

test('pontos e loja: saldo no painel, prévia, compra, saldo ao vivo e Aparência com cadeado', async () => {
  const j = await entrarComoAna();
  // CA-19 (antes de comprar): os temas da loja aparecem com cadeado.
  await noMenu(j, 'Configurações');
  await expect(j.getByRole('radio', { name: /Cinzas do Trono/ })).toBeDisabled();
  await j.getByRole('button', { name: 'Voltar' }).first().click();
  await creditar(anaId, 700);
  const cartao = (nome: string) => j.getByRole('listitem').filter({ has: j.getByRole('heading', { name: nome, level: 3 }) });
  // CA-8: o saldo aparece no painel sem reabrir.
  await expect(j.getByTestId('saldo-painel')).toHaveText('700');

  await j.getByRole('button', { name: /pontos, abrir a loja/ }).click();
  await expect(j.getByRole('heading', { name: 'Loja', level: 1 })).toBeVisible();
  await expect(j.getByTestId('saldo-loja')).toHaveText('700 pontos');
  await j.waitForTimeout(400);
  await j.screenshot({ path: join(PRINTS, 'loja.png') });

  // CA-20: prévia troca o tema sem gravar e volta ao sair.
  // Sem atributo no <html>, o tema em uso é o padrão (neon).
  const antes = await j.evaluate(() => document.documentElement.dataset.tema || 'neon');
  await cartao('Arcano Dourado').getByRole('button', { name: 'Ver prévia' }).click();
  await expect.poll(() => j.evaluate(() => document.documentElement.dataset.tema)).toBe('arcano');
  await j.waitForTimeout(400);
  await j.screenshot({ path: join(PRINTS, 'loja-previa-arcano.png') });
  await j.getByRole('button', { name: 'Sair da prévia' }).click();
  await expect.poll(() => j.evaluate(() => document.documentElement.dataset.tema || 'neon')).toBe(antes);

  // CA-9: compra com confirmação; o saldo cai para 100 no painel.
  await cartao('Cinzas do Trono').getByRole('button', { name: 'Comprar por 600 pontos' }).click();
  await expect(j.getByRole('dialog', { name: 'Confirmar compra' })).toContainText('Comprar o tema Cinzas do Trono por 600 pontos?');
  await j.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(j.getByRole('status')).toHaveText('Cinzas do Trono é seu.');
  await expect(j.getByTestId('saldo-painel')).toHaveText('100');
  await expect(j.getByRole('list', { name: 'Extrato' })).toContainText('Tema Cinzas do Trono');

  // CA-8: crédito vindo do servidor aparece sem reabrir.
  await creditar(anaId, 50);
  await expect(j.getByTestId('saldo-painel')).toHaveText('150');

  // CA-19: em Aparência, o tema comprado se escolhe; o outro tem cadeado e leva à loja.
  await noMenu(j, 'Configurações');
  await expect(j.getByRole('radio', { name: /Arcano Dourado/ })).toBeDisabled();
  await j.getByRole('radio', { name: /Cinzas do Trono/ }).check();
  await expect.poll(() => j.evaluate(() => document.documentElement.dataset.tema)).toBe('cinzas');
  await j.waitForTimeout(400);
  await j.screenshot({ path: join(PRINTS, 'aparencia-cinzas.png') });
  await j.getByRole('button', { name: 'Arcano Dourado: liberar na loja' }).click();
  await expect(j.getByRole('heading', { name: 'Loja', level: 1 })).toBeVisible();
  await j.waitForTimeout(400);
  await j.screenshot({ path: join(PRINTS, 'loja-tema-cinzas.png') });
});
