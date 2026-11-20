import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Mini perfil (T8): cartão, mensagem direta pelo cartão, fundo em GIF, lista de membros e perfil completo. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/mini-perfil/prints');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance;
let url: string;
const abertos: ElectronApplication[] = [];

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-perfil-'));
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

async function entrar(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome), TOFALANDO_MIDIA_FALSA: '1' } });
  abertos.push(app);
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Entrar' }).click();
  await expect(janela.getByLabel('Mensagem para #geral')).toBeVisible();
  return { app, janela };
}

async function gifDeFundo(): Promise<Buffer> {
  const quadro = (cor: string) => sharp({ create: { width: 500, height: 200, channels: 3, background: cor } }).png().toBuffer();
  return sharp([await quadro('#7b2ff7'), await quadro('#f107a3')], { join: { animated: true } }).gif({ loop: 0 }).toBuffer();
}

function multipart(dados: Buffer) {
  const limite = '----e2e' + Math.random().toString(16).slice(2);
  return {
    payload: Buffer.concat([Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="fundo.gif"\r\nContent-Type: image/gif\r\n\r\n`), dados, Buffer.from(`\r\n--${limite}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

test('cartão pelo autor, pela menção e pela lista; Enter manda DM; fundo em GIF; perfil completo; nada sai do servidor (CA-1, CA-2, CA-4, CA-6, CA-8, CA-10, CA-14)', async () => {
  test.setTimeout(120_000);
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  for (const usuario of ['dono', 'ana', 'beto', 'caio']) {
    const r = (await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } })).json();
    tokens[usuario] = r.token;
    ids[usuario] = r.usuario.id;
  }
  // O caio é amigo da ana e do beto (amigo em comum).
  const banco = (servidor as unknown as { banco: { prepare(s: string): { run(...a: unknown[]): unknown } } }).banco;
  for (const outro of [ids.ana!, ids.beto!]) {
    const [a, b] = [outro, ids.caio!].sort((x, y) => x - y);
    banco.prepare('INSERT INTO amizades (usuario_a, usuario_b, pedido_por, aceita, criado_em) VALUES (?, ?, ?, 1, ?)').run(a, b, a, Date.now());
  }
  await servidor.inject({ method: 'PATCH', url: '/api/eu', headers: { authorization: `Bearer ${tokens.beto}` }, payload: { sobreMim: 'Joga de suporte, fala pouco.' } });

  const ana = await entrar('ana');
  const beto = await entrar('beto');

  // O beto envia o fundo em GIF; a ana vê ao vivo.
  const envio = multipart(await gifDeFundo());
  const fundo = await servidor.inject({ method: 'PUT', url: '/api/eu/fundo', payload: envio.payload, headers: { ...envio.headers, authorization: `Bearer ${tokens.beto}` } });
  expect(fundo.statusCode).toBe(200);

  const campoBeto = beto.janela.getByLabel('Mensagem para #geral');
  await campoBeto.fill('oi @ana, bora?');
  await campoBeto.press('Enter');

  // CA-1: clique no nome do autor.
  const msg = ana.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await msg.getByRole('button', { name: 'beto', exact: true }).click();
  const cartao = ana.janela.getByRole('dialog', { name: 'Perfil de beto' });
  await expect(cartao).toContainText('Joga de suporte, fala pouco.');
  await expect(cartao).toContainText('Membro desde');
  await expect(cartao.locator('.cartao-pessoa-comum')).toHaveText('1 amigo em comum · 1 servidor em comum');
  const fundoCartao = await cartao.locator('.cartao-pessoa-fundo').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(fundoCartao).toMatch(/\/files\/[0-9a-f]{32}\.webp/);
  await ana.janela.waitForTimeout(300);
  await ana.janela.screenshot({ path: join(PRINTS, 'cartao.png') });

  // CA-12: Esc fecha e devolve o foco.
  await ana.janela.keyboard.press('Escape');
  await expect(cartao).toBeHidden();

  // CA-2: pela lista de membros (a linha mostra só a miniatura parada, CA-14).
  const linhaBeto = ana.janela.getByRole('list', { name: 'Membros' }).getByRole('listitem', { name: /^beto/ });
  await expect(linhaBeto).toHaveClass(/com-fundo/);
  const fundoLinha = await linhaBeto.evaluate((e) => e.style.getPropertyValue('--fundo-membro'));
  const u = fundo.json() as { fundo: { url: string; miniUrl: string } };
  expect(fundoLinha).toContain(u.fundo.miniUrl);
  expect(fundoLinha).not.toContain(u.fundo.url);
  await ana.janela.screenshot({ path: join(PRINTS, 'lista-membros.png') });
  await linhaBeto.getByRole('button', { name: 'Perfil de beto' }).click();
  await expect(cartao).toBeVisible();

  // RF-3/CA-10: perfil completo com o amigo e o servidor em comum.
  await cartao.getByRole('button', { name: 'Ver perfil' }).click();
  const completo = ana.janela.getByRole('dialog', { name: 'Perfil de beto' });
  await expect(completo.getByRole('heading', { name: '1 amigo em comum' })).toBeVisible();
  await expect(completo).toContainText('caio');
  await expect(completo.getByRole('heading', { name: '1 servidor em comum' })).toBeVisible();
  await ana.janela.waitForTimeout(300);
  await ana.janela.screenshot({ path: join(PRINTS, 'perfil-completo.png') });
  await ana.janela.keyboard.press('Escape');

  // CA-2: pela menção (o beto abre o cartão da ana).
  const naMencao = beto.janela.getByRole('listitem', { name: 'Mensagem de beto' }).getByRole('button', { name: '@ana' });
  await naMencao.click();
  await expect(beto.janela.getByRole('dialog', { name: 'Perfil de ana' })).toBeVisible();
  await beto.janela.keyboard.press('Escape');

  // CA-4: Enter no campo do cartão abre a DM e a mensagem chega ao beto.
  await msg.getByRole('button', { name: 'beto', exact: true }).click();
  await cartao.getByRole('textbox', { name: 'Mensagem para @beto' }).fill('bora jogar?');
  await cartao.getByRole('textbox', { name: 'Mensagem para @beto' }).press('Enter');
  await expect(ana.janela.getByRole('list', { name: 'Mensagens com beto' })).toContainText('bora jogar?');
  await beto.janela.getByRole('tab', { name: /Amigos/ }).click();
  await beto.janela.getByRole('list', { name: 'Mensagens diretas' }).getByRole('button', { name: /^ana/ }).click();
  await expect(beto.janela.getByRole('list', { name: 'Mensagens com ana' })).toContainText('bora jogar?');

  // CA-8: nenhum pedido saiu do host do servidor.
  for (const lado of [ana, beto]) {
    const vistos = await lado.app.evaluate(() => (globalThis as unknown as { __redeVista: { url: string; ok: boolean }[] }).__redeVista);
    const fora = vistos.filter((v) => /^(https?|wss?):/.test(v.url) && new URL(v.url).hostname !== '127.0.0.1' && !v.url.startsWith('http://localhost'));
    expect(fora).toEqual([]);
  }
});
