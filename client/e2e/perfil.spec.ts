import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-perfil-'));
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
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click();
  await expect(janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return { app, janela };
}

test('CA-8: avatar 1000×800 vira 256×256; nome e cor mudam; o outro membro vê sem reiniciar', async () => {
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'Senha-forte-1' } });
  const ana = await entrar('ana', false);
  const listaDaAna = ana.janela.getByRole('list', { name: 'Membros' });
  await expect(listaDaAna).toContainText('dono');

  const { default: sharp } = await import('sharp');
  const png = await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#22aa66' } }).png().toBuffer();

  await noMenu(dono.janela, 'Meu perfil');
  await dono.janela.getByLabel('Arquivo da foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await expect(dono.janela.getByRole('status')).toHaveText('Foto atualizada.');
  await dono.janela.getByLabel('Nome de exibição').fill('Dono do Grupo');
  await dono.janela.getByLabel('Cor do perfil').fill('#ff8800');
  await dono.janela.getByRole('button', { name: 'Salvar' }).click();
  await expect(dono.janela.getByRole('status')).toHaveText('Perfil salvo.');
  await dono.janela.getByRole('button', { name: 'Voltar' }).click();
  await expect(dono.janela.getByTestId('usuario-logado')).toHaveText('Olá, Dono do Grupo');

  // A cor ficou gravada (ela aparece no avatar de quem não tem foto).
  const lista = await servidor.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'dono', senha: 'Senha-forte-1' } });
  expect(lista.json().usuario.cor).toBe('#ff8800');

  // A ana vê o novo nome e a foto 256×256 sem reiniciar.
  await expect(listaDaAna).toContainText('Dono do Grupo');
  const item = listaDaAna.getByRole('listitem').filter({ hasText: 'Dono do Grupo' });
  const foto = item.locator('img.avatar');
  await expect(foto).toHaveAttribute('src', /\/files\/[0-9a-f]{32}\.webp$/);
  await expect.poll(() => foto.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([256, 256]);

  // Formato errado é recusado na tela.
  await noMenu(dono.janela, 'Meu perfil');
  await dono.janela.getByLabel('Arquivo da foto').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
  await expect(dono.janela.getByRole('alert')).toHaveText('Use uma imagem PNG, JPEG, GIF ou WebP.');

  await ana.app.close();
  await dono.app.close();
});
