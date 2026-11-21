import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { ComunidadeDto, EventosCliente, EventosServidor, MensagemDto, OlaPayload } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

type Conta = { token: string; usuario: { id: number } };

/** dono (admin do principal e da Família), ana (só no principal) e bia (só na Família). */
async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dono = (await cadastrar(app, 'dono')).json() as Conta;
  const ana = (await cadastrar(app, 'ana')).json() as Conta;
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  await app.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
  const codigo = ((await app.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth(dono.token) })).json() as { codigo: string }).codigo;
  const bia = (await app.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } })).json() as Conta;
  const listar = (de: Conta, para: Conta) => app!.inject({ method: 'GET', url: `/api/usuarios/${para.usuario.id}/convites`, headers: auth(de.token) });
  const convidar = (de: Conta, para: Conta, comunidadeId: number) =>
    app!.inject({ method: 'POST', url: `/api/usuarios/${para.usuario.id}/convites`, headers: auth(de.token), payload: { comunidadeId } });
  const abrir = async (conta: Conta) => {
    const url = `http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`;
    const s: Cliente = conectar(url, { auth: { token: conta.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise<OlaPayload>((r) => s.once('ola', r));
    return s;
  };
  return { dono, ana, bia, listar, convidar, abrir, auth, codigo, app: app! };
}

describe('convidar para servidor pelo cartão da pessoa (qualidade-de-vida, RF-2 e RF-3)', () => {
  it('CA-3: lista só os servidores em que eu posso convidar e a pessoa não está', async () => {
    const { dono, ana, listar } = await preparar();
    const r = await listar(dono, ana);
    expect(r.statusCode).toBe(200);
    expect((r.json() as ComunidadeDto[]).map((c) => c.nome)).toEqual(['Família']);
  });

  it('CA-4: sem "Gerenciar convite" a lista vem vazia, e o envio é recusado', async () => {
    const { dono, ana, listar, convidar } = await preparar();
    expect(await listar(ana, dono).then((r) => r.json())).toEqual([]);
    expect((await convidar(ana, dono, 1)).statusCode).toBe(403);
  });

  it('404 para quem não divide servidor nem é amigo (mesmo com conversa direta) e para a própria conta', async () => {
    const { ana, bia, listar, convidar } = await preparar();
    expect((await listar(ana, bia)).statusCode).toBe(404);
    expect((await convidar(ana, bia, 1)).statusCode).toBe(404);
    expect((await listar(ana, ana)).statusCode).toBe(404);
  });

  it('CA-6: banido ou já membro não aparece; o envio é recusado com 409', async () => {
    const { dono, ana, listar, convidar, auth, codigo, app: servidor } = await preparar();
    // A ana entra na Família e é banida.
    await servidor.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: auth(ana.token), payload: { codigo } });
    expect((await convidar(dono, ana, 2)).statusCode).toBe(409);
    expect((await servidor.inject({ method: 'POST', url: `/c/2/api/moderacao/${ana.usuario.id}/banir`, headers: auth(dono.token), payload: {} })).statusCode).toBe(204);
    expect(await listar(dono, ana).then((r) => r.json())).toEqual([]);
    expect((await convidar(dono, ana, 2)).statusCode).toBe(409);
  });

  it('CA-5: o convite chega como mensagem direta com o nome do servidor e o link de convite dele', async () => {
    const { dono, ana, convidar, abrir } = await preparar();
    const daAna = await abrir(ana);
    const chegou = new Promise<MensagemDto>((r) => daAna.once('mensagem:nova', r));
    const r = await convidar(dono, ana, 2);
    expect(r.statusCode).toBe(200);
    const m = await chegou;
    expect(m.dmId).not.toBeNull();
    expect(m.autorId).toBe(dono.usuario.id);
    expect(m.texto).toMatch(/^Convite para o servidor Família: http:\/\/[^ ]+\/c\/2\/convite\/[^ ]+$/);
  });

  it('limite: o 11º convite em 10 minutos recebe 429', async () => {
    const { dono, ana, convidar } = await preparar();
    for (let i = 0; i < 10; i++) expect((await convidar(dono, ana, 2)).statusCode).toBe(200);
    expect((await convidar(dono, ana, 2)).statusCode).toBe(429);
  });
});
