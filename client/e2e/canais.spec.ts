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
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-canais-'));
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

test('CA-12 e CA-13: membro cria e renomeia (o outro vê em menos de 2 s); só admin remove, com confirmação', async () => {
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);

  const textoDono = dono.janela.getByRole('list', { name: 'Canais de texto' });
  const textoAna = ana.janela.getByRole('list', { name: 'Canais de texto' });
  await expect(textoAna).toContainText('geral');
  await expect(ana.janela.getByRole('list', { name: 'Canais de voz' })).toContainText('Sala 1');

  // A ana cria #jogos: ele abre para ela e aparece para o dono em menos de 2 s.
  await ana.janela.getByRole('button', { name: 'Criar canal de texto' }).click();
  await ana.janela.getByLabel('Nome do novo canal de texto').fill('jogos');
  await ana.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(ana.janela.getByRole('heading', { name: 'jogos', exact: true })).toBeVisible();
  await expect(textoDono).toContainText('jogos', { timeout: 2000 });

  // Renomeia para #jogatina.
  await ana.janela.getByRole('button', { name: 'Renomear', exact: true }).click();
  await ana.janela.getByLabel('Novo nome do canal').fill('jogatina');
  await ana.janela.getByRole('button', { name: 'Salvar' }).click();
  await expect(textoDono).toContainText('jogatina', { timeout: 2000 });
  await expect(textoDono).not.toContainText('jogos');

  // Canal de voz também.
  await ana.janela.getByRole('button', { name: 'Criar canal de voz' }).click();
  await ana.janela.getByLabel('Nome do novo canal de voz').fill('Squad');
  await ana.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(dono.janela.getByRole('list', { name: 'Canais de voz' })).toContainText('Squad', { timeout: 2000 });

  // Canal de voz também se renomeia pela barra (qualquer membro); membro não vê o "remover" de voz.
  await ana.janela.getByRole('button', { name: 'Renomear canal de voz Sala 1' }).click();
  await ana.janela.getByLabel('Novo nome do canal de voz Sala 1').fill('Sala Neon');
  await ana.janela.getByRole('button', { name: 'Salvar' }).click();
  await expect(dono.janela.getByRole('list', { name: 'Canais de voz' })).toContainText('Sala Neon', { timeout: 2000 });
  await expect(ana.janela.getByRole('button', { name: /Remover canal de voz/ })).toHaveCount(0);

  // Membro não vê "Remover canal"; o dono remove com confirmação e some para a ana.
  await expect(ana.janela.getByRole('button', { name: 'Remover canal', exact: true })).toHaveCount(0);
  await dono.janela.getByRole('button', { name: /jogatina/ }).click();
  await dono.janela.getByRole('button', { name: 'Remover canal', exact: true }).click();
  await expect(dono.janela.getByText('Remover #jogatina e todo o histórico?')).toBeVisible();
  await dono.janela.getByRole('button', { name: 'Confirmar remoção' }).click();
  await expect(textoAna).not.toContainText('jogatina', { timeout: 2000 });
  // A ana estava em #jogatina: volta para o primeiro canal de texto.
  await expect(ana.janela.getByRole('heading', { name: 'geral', exact: true })).toBeVisible();

  // Auditoria por canal (CA-50 da T8): o dono filtra pela Sala "Squad".
  await dono.janela.getByRole('button', { name: 'Auditoria' }).click();
  await dono.janela.getByRole('combobox', { name: 'Canal' }).selectOption({ label: '🔊 Squad' });
  await expect(dono.janela.getByRole('list', { name: 'Registros da auditoria' })).toContainText('ana criou o canal "Squad"');

  await ana.app.close();
  await dono.app.close();
});
