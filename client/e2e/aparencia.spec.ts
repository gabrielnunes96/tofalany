import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu, secaoConfig, fecharConfig } from './menu';

/** Backlog v2 (P2): temas, painel compacto e ocultar partes da tela. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v2/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-aparencia-'));
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

async function abrir(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  abertos.push(app);
  return { app, janela: await app.firstWindow() };
}

async function cadastrarDono(): Promise<{ app: ElectronApplication; janela: Page }> {
  const d = await abrir('dono');
  await d.janela.getByLabel('Endereço do servidor').fill(url);
  await d.janela.getByRole('button', { name: 'Conectar' }).click();
  await d.janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await d.janela.getByLabel('Código de convite').fill(CONVITE);
  await d.janela.getByLabel('Nome de usuário').fill('dono');
  await d.janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await d.janela.getByLabel('Confirmar senha').count()) await d.janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await d.janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(d.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return d;
}

test('backlog v2, item 9: trocar o tema em Configurações vale na hora e fica guardado', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  const fundo = () => j.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const neon = await fundo();
  await j.screenshot({ path: join(PRINTS, 'tema-neon.png') });
  // Backlog v2, item 8: painel compacto; as opções ficam no menu ⚙️.
  await j.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(j.locator('#menu-usuario')).toContainText('Auditoria');
  await j.waitForTimeout(300);
  await j.screenshot({ path: join(PRINTS, 'painel-menu-aberto.png') });
  await j.keyboard.press('Escape');
  await expect(j.locator('#menu-usuario')).toHaveCount(0);

  await noMenu(j, 'Configurações');
  await secaoConfig(j, 'Aparência');
  await j.getByRole('radio', { name: /Aurora/ }).check();
  await expect.poll(() => j.evaluate(() => document.documentElement.dataset.tema)).toBe('aurora');
  expect(await fundo()).not.toBe(neon);
  await fecharConfig(j);
  await j.screenshot({ path: join(PRINTS, 'tema-aurora.png') });

  await noMenu(j, 'Configurações');
  await secaoConfig(j, 'Aparência');
  await j.getByRole('radio', { name: /Breu/ }).check();
  await fecharConfig(j);
  await j.screenshot({ path: join(PRINTS, 'tema-breu.png') });

  // Reabrir o app: o tema escolhido vem antes de tudo.
  await dono.app.close();
  const de_novo = await abrir('dono');
  await expect(de_novo.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  await expect.poll(() => de_novo.janela.evaluate(() => document.documentElement.dataset.tema)).toBe('breu');
});

test('backlog v2, item 10: esconder canais (Ctrl+B) e membros (botão); a escolha fica guardada', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  const canais = j.getByRole('list', { name: 'Canais de texto' });
  const membros = j.getByRole('list', { name: 'Membros' });
  await expect(canais).toBeVisible();

  await j.keyboard.press('Control+b');
  await expect(canais).toBeHidden();
  await j.getByRole('button', { name: 'Mostrar membros' }).click();
  await expect(membros).toBeHidden();
  // A conversa ocupa a largura toda e segue usável.
  await j.getByLabel('Mensagem para #geral').fill('tela limpa');
  await j.getByLabel('Mensagem para #geral').press('Enter');
  await expect(j.getByRole('list', { name: 'Mensagens de #geral' })).toContainText('tela limpa');
  await j.screenshot({ path: join(PRINTS, 'paineis-ocultos.png') });

  await dono.app.close();
  const de_novo = await abrir('dono');
  await expect(de_novo.janela.getByLabel('Mensagem para #geral')).toBeVisible();
  await expect(de_novo.janela.getByRole('list', { name: 'Canais de texto' })).toBeHidden();
  await de_novo.janela.getByRole('button', { name: 'Mostrar canais' }).click();
  await de_novo.janela.keyboard.press('Control+m');
  await expect(de_novo.janela.getByRole('list', { name: 'Canais de texto' })).toBeVisible();
  await expect(de_novo.janela.getByRole('list', { name: 'Membros' })).toBeVisible();
});

test('backlog v2, item 10b: link vira clicável, com cartão de prévia; no YouTube, "Assistir" abre o player', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  // A prévia vem do servidor (que buscaria o YouTube); aqui ela é respondida sem internet.
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await j.route('**/api/previa?*', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=TDmH-2Zs9_8', tipo: 'youtube', videoId: 'TDmH-2Zs9_8', site: 'YouTube', titulo: 'Jogo de terror', descricao: 'Hollow', imagem: pixel }),
    }),
  );
  await j.getByLabel('Mensagem para #geral').fill('olha esse https://www.youtube.com/watch?v=TDmH-2Zs9_8.');
  await j.getByLabel('Mensagem para #geral').press('Enter');
  const lista = j.getByRole('list', { name: 'Mensagens de #geral' });
  await expect(lista.getByRole('link', { name: 'https://www.youtube.com/watch?v=TDmH-2Zs9_8', exact: true })).toBeVisible();
  const cartao = lista.getByRole('article', { name: 'Prévia: Jogo de terror' });
  await expect(cartao).toContainText('YouTube');
  await expect(cartao).toContainText('Hollow');
  await cartao.getByRole('button', { name: 'Assistir Jogo de terror aqui' }).click();
  await expect(cartao.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/TDmH-2Zs9_8\?/);
  await j.screenshot({ path: join(PRINTS, 'previa-youtube.png') });
  await cartao.getByRole('button', { name: 'Fechar vídeo' }).click();
  await expect(cartao.locator('iframe')).toHaveCount(0);
});

test('previa-transmissao CA-5: com duas transmissões assistidas numa janela de 900 px, o chat mostra ao menos 8 linhas', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  await dono.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1200, 900));
  await expect(j.locator('.conteudo > .canal-aberto .chat .mensagens')).toBeVisible();
  // Dois painéis de transmissão assistida (16:9), como o PainelTransmissao desenha, antes da conversa.
  await j.evaluate(() => {
    const conteudo = document.querySelector('.conteudo')!;
    const conversa = conteudo.querySelector(':scope > .canal-aberto')!;
    for (let i = 0; i < 2; i++) {
      const s = document.createElement('section');
      s.className = 'transmissao-grande';
      s.innerHTML = '<video width="1920" height="1080"></video><div class="transmissao-acoes"><span>tela</span><button>x</button></div>';
      conteudo.insertBefore(s, conversa);
    }
  });
  const medidas = await j.evaluate(() => {
    const lista = document.querySelector<HTMLElement>('.conteudo > .canal-aberto .chat .mensagens')!;
    const linha = parseFloat(getComputedStyle(document.body).lineHeight) || 24;
    const videos = [...document.querySelectorAll<HTMLVideoElement>('.conteudo > .transmissao-grande video')].map((v) => ({ r: v.getBoundingClientRect(), ajuste: getComputedStyle(v).objectFit }));
    const visivel = Math.min(lista.getBoundingClientRect().bottom, window.innerHeight) - Math.max(lista.getBoundingClientRect().top, 0);
    return { visivel, linha, videos: videos.map((v) => ({ a: v.r.height, ajuste: v.ajuste })) };
  });
  expect(medidas.visivel).toBeGreaterThanOrEqual(8 * medidas.linha);
  // Os vídeos encolhem (a imagem mantém a proporção dentro do quadro).
  for (const v of medidas.videos) {
    expect(v.a).toBeLessThan(0.6 * 900);
    expect(v.ajuste).toBe('contain');
  }
  await j.screenshot({ path: join(__dirname, '../../docs/demandas/previa-transmissao/chat-com-duas-transmissoes.png') });
});

test('organizar-a-tela CA-1, CA-2, CA-3: divisória da coluna de canais, guardada ao reabrir; a conversa nunca fica com menos de 360 px', async () => {
  const dono = await cadastrarDono();
  const j = dono.janela;
  await dono.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 860));
  const divisoria = j.getByRole('separator', { name: 'Largura da coluna de canais' });
  const largura = () => j.locator('.coluna-esquerda').evaluate((e) => Math.round(e.getBoundingClientRect().width));
  await expect.poll(largura).toBe(250);
  // CA-1: arrastar 70 px para a direita.
  const caixa = (await divisoria.boundingBox())!;
  await j.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await j.mouse.down();
  await j.mouse.move(caixa.x + caixa.width / 2 + 70, caixa.y + caixa.height / 2, { steps: 5 });
  await j.mouse.up();
  await expect.poll(largura).toBe(320);
  // CA-3: 3 setas para a direita, 30 px a mais.
  await divisoria.focus();
  for (let i = 0; i < 3; i++) await j.keyboard.press('ArrowRight');
  await expect.poll(largura).toBe(350);
  await j.keyboard.press('ArrowLeft');
  await j.keyboard.press('ArrowLeft');
  await j.keyboard.press('ArrowLeft');
  await expect.poll(largura).toBe(320);
  await j.waitForTimeout(300);
  await dono.app.close();

  const reaberto = await abrir('dono');
  const r = reaberto.janela;
  await expect(r.getByRole('list', { name: 'Membros' })).toBeVisible({ timeout: 15_000 });
  await reaberto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 860));
  const larguraR = () => r.locator('.coluna-esquerda').evaluate((e) => Math.round(e.getBoundingClientRect().width));
  await expect.poll(larguraR).toBe(320);
  // CA-2: numa janela estreita, alargar ao máximo deixa a conversa com pelo menos 360 px.
  await reaberto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 860));
  await r.getByRole('separator', { name: 'Largura da coluna de canais' }).focus();
  await r.keyboard.press('End');
  await r.getByRole('separator', { name: 'Largura da coluna de membros' }).focus();
  await r.keyboard.press('End');
  await expect.poll(() => r.locator('.layout-colunas > .conteudo').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(359);
  await r.screenshot({ path: join(__dirname, '../../docs/demandas/organizar-a-tela/colunas-900px.png') });
  // Duplo clique volta ao padrão.
  await reaberto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 860));
  await r.getByRole('separator', { name: 'Largura da coluna de canais' }).dblclick();
  await expect.poll(larguraR).toBe(250);
});
