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
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-lidas-'));
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

/** Troca a notificação real do sistema por um registro, no processo principal do app. */
async function interceptarNotificacoes(app: ElectronApplication) {
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { notificacoes: string[] };
    g.notificacoes = [];
    Notification.prototype.show = function (this: Electron.Notification) {
      g.notificacoes.push(`${this.title} | ${this.body}`);
    };
  });
  return () => app.evaluate(() => (globalThis as unknown as { notificacoes: string[] }).notificacoes);
}

test('CA-19: contador em conversa fechada some ao abrir; notificação fora da conversa e com o app sem foco; clique abre', async () => {
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const notificacoesDaAna = await interceptarNotificacoes(ana.app);

  // O dono cria #jogos e escreve lá; a ana está em #geral.
  await dono.janela.getByRole('button', { name: 'Criar canal de texto' }).click();
  await dono.janela.getByLabel('Nome do novo canal de texto').fill('jogos');
  await dono.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await dono.janela.getByLabel('Mensagem para #jogos').fill('bora jogar?');
  await dono.janela.getByLabel('Mensagem para #jogos').press('Enter');
  await dono.janela.getByLabel('Mensagem para #jogos').fill('agora!');
  await dono.janela.getByLabel('Mensagem para #jogos').press('Enter');

  const botaoJogos = ana.janela.getByRole('button', { name: /jogos/ });
  await expect(botaoJogos).toContainText('2 não lidas');
  await expect.poll(notificacoesDaAna).toEqual(['#jogos — dono | bora jogar?', '#jogos — dono | agora!']);

  // Abrir a conversa zera o contador (a leitura gravada no servidor é coberta em server/test/leituras.test.ts).
  await botaoJogos.click();
  await expect(ana.janela.getByRole('list', { name: 'Mensagens de #jogos' })).toContainText('agora!');
  await expect(botaoJogos).not.toContainText('não lida');

  // Com o app sem foco, mensagem na conversa aberta também notifica.
  await ana.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.blur());
  await dono.janela.getByLabel('Mensagem para #jogos').fill('cadê você?');
  await dono.janela.getByLabel('Mensagem para #jogos').press('Enter');
  await expect.poll(notificacoesDaAna).toContain('#jogos — dono | cadê você?');

  // Clique na notificação: o processo principal manda abrir a conversa da notificação (aqui, #geral).
  const geral = (servidor.banco.prepare("SELECT id FROM canais WHERE nome = 'geral'").get() as { id: number }).id;
  await ana.app.evaluate(({ BrowserWindow }, chave) => BrowserWindow.getAllWindows()[0]!.webContents.send('notificacao:abrir', chave), `c:${geral}`);
  await expect(ana.janela.getByLabel('Mensagem para #geral')).toBeVisible();

  // CA-19a (parte da DM): o dono manda DM; a ana vê o contador na DM e a notificação com o nome dele.
  await dono.janela.getByRole('button', { name: 'Conversar com ana' }).click();
  await dono.janela.getByLabel('Mensagem para ana').fill('psiu');
  await dono.janela.getByLabel('Mensagem para ana').press('Enter');
  const dmDaAna = ana.janela.getByRole('list', { name: 'Mensagens diretas' }).getByRole('button', { name: /dono/ });
  await expect(dmDaAna).toContainText('1 não lida');
  await expect.poll(notificacoesDaAna).toContain('dono | psiu');

  await ana.app.close();
  await dono.app.close();
});
