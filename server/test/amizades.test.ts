import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { AmizadeDto, DmDto, EventosCliente, EventosServidor, OlaPayload, UsuarioDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

type Resposta = { ok: boolean; valor?: unknown; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const abrir = async (token: string, comunidade?: number) => {
    const s: Cliente = conectar(url, { auth: { token, ...(comunidade ? { comunidade } : {}) }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola };
  };
  const conta = async (nome: string) => (await cadastrar(app!, nome)).json() as { token: string; usuario: { id: number } };
  return { abrir, dono: await conta('dono'), ana: await conta('ana') };
}

describe('amigos (pedido e aceite, valem em todos os servidores)', () => {
  it('pedir, receber, aceitar e desfazer; as duas pessoas recebem a lista na hora', async () => {
    const { abrir, dono, ana } = await preparar();
    const d = await abrir(dono.token);
    const a = await abrir(ana.token);
    expect(d.ola.amizades).toEqual([]);

    const chegouNaAna = new Promise<{ amizades: AmizadeDto[] }>((r) => a.s.once('amizades:atualizadas', r));
    expect(await pedir(d.s, 'amizade:pedir', { usuarioId: ana.usuario.id })).toEqual({ ok: true, valor: [{ usuarioId: ana.usuario.id, situacao: 'enviado' }] });
    expect((await chegouNaAna).amizades).toEqual([{ usuarioId: dono.usuario.id, situacao: 'recebido' }]);

    // Aceitar só o que recebi; quem pediu não aceita o próprio pedido.
    expect(await pedir(d.s, 'amizade:aceitar', { usuarioId: ana.usuario.id })).toMatchObject({ ok: false });
    expect(await pedir(a.s, 'amizade:aceitar', { usuarioId: dono.usuario.id })).toEqual({ ok: true, valor: [{ usuarioId: dono.usuario.id, situacao: 'amigo' }] });
    expect(await pedir(a.s, 'amizade:pedir', { usuarioId: ana.usuario.id })).toEqual({ ok: false, erro: 'Escolha outra pessoa.' });

    expect(await pedir(a.s, 'amizade:remover', { usuarioId: dono.usuario.id })).toEqual({ ok: true, valor: [] });
    // Pedidos cruzados viram amizade direto.
    await pedir(d.s, 'amizade:pedir', { usuarioId: ana.usuario.id });
    expect(await pedir(a.s, 'amizade:pedir', { usuarioId: dono.usuario.id })).toEqual({ ok: true, valor: [{ usuarioId: dono.usuario.id, situacao: 'amigo' }] });
  });

  it('amigo de outro servidor: aparece (nome e status) e a conversa direta funciona de qualquer servidor', async () => {
    const { abrir, dono } = await preparar();
    const auth = { authorization: `Bearer ${dono.token}` };
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
    const codigo = ((await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth })).json() as { codigo: string }).codigo;
    const bia = (await app!.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } })).json() as {
      token: string;
      usuario: { id: number };
    };

    // A bia (só da Família) e o dono viram amigos pela Família.
    const naFamilia = await abrir(dono.token, 2);
    const daBia = await abrir(bia.token, 2);
    await pedir(daBia.s, 'amizade:pedir', { usuarioId: dono.usuario.id });
    await pedir(naFamilia.s, 'amizade:aceitar', { usuarioId: bia.usuario.id });

    // No principal (onde a bia não está), o dono vê a bia nos conhecidos e conversa com ela.
    const noPrincipal = await abrir(dono.token);
    expect(noPrincipal.ola.amizades).toEqual([{ usuarioId: bia.usuario.id, situacao: 'amigo' }]);
    expect((noPrincipal.ola.conhecidos as UsuarioDto[]).map((u) => u.usuario)).toEqual(['bia']);
    expect(noPrincipal.ola.presencas[String(bia.usuario.id)]).toBe('online');
    expect(noPrincipal.ola.usuarios.map((u) => u.usuario)).not.toContain('bia');
    const dm = (await pedir(noPrincipal.s, 'dm:abrir', { usuarioId: bia.usuario.id })).valor as DmDto;
    const chegou = new Promise((r) => daBia.s.once('mensagem:nova', r));
    expect((await pedir(noPrincipal.s, 'mensagem:enviar', { destino: { dmId: dm.id }, texto: 'oi bia' })).ok).toBe(true);
    expect(await chegou).toMatchObject({ texto: 'oi bia' });
  });
});
