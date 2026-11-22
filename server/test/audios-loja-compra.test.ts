import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { AudioLojaDto, CatalogoLojaDto, EventosCliente, EventosServidor, MovimentoDto, OlaPayload } from '@tofalando/shared';
import { creditar } from '../src/dominio/loja.js';
import { appTeste, cadastrar } from './apoio.js';

/** audios-na-loja, T3: compra de áudio e catálogo (CA-3, CA-5, CA-6, CA-7, CA-11, CA-13; A5–A7, A13). */
type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function preparar(pontos: number, extra: Record<string, string> = {}) {
  app = await appTeste(extra);
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  if (pontos > 0) creditar(app.banco, ana.usuario.id, pontos, null);
  const audio = (nome: string, raridade: string, retirado = false) =>
    Number(
      app!.banco
        .prepare('INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em, retirado_em) VALUES (?, ?, 1000, ?, ?, 0, ?)')
        .run(nome, `${nome.toLowerCase()}.wav`, raridade, dono.usuario.id, retirado ? 1 : null).lastInsertRowid,
    );
  const comprar = (token: string, corpo: object) => app!.inject({ method: 'POST', url: '/api/loja/comprar', headers: auth(token), payload: corpo });
  return { dono, ana, audio, comprar };
}

async function abrir(token: string): Promise<{ s: Cliente; ola: OlaPayload }> {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
  sockets.push(s);
  return { s, ola: await new Promise<OlaPayload>((r) => s.once('ola', r)) };
}

describe('áudios da loja: compra', () => {
  it('CA-3/A13: o catálogo traz os áudios à venda (lendário primeiro) com o preço da raridade, sem quem comprou', async () => {
    const { ana, audio } = await preparar(0);
    audio('Chuva', 'comum');
    audio('Trovão', 'raro');
    audio('Dragão', 'lendario');
    audio('Velho', 'epico', true);
    const c = (await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana.token) })).json() as CatalogoLojaDto;
    expect(c.audios!.map((a) => [a.nome, a.raridade])).toEqual([
      ['Dragão', 'lendario'],
      ['Trovão', 'raro'],
      ['Chuva', 'comum'],
    ]);
    expect(Object.keys(c.audios![0]!).sort()).toEqual(['duracaoMs', 'id', 'nome', 'raridade', 'url']);
    expect(c.precos.audios!.raro).toBe(300);
  });

  it('CA-5: com 350, o raro deixa 50, entra no extrato com o nome, no Meus sons (ola e tempo real) e vira "comprado"', async () => {
    const { ana, audio, comprar } = await preparar(350);
    const id = audio('Trovão', 'raro');
    const { s, ola } = await abrir(ana.token);
    expect(ola.audiosLoja).toEqual([]);
    const aviso = new Promise<AudioLojaDto[]>((r) => s.once('loja:audios', r));
    const r = await comprar(ana.token, { tipo: 'audio', audioId: id });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ saldo: 50, audiosIds: [id] });
    expect((await aviso).map((a) => a.nome)).toEqual(['Trovão']);
    const extrato = (await app!.inject({ method: 'GET', url: '/api/loja/extrato', headers: auth(ana.token) })).json() as { movimentos: MovimentoDto[] };
    expect(extrato.movimentos[0]).toMatchObject({ tipo: 'compra', item: `audio:${id}`, valor: -300, nomeItem: 'Trovão' });
  });

  it('CA-6: duas compras ao mesmo tempo cobram uma vez', async () => {
    const { ana, audio, comprar } = await preparar(1000);
    const id = audio('Trovão', 'raro');
    const [a, b] = await Promise.all([comprar(ana.token, { tipo: 'audio', audioId: id }), comprar(ana.token, { tipo: 'audio', audioId: id })]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana.token) })).json().estado.saldo).toBe(700);
  });

  it('CA-7/A6/A7: sem saldo, preço do pedido, áudio retirado ou inexistente: nada muda', async () => {
    const { ana, audio, comprar } = await preparar(200);
    const epico = audio('Dragão', 'epico');
    expect((await comprar(ana.token, { tipo: 'audio', audioId: epico })).json()).toMatchObject({ erro: 'saldo_insuficiente' });
    expect((await comprar(ana.token, { tipo: 'audio', audioId: epico, preco: 1, raridade: 'comum' })).statusCode).toBe(409);
    expect((await comprar(ana.token, { tipo: 'audio', audioId: audio('Velho', 'comum', true) })).statusCode).toBe(404);
    expect((await comprar(ana.token, { tipo: 'audio', audioId: 999 })).statusCode).toBe(404);
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana.token) })).json().estado.saldo).toBe(200);
  });

  it('CA-11: trocar a raridade depois não mexe em quem comprou; os outros pagam o preço novo', async () => {
    const { dono, ana, audio, comprar } = await preparar(5000);
    const id = audio('Trovão', 'raro');
    await comprar(ana.token, { tipo: 'audio', audioId: id });
    await app!.inject({ method: 'PATCH', url: `/api/admin/loja/audios/${id}`, headers: auth(dono.token), payload: { raridade: 'lendario' } });
    const c = (await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana.token) })).json() as CatalogoLojaDto;
    expect(c.estado.saldo).toBe(4700);
    expect(c.estado.audiosIds).toEqual([id]);
    const bia = (await cadastrar(app!, 'bia')).json() as { token: string; usuario: { id: number } };
    creditar(app!.banco, bia.usuario.id, 2500, null);
    expect((await comprar(bia.token, { tipo: 'audio', audioId: id })).json()).toMatchObject({ saldo: 500 });
  });

  it('CA-14: o preço da configuração vale na compra', async () => {
    const { ana, audio, comprar } = await preparar(300, { PRECO_AUDIO_RARO: '250' });
    expect((await comprar(ana.token, { tipo: 'audio', audioId: audio('Trovão', 'raro') })).json()).toMatchObject({ saldo: 50 });
  });

  it('A15: mais de 10 compras por minuto são recusadas', async () => {
    const { ana, comprar } = await preparar(0);
    const respostas = [];
    for (let i = 0; i < 11; i++) respostas.push((await comprar(ana.token, { tipo: 'audio', audioId: 999 })).statusCode);
    expect(respostas.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(respostas[10]).toBe(429);
  });

  it('CA-13: o administrador da instalação tem todos (inclusive retirados com comprador) sem comprar', async () => {
    const { dono, audio } = await preparar(0);
    const a = audio('Trovão', 'raro');
    const b = audio('Velho', 'comum', true);
    const { ola } = await abrir(dono.token);
    expect(ola.audiosLoja!.map((x) => x.id).sort()).toEqual([a, b].sort());
    expect(ola.loja!.audiosIds).toEqual([a, b]);
  });
});
