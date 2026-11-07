import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { itensDoMenu, noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v1/prints');

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-sons-'));
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

/** WAV PCM 8 kHz mono 16 bits com `segundos` de silêncio. */
function wav(segundos: number): Buffer {
  const dados = 8000 * 2 * segundos;
  const b = Buffer.alloc(44 + dados);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + dados, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(dados, 40);
  return b;
}

test('CA-31: administrador cadastra, ouve, renomeia e remove sons; 15 s é recusado', async () => {
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  expect(await itensDoMenu(ana.janela)).not.toContain('Soundboard');

  const j = dono.janela;
  await noMenu(j, 'Soundboard');
  await expect(j.getByText('Nenhum som cadastrado ainda.')).toBeVisible();

  await j.getByLabel('Nome do som').fill('Grilo');
  await j.getByLabel('Arquivo de áudio').setInputFiles({ name: 'grilo.wav', mimeType: 'audio/wav', buffer: wav(8) });
  await j.getByRole('button', { name: 'Cadastrar som' }).click();
  await expect(j.getByRole('status')).toContainText('Som "Grilo" cadastrado.');
  const item = j.getByRole('listitem', { name: 'Grilo' });
  await expect(item.getByText('8,0 s')).toBeVisible();
  // Prévia: o áudio servido pelo servidor carrega no player.
  const duracao = await item.locator('audio').evaluate(
    (a: HTMLAudioElement) =>
      new Promise<number>((r) => {
        a.addEventListener('loadedmetadata', () => r(a.duration), { once: true });
        a.load();
      }),
  );
  expect(Math.round(duracao)).toBe(8);
  await j.screenshot({ path: join(PRINTS, 'T18-soundboard-admin.png') });

  await j.getByLabel('Nome do som').fill('Longo');
  await j.getByLabel('Arquivo de áudio').setInputFiles({ name: 'longo.wav', mimeType: 'audio/wav', buffer: wav(15) });
  await j.getByRole('button', { name: 'Cadastrar som' }).click();
  await expect(j.getByRole('alert')).toContainText('no máximo 10 segundos');

  await item.getByRole('button', { name: 'Renomear' }).click();
  await item.getByLabel('Novo nome de Grilo').fill('Grilo 2');
  await item.getByRole('button', { name: 'Salvar' }).click();
  const renomeado = j.getByRole('listitem', { name: 'Grilo 2' });
  await expect(renomeado).toBeVisible();

  // Lista pública (o aviso por socket aos membros é coberto no teste do servidor; tocar é da T19).
  const lista = await servidor.inject({ method: 'GET', url: '/api/sons', headers: { authorization: `Bearer ${(await servidor.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'senha-forte-1' } })).json().token}` } });
  expect(lista.json()).toMatchObject([{ nome: 'Grilo 2', duracaoMs: 8000 }]);

  await renomeado.getByRole('button', { name: 'Remover' }).click();
  await renomeado.getByRole('button', { name: 'Confirmar remoção' }).click();
  await expect(j.getByText('Nenhum som cadastrado ainda.')).toBeVisible();

  await dono.app.close();
  await ana.app.close();
});
