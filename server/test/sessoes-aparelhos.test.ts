import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, SessaoAparelhoDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { nomeAparelho } from '../src/dominio/sessoes.js';
import { appTeste, cadastrar } from './apoio.js';

/** celular, T1: "Aparelhos conectados" (CA-15, RN-12, A2). */
let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe('aparelhos conectados', () => {
  it('lista só as sessões da própria conta, com o nome do aparelho e a atual marcada', async () => {
    app = await appTeste();
    const ana = (await cadastrar(app, 'ana')).json() as { token: string };
    await cadastrar(app, 'bia');
    const celular = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1', aparelho: 'Android' } })).json() as { token: string };
    const lista = (await app.inject({ method: 'GET', url: '/api/sessoes', headers: auth(ana.token) })).json() as SessaoAparelhoDto[];
    expect(lista).toHaveLength(2);
    expect(lista.find((s) => s.aparelho === 'Android')).toMatchObject({ atual: false });
    expect(lista.filter((s) => s.atual)).toHaveLength(1);
    expect(lista.every((s) => /^[0-9a-f]{32}$/.test(s.id))).toBe(true);
    expect(JSON.stringify(lista)).not.toContain(celular.token);
  });

  it('CA-15: desconectar derruba a sessão (401 e socket fora) e vai à auditoria; a de outra pessoa dá 404', async () => {
    app = await appTeste();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
    const bia = (await cadastrar(app, 'bia')).json() as { token: string };
    const celular = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1', aparelho: 'Android' } })).json() as { token: string };
    const s = conectar(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, { auth: { token: celular.token }, transports: ['websocket'], reconnection: false, forceNew: true }) as Socket<EventosServidor, EventosCliente>;
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    const revogada = new Promise((r) => s.once('sessao:revogada', r));
    const id = ((await app.inject({ method: 'GET', url: '/api/sessoes', headers: auth(ana.token) })).json() as SessaoAparelhoDto[]).find((x) => x.aparelho === 'Android')!.id;
    expect((await app.inject({ method: 'DELETE', url: `/api/sessoes/${id}`, headers: auth(bia.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/sessoes/${id}`, headers: auth(ana.token) })).statusCode).toBe(204);
    await revogada;
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: auth(celular.token) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: auth(ana.token) })).statusCode).toBe(200);
    expect(listarAuditoria(app.banco, { tipo: 'aparelho_desconectado' }).registros).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: '/api/sessoes/naoehex', headers: auth(ana.token) })).statusCode).toBe(400);
  });

  it('nome do aparelho: curto, sem controle nem marcas de direção', () => {
    expect(nomeAparelho('  Android ‮ ')).toBe('Android');
    expect(nomeAparelho('x'.repeat(100))).toHaveLength(40);
    expect(nomeAparelho('')).toBeNull();
    expect(nomeAparelho(3)).toBeNull();
  });
});
