import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

/** Busca de GIF (T5): Klipy falsa no mesmo host do servidor, dois apps abertos. */
const principal = join(__dirname, '../out/main/index.js');
const PRINTS = join(__dirname, '../../docs/demandas/busca-de-gif/prints');
const CONVITE = 'convite-e2e';
const CHAVE = 'chave-e2e-123';
/** GIF animado de 2 quadros, 2×2 (vermelho e azul). */
const GIF_BYTES = Buffer.from('R0lGODlhAgACAPABAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==', 'base64');

let pasta: string;
let servidor: FastifyInstance;
let klipy: Server;
let url: string;
let base: string;
const pedidosKlipy: { metodo: string; caminho: string; corpo?: string }[] = [];
const abertos: ElectronApplication[] = [];

function item(slug: string, titulo: string) {
  const fmt = (lado: number) => ({ webp: { url: `${base}/ii/${slug}-${lado}.webp`, width: lado, height: lado, size: 100 } });
  return { id: 1, slug, title: titulo, type: 'gif', file: { sm: fmt(120), md: fmt(240) } };
}

/** Klipy falsa: em alta, busca, registro de envio e as imagens. */
function subirKlipy(): Promise<string> {
  klipy = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      pedidosKlipy.push({ metodo: req.method!, caminho: u.pathname + u.search, ...(corpo ? { corpo } : {}) });
      if (u.pathname.startsWith('/ii/')) {
        res.writeHead(200, { 'content-type': 'image/gif' }).end(GIF_BYTES);
        return;
      }
      const m = /^\/api\/v1\/([^/]+)\/gifs\/(trending|search|share\/[a-z0-9-]+)$/.exec(u.pathname);
      if (!m || m[1] !== CHAVE) {
        res.writeHead(404).end();
        return;
      }
      if (m[2]!.startsWith('share/')) {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"result":true}');
        return;
      }
      const q = u.searchParams.get('q');
      const itens = q ? [item('gato-1', `Gato ${q} um`), item('gato-2', `Gato ${q} dois`)] : [item('alta-1', 'Em alta um'), item('alta-2', 'Em alta dois')];
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result: true, data: { data: itens, current_page: 1, per_page: 24, has_next: false } }));
    });
  });
  return new Promise((r) => klipy.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(klipy.address() as AddressInfo).port}`)));
}

async function subir(comChave: boolean) {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-gif-'));
  mkdirSync(PRINTS, { recursive: true });
  pedidosKlipy.length = 0;
  base = await subirKlipy();
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  const extra = comChave ? { KLIPY_API_KEY: CHAVE, KLIPY_URL: base, KLIPY_FALSA: '1' } : {};
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000', ...extra }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
  for (const usuario of ['dono', 'ana', 'beto']) {
    const r = await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario, senha: 'Senha-forte-1' } });
    expect(r.statusCode, `cadastro de ${usuario}`).toBe(201);
  }
}

test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await servidor?.close();
  await new Promise((r) => klipy?.close(r));
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

const redeVista = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { __redeVista: { url: string; ok: boolean }[] }).__redeVista);

test('sem chave: não há botão GIF nem pedido à Klipy (CA-1)', async () => {
  await subir(false);
  const ana = await entrar('ana');
  await ana.janela.waitForTimeout(500);
  await expect(ana.janela.getByRole('button', { name: 'Enviar GIF' })).toHaveCount(0);
  expect(pedidosKlipy).toEqual([]);
});

test('em alta, busca, envio com texto e resposta ao vivo, registro de envio, só o servidor na rede (CA-3, CA-4, CA-5, CA-6, CA-10)', async () => {
  test.setTimeout(90_000);
  await subir(true);
  const ana = await entrar('ana');
  const beto = await entrar('beto');

  const campoBeto = beto.janela.getByLabel('Mensagem para #geral');
  await campoBeto.fill('bom dia');
  await campoBeto.press('Enter');
  const original = ana.janela.getByRole('listitem', { name: 'Mensagem de beto' });
  await expect(original).toContainText('bom dia');
  await original.hover();
  await original.getByRole('button', { name: 'Responder' }).click();
  await ana.janela.getByLabel('Mensagem para #geral').fill('olha isso');

  await ana.janela.getByRole('button', { name: 'Enviar GIF' }).click();
  const painel = ana.janela.getByRole('dialog', { name: 'Escolher GIF' });
  await expect(painel.getByRole('searchbox', { name: 'Buscar GIF' })).toHaveAttribute('placeholder', 'Search KLIPY');
  await expect(painel.getByRole('group', { name: 'Em alta' }).getByRole('button')).toHaveCount(2);
  await painel.getByRole('searchbox').fill('gato');
  const resultados = painel.getByRole('group', { name: 'Resultados de gato' });
  await expect(resultados.getByRole('button')).toHaveCount(2);
  await expect(resultados.getByRole('button').first()).toHaveAttribute('aria-label', 'Gato gato um');
  await ana.janela.waitForTimeout(300);
  await ana.janela.screenshot({ path: join(PRINTS, 'painel.png') });

  await resultados.getByRole('button', { name: 'Gato gato um' }).click();
  await expect(painel).toBeHidden();

  // O beto vê ao vivo: texto, GIF animado e o vínculo da resposta; o endereço não aparece no texto.
  const naBeto = beto.janela.getByRole('listitem', { name: 'Mensagem de ana' });
  await expect(naBeto.getByRole('img', { name: 'Gato gato um' })).toBeVisible();
  await expect(naBeto.locator('.mensagem-texto')).toHaveText('olha isso');
  await expect(naBeto.getByRole('button', { name: /Resposta a você: bom dia/ })).toBeVisible();
  await expect(naBeto).not.toContainText('/ii/gato-1');
  await beto.janela.waitForTimeout(300);
  await beto.janela.screenshot({ path: join(PRINTS, 'gif-no-chat.png') });

  // Registro de envio na Klipy, com o texto buscado.
  await expect.poll(() => pedidosKlipy.filter((p) => p.metodo === 'POST').map((p) => [p.caminho, JSON.parse(p.corpo ?? '{}').q])).toEqual([[`/api/v1/${CHAVE}/gifs/share/gato-1`, 'gato']]);
  // Filtro médio e português nas buscas.
  expect(pedidosKlipy.find((p) => p.caminho.includes('/search?'))!.caminho).toMatch(/content_filter=medium.*|.*content_filter=medium/);

  // Nada saiu do host do servidor (a Klipy falsa está no mesmo host) e nada foi bloqueado.
  for (const lado of [ana, beto]) {
    const vistos = await redeVista(lado.app);
    const fora = vistos.filter((v) => /^(https?|wss?):/.test(v.url) && new URL(v.url).hostname !== '127.0.0.1' && !v.url.startsWith('http://localhost'));
    expect(fora).toEqual([]);
  }
});
