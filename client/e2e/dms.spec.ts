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
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-dms-'));
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
  await expect(janela.getByLabel('Mensagem para #geral')).toBeVisible();
  return { app, janela };
}

test('CA-19a e CA-19b: DM com texto e imagem só para os dois; edição chega; o admin não vê nem lê', async () => {
  test.setTimeout(90_000);
  const dono = await entrar('dono', true);
  for (const nome of ['ana', 'bia']) {
    await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: nome, senha: 'senha-forte-1' } });
  }
  const ana = await entrar('ana', false);
  const bia = await entrar('bia', false);

  // A ana abre a conversa com a bia pela lista de membros.
  await ana.janela.getByRole('button', { name: 'Conversar com bia' }).click();
  await expect(ana.janela.getByRole('heading', { name: 'bia' })).toBeVisible();
  const campo = ana.janela.getByLabel('Mensagem para bia');
  await campo.fill('segredo entre nós');
  await campo.press('Enter');
  const { default: sharp } = await import('sharp');
  const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#ff2a6d' } }).png().toBuffer();
  await ana.janela.getByLabel('Arquivos para anexar').setInputFiles({ name: 'neon.png', mimeType: 'image/png', buffer: png });
  await expect(ana.janela.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  await ana.janela.getByRole('button', { name: 'Enviar' }).click();

  // A bia vê a DM aparecer na barra e lê texto e imagem.
  const dmsDaBia = bia.janela.getByRole('list', { name: 'Mensagens diretas' });
  await expect(dmsDaBia).toContainText('ana');
  await dmsDaBia.getByRole('button', { name: /ana/ }).click();
  const listaBia = bia.janela.getByRole('list', { name: 'Mensagens com ana' });
  await expect(listaBia).toContainText('segredo entre nós');
  await expect(listaBia.getByRole('button', { name: 'Ampliar imagem neon.png' })).toBeVisible();

  // CA-19b: a ana edita a própria; a bia vê "(editada)".
  const minha = ana.janela.getByRole('list', { name: 'Mensagens com bia' }).getByRole('listitem', { name: 'Mensagem de ana' }).first();
  await minha.hover();
  await minha.getByRole('button', { name: 'Editar' }).click();
  await minha.getByLabel('Editar mensagem').fill('segredo editado');
  await minha.getByLabel('Editar mensagem').press('Enter');
  await expect(listaBia).toContainText('segredo editado');
  await expect(listaBia).toContainText('(editada)');

  // O dono (admin) não tem essa conversa e o servidor recusa ler o histórico.
  await expect(dono.janela.getByRole('list', { name: 'Mensagens diretas' })).not.toContainText('ana');
  const dmId = (servidor.banco.prepare('SELECT id FROM dms').get() as { id: number }).id;
  const login = (await servidor.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'dono', senha: 'senha-forte-1' } })).json();
  const tentativa = await servidor.inject({ method: 'GET', url: `/api/dms/${dmId}/mensagens`, headers: { authorization: `Bearer ${login.token}` } });
  expect(tentativa.statusCode).toBe(403);

  await bia.app.close();
  await ana.app.close();
  await dono.app.close();
});
