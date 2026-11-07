import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v1/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
/** Apps abertos no teste; os que sobrarem (teste que falhou no meio) são fechados no afterEach. */
const abertos: ElectronApplication[] = [];
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-lidas-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000', CARENCIA_OFFLINE_MS: '1500' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

/** Botão do canal na barra (não confunde com outros botões que citam o canal). */
const canal = (j: Page, nome: string) => j.getByRole('list', { name: 'Canais de texto' }).getByRole('button', { name: new RegExp(nome) });

/** Reabre o app de quem já entrou (a sessão está salva). */
async function abrirLogado(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  const janela = await app.firstWindow();
  await expect(janela.getByLabel('Mensagem para #geral')).toBeVisible();
  return { app, janela };
}

async function entrar(nome: string, criar: boolean): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
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
  // A ana já conectada ao tempo real (vê o dono online) antes das mensagens: as que chegam durante a conexão
  // são outro caso (anotado no backlog v2).
  await expect(ana.janela.getByRole('list', { name: 'Membros' }).getByRole('listitem', { name: 'dono, online' })).toBeVisible();

  // O dono cria #jogos e escreve lá; a ana está em #geral.
  await dono.janela.getByRole('button', { name: 'Criar canal de texto' }).click();
  await dono.janela.getByLabel('Nome do novo canal de texto').fill('jogos');
  await dono.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await dono.janela.getByLabel('Mensagem para #jogos').fill('bora jogar?');
  await dono.janela.getByLabel('Mensagem para #jogos').press('Enter');
  await dono.janela.getByLabel('Mensagem para #jogos').fill('agora!');
  await dono.janela.getByLabel('Mensagem para #jogos').press('Enter');

  const botaoJogos = ana.janela.getByRole('list', { name: 'Canais de texto' }).getByRole('button', { name: /jogos/ });
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

test('CA-59, CA-60, CA-61: conversa silenciada, notificações desligadas e aviso de entrada/saída do servidor', async () => {
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  for (const nome of ['ana', 'bia']) await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: nome, senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const anaConectouEm = Date.now();
  const notificacoesDaAna = await interceptarNotificacoes(ana.app);
  const a = ana.janela;
  const d = dono.janela;
  const escrever = async (nomeCanal: string, texto: string) => {
    await canal(d, nomeCanal).click();
    await d.getByLabel(`Mensagem para #${nomeCanal}`).fill(texto);
    await d.getByLabel(`Mensagem para #${nomeCanal}`).press('Enter');
  };
  for (const nome of ['jogos', 'ruido']) {
    await d.getByRole('button', { name: 'Criar canal de texto' }).click();
    await d.getByLabel('Nome do novo canal de texto').fill(nome);
    await d.getByRole('button', { name: 'Criar', exact: true }).click();
  }

  // CA-60: a ana silencia #jogos; mensagem lá só conta; em #ruido notifica.
  await canal(a, 'jogos').click();
  await a.getByRole('button', { name: 'Silenciar notificações de #jogos' }).click();
  await expect(a.getByRole('button', { name: 'Silenciar notificações de #jogos' })).toHaveAttribute('aria-pressed', 'true');
  await canal(a, 'geral').click();
  await escrever('jogos', 'psiu');
  await expect(canal(a, 'jogos')).toContainText('1');
  await escrever('ruido', 'oi');
  await expect.poll(notificacoesDaAna).toEqual(['#ruido — dono | oi']);
  await a.screenshot({ path: join(PRINTS, 'T29-jogos-silenciado.png') });

  // CA-59: notificações de mensagem desligadas — só conta.
  await noMenu(a, 'Configurações');
  await a.getByLabel('Notificações de mensagens').uncheck();
  await escrever('ruido', 'de novo');
  await expect(canal(a, 'ruido')).toContainText('2');
  await a.waitForTimeout(500);
  expect(await notificacoesDaAna()).toEqual(['#ruido — dono | oi']);

  // CA-61: a bia entra e sai do servidor — som e aviso na ana.
  const somDa = () => a.evaluate(() => document.documentElement.dataset.somVoz ?? '');
  // Logo depois de conectar, entradas e saídas não avisam (5 s): espera passar.
  await a.waitForTimeout(Math.max(0, 5500 - (Date.now() - anaConectouEm)));
  const bia = await entrar('bia', false);
  await expect.poll(notificacoesDaAna).toContain('ToFalany | bia entrou');
  expect(await somDa()).toMatch(/^servidor-entrou:/);
  await bia.app.close();
  await expect.poll(notificacoesDaAna, { timeout: 10_000 }).toContain('ToFalany | bia saiu');
  expect(await somDa()).toMatch(/^servidor-saiu:/);

  // Desligados os dois: a bia volta, o status muda, mas nada toca nem aparece.
  await a.getByLabel('Som quando alguém entra ou sai do servidor').uncheck();
  await a.getByLabel('Notificação quando alguém entra ou sai do servidor').uncheck();
  await a.screenshot({ path: join(PRINTS, 'T29-configuracoes-notificacoes.png') });
  const quantas = (await notificacoesDaAna()).length;
  const somAntes = await somDa();
  const bia2 = await abrirLogado('bia');
  await expect(a.getByRole('list', { name: 'Membros' }).getByRole('listitem', { name: 'bia, online' })).toBeVisible();
  await a.waitForTimeout(500);
  expect((await notificacoesDaAna()).length).toBe(quantas);
  expect(await somDa()).toBe(somAntes);

  await bia2.app.close();
  await dono.app.close();
  await ana.app.close();
});
