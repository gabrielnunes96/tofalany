import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, GifConfig, GifDto, MensagemDto, OlaPayload, PaginaMensagens } from '@tofalando/shared';
import { appTeste, cadastrar, configTeste } from './apoio.js';
import { construirApp } from '../src/app.js';
import { montarPrevia } from '../src/previa/previa.js';

/** Busca de GIF (T1): configuração, envio validado, permissão, texto para apps antigos e prévia. */
type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const CHAVE = 'chave-de-teste-123';
async function abrir(token: string) {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s: Cliente = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  return { s, ola: await new Promise<OlaPayload>((r) => s.once('ola', r)) };
}
type Resposta<T = unknown> = { ok: boolean; valor?: T; erro?: string };
const pedir = <T = MensagemDto>(s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta<T>>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta<T>) => void) => void)(evento, dados, r));
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
type Conta = { token: string; usuario: { id: number } };

async function preparar(extra: Record<string, string> = { KLIPY_API_KEY: CHAVE }) {
  app = await appTeste(extra);
  const dono = (await cadastrar(app, 'dono')).json() as Conta;
  const ana = (await cadastrar(app, 'ana')).json() as Conta;
  const beto = (await cadastrar(app, 'beto')).json() as Conta;
  const a = await abrir(ana.token);
  const b = await abrir(beto.token);
  const canal = a.ola.canais.find((c) => c.tipo === 'texto')!.id;
  return { dono, ana, beto, a, b, canal };
}

const GIF: GifDto = { slug: 'gato-1', url: 'https://static.klipy.com/ii/abc/14/af/gato.webp', largura: 498, altura: 280, descricao: 'Gato' };

describe('GET /api/gif/config', () => {
  it('CA-7: sem sessão, 401', async () => {
    app = await appTeste({ KLIPY_API_KEY: CHAVE });
    const r = await app.inject({ method: 'GET', url: '/api/gif/config' });
    expect(r.statusCode).toBe(401);
    expect(r.body).not.toContain(CHAVE);
  });

  it('CA-7: a chave não aparece no log (com e sem sessão)', async () => {
    const linhas: string[] = [];
    app = await construirApp({ ...configTeste({ KLIPY_API_KEY: CHAVE, LOG: 'true' }), logDestino: { write: (l: string) => void linhas.push(l) } });
    const ana = (await cadastrar(app, 'ana')).json() as Conta;
    await app.inject({ method: 'GET', url: '/api/gif/config' });
    expect((await app.inject({ method: 'GET', url: '/api/gif/config', headers: auth(ana.token) })).statusCode).toBe(200);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.join('')).not.toContain(CHAVE);
  });

  it('CA-1: sem chave, 204 (busca desligada)', async () => {
    app = await appTeste();
    const ana = (await cadastrar(app, 'ana')).json() as Conta;
    const r = await app.inject({ method: 'GET', url: '/api/gif/config', headers: auth(ana.token) });
    expect(r.statusCode).toBe(204);
  });

  it('com chave: entrega a chave, a base e um código estável que não revela a conta; sem cache', async () => {
    app = await appTeste({ KLIPY_API_KEY: CHAVE });
    const ana = (await cadastrar(app, 'ana')).json() as Conta;
    const beto = (await cadastrar(app, 'beto')).json() as Conta;
    const pedirConfig = async (t: string) => app!.inject({ method: 'GET', url: '/api/gif/config', headers: auth(t) });
    const r = await pedirConfig(ana.token);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const c = r.json() as GifConfig;
    expect(c.chave).toBe(CHAVE);
    expect(c.base).toBe('https://api.klipy.com');
    expect(c.cliente).toMatch(/^[0-9a-f]{32}$/);
    expect(((await pedirConfig(ana.token)).json() as GifConfig).cliente).toBe(c.cliente);
    expect(((await pedirConfig(beto.token)).json() as GifConfig).cliente).not.toBe(c.cliente);
  });

  it('KLIPY_URL só nos testes (com KLIPY_FALSA=1)', () => {
    expect(() => configTeste({ KLIPY_API_KEY: CHAVE, KLIPY_URL: 'http://127.0.0.1:9' })).toThrow(/KLIPY_URL/);
    expect(configTeste({ KLIPY_API_KEY: CHAVE, KLIPY_URL: 'http://127.0.0.1:9', KLIPY_FALSA: '1' }).gif?.aceitarHttp).toBe(true);
  });

  it('o código da pessoa não sai da chave da Klipy (outro membro não o reproduz); de castigo, 204', async () => {
    app = await appTeste({ KLIPY_API_KEY: CHAVE });
    const dono = (await cadastrar(app, 'dono')).json() as Conta;
    const ana = (await cadastrar(app, 'ana')).json() as Conta;
    const c = (await app.inject({ method: 'GET', url: '/api/gif/config', headers: auth(ana.token) })).json() as GifConfig;
    for (const id of [`1:${ana.usuario.id}`, `${ana.usuario.id}`]) expect(createHmac('sha256', CHAVE).update(id).digest('hex').slice(0, 32)).not.toBe(c.cliente);
    await app.inject({ method: 'POST', url: `/api/moderacao/${ana.usuario.id}/castigo`, headers: auth(dono.token), payload: { minutos: 10 } });
    expect((await app.inject({ method: 'GET', url: '/api/gif/config', headers: auth(ana.token) })).statusCode).toBe(204);
  });

  it('chave com barra ou espaço impede a subida', () => {
    expect(() => configTeste({ KLIPY_API_KEY: 'abc/defghij' })).toThrow(/KLIPY_API_KEY/);
    expect(() => configTeste({ KLIPY_API_KEY: 'abc defghij' })).toThrow(/KLIPY_API_KEY/);
  });
});

describe('enviar GIF', () => {
  it('CA-4/CA-12: chega ao outro socket com o gif; o texto termina com o endereço; o histórico também', async () => {
    const { beto, a, b, canal } = await preparar();
    const nova = new Promise<MensagemDto>((r) => b.s.on('mensagem:nova', r));
    const r = await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'olha isso', gif: GIF });
    expect(r.ok).toBe(true);
    const m = await nova;
    expect(m.gif).toEqual(GIF);
    expect(m.texto).toBe(`olha isso\n${GIF.url}`);
    const pagina = (await app!.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: auth(beto.token) })).json() as PaginaMensagens;
    expect(pagina.mensagens.at(-1)!.gif).toEqual(GIF);
  });

  it('só o GIF: o texto vira o endereço; a resposta a ele mostra "GIF" no trecho', async () => {
    const { a, b, canal } = await preparar();
    const so = (await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: '', gif: GIF })).valor!;
    expect(so.texto).toBe(GIF.url);
    const resposta = (await pedir(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'kkk', respostaA: so.id })).valor!;
    expect(resposta.resposta).toMatchObject({ id: so.id, trecho: 'GIF' });
  });

  it('CA-5: GIF com resposta em andamento', async () => {
    const { a, b, canal } = await preparar();
    const original = (await pedir(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'bom dia' })).valor!;
    const m = (await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'oi', gif: GIF, respostaA: original.id })).valor!;
    expect(m.gif).toEqual(GIF);
    expect(m.resposta).toMatchObject({ id: original.id, trecho: 'bom dia' });
  });

  it('CA-8: endereço fora da Klipy, http, slug ou tamanho inválido são recusados sem gravar', async () => {
    const { beto, a, canal } = await preparar();
    for (const gif of [
      { ...GIF, url: 'https://evil.io/x.gif' },
      { ...GIF, url: 'http://static.klipy.com/x.gif' },
      { ...GIF, slug: '../x' },
      { ...GIF, largura: 0 },
      'texto',
    ])
      expect(await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'x', gif })).toEqual({ ok: false, erro: 'GIF inválido.' });
    const pagina = (await app!.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: auth(beto.token) })).json() as PaginaMensagens;
    expect(pagina.mensagens.filter((m) => m.texto === 'x')).toHaveLength(0);
  });

  it('busca desligada: envio com GIF é recusado', async () => {
    const { a, canal } = await preparar({});
    const r = await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: '', gif: GIF });
    expect(r).toEqual({ ok: false, erro: 'A busca de GIF está desligada neste servidor.' });
  });

  it('CA-2: cargo que envia mensagem mas não arquivo não envia GIF (o texto sem GIF passa)', async () => {
    const { dono, ana, a, canal } = await preparar();
    const f = await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono.token), payload: { nome: 'Só texto', cor: '#888888', permissoes: ['enviar_mensagens'] } });
    expect(f.statusCode).toBe(201);
    const atribuir = await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${ana.usuario.id}/funcao`, headers: auth(dono.token), payload: { funcaoId: (f.json() as { id: number }).id } });
    expect(atribuir.statusCode).toBe(200);
    expect(await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'olha', gif: GIF })).toEqual({ ok: false, erro: 'Seu cargo não permite enviar arquivos nos canais.' });
    expect((await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'olha' })).ok).toBe(true);
  });

  it('CA-2: de castigo, não envia GIF', async () => {
    const { dono, ana, a, canal } = await preparar();
    const c = await app!.inject({ method: 'POST', url: `/api/moderacao/${ana.usuario.id}/castigo`, headers: auth(dono.token), payload: { minutos: 10 } });
    expect(c.statusCode).toBe(200);
    expect((await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: '', gif: GIF })).ok).toBe(false);
  });

  it('em DM, as duas pessoas enviam GIF', async () => {
    const { beto, a, b } = await preparar();
    const dm = (await pedir<{ id: number }>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!;
    const nova = new Promise<MensagemDto>((r) => b.s.on('mensagem:nova', r));
    expect((await pedir(a.s, 'mensagem:enviar', { destino: { dmId: dm.id }, texto: '', gif: GIF })).ok).toBe(true);
    expect((await nova).gif).toEqual(GIF);
  });

  it('editar o texto mantém o GIF; editar para o mesmo texto não marca edição', async () => {
    const { a, canal } = await preparar();
    const m = (await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'antes', gif: GIF })).valor!;
    const igual = (await pedir(a.s, 'mensagem:editar', { id: m.id, texto: 'antes' })).valor!;
    expect(igual.editadaEm).toBeNull();
    const e = (await pedir(a.s, 'mensagem:editar', { id: m.id, texto: 'depois' })).valor!;
    expect(e.gif).toEqual(GIF);
    expect(e.texto).toBe(`depois\n${GIF.url}`);
  });

  it('app antigo edita com o endereço no fim: não duplica; sem mudança, não marca edição; o texto pode ficar vazio', async () => {
    const { a, canal } = await preparar();
    const m = (await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'antes', gif: GIF })).valor!;
    const igual = (await pedir(a.s, 'mensagem:editar', { id: m.id, texto: `antes\n${GIF.url}` })).valor!;
    expect(igual.editadaEm).toBeNull();
    expect(igual.texto).toBe(`antes\n${GIF.url}`);
    const mudou = (await pedir(a.s, 'mensagem:editar', { id: m.id, texto: `outro\n${GIF.url}` })).valor!;
    expect(mudou.texto).toBe(`outro\n${GIF.url}`);
    const vazio = (await pedir(a.s, 'mensagem:editar', { id: m.id, texto: GIF.url })).valor!;
    expect(vazio.texto).toBe(GIF.url);
    expect(vazio.gif).toEqual(GIF);
  });
});

describe('prévia de link', () => {
  it('não busca a mídia da Klipy (apps antigos pedem a prévia do link do GIF)', async () => {
    let chamou = false;
    const previa = await montarPrevia(GIF.url, async () => {
      chamou = true;
      return [];
    });
    expect(previa).toBeUndefined();
    expect(chamou).toBe(false);
  });
});
