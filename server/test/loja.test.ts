import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, LojaEstadoDto, OlaPayload } from '@tofalando/shared';
import { creditar } from '../src/dominio/loja.js';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** dono (administrador da instalação) e ana (membro) com `pontos` no saldo. */
async function preparar(pontos: number, extra: Record<string, string> = {}) {
  app = await appTeste(extra);
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const resposta = (await cadastrar(app, 'ana')).json();
  const ana = resposta.token as string;
  const anaId = resposta.usuario.id as number;
  if (pontos > 0) creditar(app.banco, anaId, pontos, null);
  return { dono, ana, anaId };
}

const comprarTema = (token: string, tema = 'cinzas') => app!.inject({ method: 'POST', url: '/api/loja/comprar', headers: auth(token), payload: { tipo: 'tema', tema } });

async function abrir(token: string, comunidade?: number): Promise<{ s: Cliente; ola: OlaPayload }> {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token, comunidade }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}

describe('rotas da loja (pontos-e-loja)', () => {
  it('catálogo com os preços da configuração e o meu estado', async () => {
    const { ana } = await preparar(50);
    const r = await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      precos: { tema: 600, vales: { '720p60': 200, '1080p30': 300, '1080p60': 600 } },
      pontosPorMinuto: 1,
      estado: { saldo: 50, temas: [], vales: [], tudoLiberado: false },
    });
    expect((await app!.inject({ method: 'GET', url: '/api/loja' })).statusCode).toBe(401);
  });

  it('CA-9: com 700, comprar um tema de 600 deixa 100, o tema fica meu, entra no extrato e na auditoria', async () => {
    const { ana } = await preparar(700);
    const r = await comprarTema(ana);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ saldo: 100, temas: ['cinzas'] });
    const extrato = (await app!.inject({ method: 'GET', url: '/api/loja/extrato', headers: auth(ana) })).json().movimentos;
    expect(extrato[0]).toMatchObject({ tipo: 'compra', item: 'tema:cinzas', valor: -600 });
    const registro = listarAuditoria(app!.banco).registros.find((x) => x.tipo === 'loja_compra');
    expect(registro).toMatchObject({ ator: { nome: 'ana' }, detalhes: { item: 'tema cinzas', pontos: 600 } });
  });

  it('CA-10: com 500, a compra de 600 é recusada e o saldo continua 500; item fora do catálogo é recusado', async () => {
    const { ana } = await preparar(500);
    const r = await comprarTema(ana);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'saldo_insuficiente', mensagem: 'Faltam 100 pontos.' });
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana) })).json().estado.saldo).toBe(500);
    for (const payload of [{ tipo: 'tema', tema: 'marvel' }, { tipo: 'vale', qualidade: '1440p60' }, { tema: 'cinzas' }, { tipo: 7 }]) {
      const r2 = await app!.inject({ method: 'POST', url: '/api/loja/comprar', headers: auth(ana), payload });
      expect([r2.statusCode, r2.json().erro]).toEqual([400, 'item_invalido']);
    }
    // Preço vindo do app é ignorado: quem decide é o servidor.
    const extra = await app!.inject({ method: 'POST', url: '/api/loja/comprar', headers: auth(ana), payload: { tipo: 'tema', tema: 'gibi', preco: 1 } });
    expect(extra.json().erro).toBe('saldo_insuficiente');
  });

  it('vale comprado entra na lista; tema repetido é recusado sem cobrar', async () => {
    const { ana } = await preparar(900);
    const vale = await app!.inject({ method: 'POST', url: '/api/loja/comprar', headers: auth(ana), payload: { tipo: 'vale', qualidade: '720p60' } });
    expect(vale.json()).toMatchObject({ saldo: 700, vales: [{ qualidade: '720p60' }] });
    expect((await comprarTema(ana)).statusCode).toBe(200);
    const repetido = await comprarTema(ana);
    expect([repetido.statusCode, repetido.json().erro]).toEqual([409, 'item_ja_comprado']);
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana) })).json().estado.saldo).toBe(100);
  });

  it('CA-11: duas compras de 600 ao mesmo tempo com 600: só uma passa e o saldo termina em 0', async () => {
    const { ana } = await preparar(600);
    const [a, b] = await Promise.all([comprarTema(ana, 'cinzas'), comprarTema(ana, 'arcano')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana) })).json().estado).toMatchObject({ saldo: 0 });
  });

  it('CA-21: o administrador da instalação tem tudo liberado e não compra', async () => {
    const { dono } = await preparar(0);
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(dono) })).json().estado.tudoLiberado).toBe(true);
    const r = await comprarTema(dono);
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe('tudo_liberado');
  });

  it('CA-23: o preço vem da configuração do servidor (PRECO_TEMA=800)', async () => {
    const { ana } = await preparar(1000, { PRECO_TEMA: '800' });
    expect((await app!.inject({ method: 'GET', url: '/api/loja', headers: auth(ana) })).json().precos.tema).toBe(800);
    expect((await comprarTema(ana)).json().saldo).toBe(200);
  });

  it('CA-8: o ola traz a loja e a compra avisa todas as conexões da conta, em qualquer servidor', async () => {
    const { ana, dono } = await preparar(700);
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono), payload: { nome: 'Família' } });
    const codigo = (await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth(dono) })).json().codigo as string;
    expect((await app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: auth(ana), payload: { codigo } })).statusCode).toBe(200);
    const um = await abrir(ana);
    const dois = await abrir(ana, 2);
    expect(um.ola.loja).toEqual({ saldo: 700, temas: [], vales: [], tudoLiberado: false });
    const avisos = [um, dois].map((c) => new Promise<LojaEstadoDto>((r) => c.s.once('loja:estado', r)));
    expect((await comprarTema(ana)).statusCode).toBe(200);
    for (const aviso of avisos) expect(await aviso).toMatchObject({ saldo: 100, temas: ['cinzas'] });
  });

  it('rotas da conta: valem pelo endereço de outro servidor, mesmo sem ser membro dele; a auditoria fica no principal', async () => {
    const { ana, dono } = await preparar(700);
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono), payload: { nome: 'Família' } });
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/loja', headers: auth(ana) })).statusCode).toBe(200);
    const r = await app!.inject({ method: 'POST', url: '/c/2/api/loja/comprar', headers: auth(ana), payload: { tipo: 'tema', tema: 'gibi' } });
    expect(r.json()).toMatchObject({ saldo: 100, temas: ['gibi'] });
    expect(listarAuditoria(app!.banco, { tipo: 'loja_compra' }, 2).registros).toEqual([]);
    expect(listarAuditoria(app!.banco, { tipo: 'loja_compra' }).registros).toHaveLength(1);
  });
});
