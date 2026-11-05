import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance | undefined;
let porta = 0;
let url: string;

async function subirServidor() {
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({ LOG: 'false', BANCO: join(pasta, 'tofalando.db'), CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }),
  );
  await servidor.listen({ port: porta, host: '127.0.0.1' });
  porta = (servidor.server.address() as AddressInfo).port;
  url = `http://127.0.0.1:${porta}`;
}

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-chat-'));
  porta = 0;
  await subirServidor();
});

test.afterEach(async () => {
  await servidor?.close();
  servidor = undefined;
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

test('envio em tempo real entre dois apps, com várias linhas', async () => {
  const dono = await entrar('dono', true);
  await servidor!.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);

  const campo = ana.janela.getByLabel('Mensagem para #geral');
  await campo.fill('oi, pessoal!');
  await campo.press('Shift+Enter');
  await campo.pressSequentially('segunda linha');
  await campo.press('Enter');
  await expect(campo).toHaveValue('');

  const listaDono = dono.janela.getByRole('list', { name: 'Mensagens de #geral' });
  await expect(listaDono).toContainText('ana');
  await expect(listaDono.locator('.mensagem-texto').last()).toHaveText('oi, pessoal!\nsegunda linha');
  await ana.app.close();
  await dono.app.close();
});

test('CA-14 e CA-15: 500 mensagens paginadas ao rolar; histórico sobrevive a reiniciar o servidor', async () => {
  const dono = await entrar('dono', true);
  // CA-15 pelo app: envia pelo compositor antes de reiniciar.
  await dono.janela.getByLabel('Mensagem para #geral').fill('enviada antes de reiniciar');
  await dono.janela.getByLabel('Mensagem para #geral').press('Enter');
  await expect(dono.janela.locator('.mensagem-texto').last()).toHaveText('enviada antes de reiniciar');
  await dono.app.close();

  const banco = servidor!.banco;
  const canal = (banco.prepare("SELECT id FROM canais WHERE nome = 'geral'").get() as { id: number }).id;
  const inserir = banco.prepare('INSERT INTO mensagens (canal_id, autor_id, texto, criada_em) VALUES (?, 1, ?, ?)');
  banco.transaction(() => {
    for (let i = 1; i <= 500; i++) inserir.run(canal, `mensagem ${i}`, Date.now() - (500 - i) * 1000);
  })();

  // CA-15: reinicia o servidor (mesmo banco, mesma porta) antes de abrir o app.
  await servidor!.close();
  await subirServidor();

  const { app, janela } = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, 'dono') } }).then(
    async (a) => ({ app: a, janela: await a.firstWindow() }),
  );
  const lista = janela.getByRole('list', { name: 'Mensagens de #geral' });
  await expect(lista.locator('.mensagem-texto').last()).toHaveText('mensagem 500');
  await expect(lista.locator('li')).toHaveCount(50);

  // Rola até o topo repetidamente: cada chegada ao topo carrega a página anterior.
  const rolagem = janela.locator('.chat .mensagens');
  for (let i = 0; i < 20; i++) {
    if (await janela.getByText('Este é o começo de #geral.').isVisible()) break;
    await rolagem.evaluate((el) => (el.scrollTop = 0));
    await janela.waitForTimeout(150);
  }
  await expect(janela.getByText('Este é o começo de #geral.')).toBeVisible();
  await expect(lista.locator('li')).toHaveCount(501);
  await expect(lista.locator('.mensagem-texto').first()).toHaveText('enviada antes de reiniciar');
  await expect(lista.locator('.mensagem-texto').nth(1)).toHaveText('mensagem 1');
  await app.close();
});
