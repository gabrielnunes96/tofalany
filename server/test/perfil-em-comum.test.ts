import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { PerfilDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

/** Mini perfil (T3): amigos e servidores em comum, quem pode ver (T-5) e o pedido de amizade. */
type Banco = { prepare(s: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown } };
let app: (FastifyInstance & { banco: Banco }) | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
type Conta = { token: string; usuario: { id: number } };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const perfil = (token: string, id: number) => app!.inject({ method: 'GET', url: `/api/usuarios/${id}/perfil`, headers: auth(token) });

function amizade(x: number, y: number, aceita = 1) {
  const [a, b] = [x, y].sort((p, q) => p - q);
  app!.banco.prepare('INSERT INTO amizades (usuario_a, usuario_b, pedido_por, aceita, criado_em) VALUES (?, ?, ?, ?, ?)').run(a, b, a, aceita, Date.now());
}
/** Tira a pessoa do servidor principal e põe só no servidor `c`. */
function soNoServidor(id: number, c: number) {
  app!.banco.prepare('DELETE FROM membros WHERE usuario_id = ?').run(id);
  app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (?, ?, 'membro', ?)").run(c, id, Date.now());
}

async function preparar() {
  app = (await appTeste()) as typeof app;
  const contas: Record<string, Conta> = {};
  for (const n of ['dono', 'ana', 'beto', 'caio', 'dani', 'eva']) contas[n] = (await cadastrar(app!, n)).json() as Conta;
  // Servidores 2 (Família: dono, ana, beto) e 3 (só do beto e do dono).
  for (const nome of ['Família', 'Só do beto']) await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(contas.dono!.token), payload: { nome } });
  for (const [c, n] of [[2, 'ana'], [2, 'beto'], [3, 'beto']] as const)
    app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (?, ?, 'membro', ?)").run(c, contas[n]!.usuario.id, Date.now());
  return contas as Record<'dono' | 'ana' | 'beto' | 'caio' | 'dani' | 'eva', Conta>;
}

describe('perfil de outra pessoa (T3)', () => {
  it('CA-10: amigos e servidores em comum, só o que os dois dividem; pendente e removido ficam de fora', async () => {
    const { dono, ana, beto, caio, dani, eva } = await preparar();
    const [a, b] = [ana.usuario.id, beto.usuario.id];
    // Amigos em comum: caio e dani. A eva é amiga do beto mas só pedido pendente com a ana.
    for (const x of [caio, dani]) {
      amizade(a, x.usuario.id);
      amizade(b, x.usuario.id);
    }
    amizade(b, eva.usuario.id);
    amizade(a, eva.usuario.id, 0);
    const r = await perfil(ana.token, b);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const p = r.json() as PerfilDto;
    expect(p.emComum.amigos.sort()).toEqual([caio.usuario.id, dani.usuario.id].sort());
    expect(p.emComum.servidores.map((s) => s.nome)).toEqual(['ToFalany', 'Família']);
    expect(p.contaDesde).toBeUndefined();
    // Conta removida sai dos amigos em comum.
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${dani.usuario.id}`, headers: auth(dono.token) });
    expect(((await perfil(ana.token, b)).json() as PerfilDto).emComum.amigos).toEqual([caio.usuario.id]);
  });

  it('banido do servidor sai dos servidores em comum', async () => {
    const { ana, beto } = await preparar();
    app!.banco.prepare('DELETE FROM membros WHERE comunidade_id = 2 AND usuario_id = ?').run(ana.usuario.id);
    expect(((await perfil(ana.token, beto.usuario.id)).json() as PerfilDto).emComum.servidores.map((s) => s.nome)).toEqual(['ToFalany']);
  });

  it('T-5: fora de contexto, inexistente e removido dão a mesma resposta 404; amigo ou DM liberam', async () => {
    const { dono, ana, caio, eva } = await preparar();
    soNoServidor(caio.usuario.id, 3);
    const fora = await perfil(ana.token, caio.usuario.id);
    const inexistente = await perfil(ana.token, 9999);
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${eva.usuario.id}`, headers: auth(dono.token) });
    const removida = await perfil(ana.token, eva.usuario.id);
    expect([fora.statusCode, inexistente.statusCode, removida.statusCode]).toEqual([404, 404, 404]);
    expect(fora.body).toBe(inexistente.body);
    expect(removida.body).toBe(inexistente.body);
    // Com DM, libera e traz a data da conta (só o dia).
    const [a, b] = [ana.usuario.id, caio.usuario.id].sort((p, q) => p - q);
    app!.banco.prepare('INSERT INTO dms (usuario_a, usuario_b, criado_em) VALUES (?, ?, ?)').run(a, b, Date.now());
    const comDm = (await perfil(ana.token, caio.usuario.id)).json() as PerfilDto;
    expect(comDm.contaDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(comDm.emComum.servidores).toEqual([]);
  });

  it('T-5: amizade aceita libera; pedido pendente, nos dois sentidos, não', async () => {
    const { ana, caio, dani } = await preparar();
    soNoServidor(caio.usuario.id, 3);
    soNoServidor(dani.usuario.id, 3);
    amizade(ana.usuario.id, caio.usuario.id);
    expect((await perfil(ana.token, caio.usuario.id)).statusCode).toBe(200);
    // Pendente: quem pediu é o menor id (a ana ou a dani, conforme a ordem): conferimos pelos dois lados.
    amizade(ana.usuario.id, dani.usuario.id, 0);
    expect((await perfil(ana.token, dani.usuario.id)).statusCode).toBe(404);
    expect((await perfil(dani.token, ana.usuario.id)).statusCode).toBe(404);
  });

  it('o próprio perfil vem sem listas', async () => {
    const { ana } = await preparar();
    expect((await perfil(ana.token, ana.usuario.id)).json()).toEqual({ emComum: { amigos: [], servidores: [] } });
  });

  it('sem sessão: 401', async () => {
    const { ana } = await preparar();
    expect((await app!.inject({ method: 'GET', url: `/api/usuarios/${ana.usuario.id}/perfil` })).statusCode).toBe(401);
  });

  it('T-5: pedido de amizade a quem não conhece é recusado', async () => {
    const { ana, caio, beto } = await preparar();
    soNoServidor(caio.usuario.id, 3);
    if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
    const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token: ana.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    const pedir = (usuarioId: number) => new Promise<{ ok: boolean; erro?: string }>((r) => s.emit('amizade:pedir', { usuarioId }, r));
    expect(await pedir(caio.usuario.id)).toEqual({ ok: false, erro: 'Pessoa não encontrada.' });
    expect((await pedir(beto.usuario.id)).ok).toBe(true);
  });
});
