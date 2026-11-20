import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { AtividadeDto, EventosCliente, EventosServidor, OlaPayload } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function preparar() {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const abrir = (token: string, comunidade?: number) =>
    new Promise<{ s: Cliente; ola: OlaPayload }>((r) => {
      const s: Cliente = conectar(url, { auth: comunidade ? { token, comunidade } : { token }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.once('ola', (ola) => r({ s, ola }));
    });
  return { dono, ana, abrir, app: app! };
}
const proxima = (s: Cliente) => new Promise<{ id: number; atividade: AtividadeDto | null }>((r) => s.once('atividade:atualizada', r));

describe('atividade (jogo, música)', () => {
  it('chega a quem vê, entra no ola, é limpa e cortada; invisível esconde; desconectar apaga', async () => {
    const { dono, ana, abrir } = await preparar();
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);
    let chegou = proxima(a.s);
    b.s.emit('presenca:atividade', { atividade: { jogo: '  Hollow   Knight ', musica: { titulo: 'Oceano', artista: 'Djavan' }, extra: 'x' } as AtividadeDto });
    expect(await chegou).toEqual({ id: ana.usuario.id, atividade: { jogo: 'Hollow Knight', musica: { titulo: 'Oceano', artista: 'Djavan' } } });
    const c = await abrir(dono.token);
    expect(c.ola.atividades).toEqual({ [ana.usuario.id]: { jogo: 'Hollow Knight', musica: { titulo: 'Oceano', artista: 'Djavan' } } });

    chegou = proxima(a.s);
    b.s.emit('presenca:atividade', { atividade: { jogo: 'x'.repeat(300) } });
    expect((await chegou).atividade?.jogo).toHaveLength(100);

    chegou = proxima(a.s);
    b.s.emit('presenca:escolher', { status: 'invisivel' });
    expect((await chegou).atividade).toBeNull();
    chegou = proxima(a.s);
    b.s.emit('presenca:escolher', { status: 'auto' });
    expect((await chegou).atividade?.jogo).toHaveLength(100);

    chegou = proxima(a.s);
    b.s.close();
    expect(await chegou).toEqual({ id: ana.usuario.id, atividade: null });
  });

  it('CA-2: só amigos, membros em comum e a própria pessoa recebem; aceitar a amizade reenvia e desfazer manda null', async () => {
    const { dono, ana, abrir, app: servidor } = await preparar();
    const auth = { authorization: `Bearer ${dono.token}` };
    await servidor.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
    const codigo = ((await servidor.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth })).json() as { codigo: string }).codigo;
    const bia = (await servidor.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } })).json() as {
      token: string;
      usuario: { id: number };
    };
    const donoPrincipal = await abrir(dono.token);
    const donoFamilia = await abrir(dono.token, 2);
    const daAna = await abrir(ana.token);
    const daBia = await abrir(bia.token, 2);
    const recebidos = (s: Cliente) => {
      const lista: { id: number; atividade: AtividadeDto | null }[] = [];
      s.on('atividade:atualizada', (x) => lista.push(x));
      return lista;
    };
    const naBia = recebidos(daBia.s);
    const noDonoPrincipal = recebidos(donoPrincipal.s);
    const naPropriaAna = recebidos(daAna.s);
    const esperar = () => new Promise((r) => setTimeout(r, 100));

    // A ana (só no principal) joga: o dono vê pelo principal; a bia (só na Família, sem amizade) não recebe nada.
    const chegou = proxima(donoPrincipal.s);
    daAna.s.emit('presenca:atividade', { atividade: { jogo: 'Hades' } });
    expect(await chegou).toEqual({ id: ana.usuario.id, atividade: { jogo: 'Hades' } });
    await esperar();
    expect(naBia).toEqual([]);
    expect(naPropriaAna).toEqual([{ id: ana.usuario.id, atividade: { jogo: 'Hades' } }]);

    // A bia joga: o dono vê pela Família, mas não pela conexão do principal (lá ela não é membro nem amiga).
    const naFamilia = proxima(donoFamilia.s);
    daBia.s.emit('presenca:atividade', { atividade: { jogo: 'Celeste' } });
    expect(await naFamilia).toEqual({ id: bia.usuario.id, atividade: { jogo: 'Celeste' } });
    await esperar();
    expect(noDonoPrincipal.filter((x) => x.id === bia.usuario.id)).toEqual([]);

    // Viram amigos: a conexão do principal recebe na hora a atividade atual da bia (e a bia, a do dono: nenhuma).
    await new Promise((r) => (daBia.s.emit as (e: string, d: unknown, cb: (x: unknown) => void) => void)('amizade:pedir', { usuarioId: dono.usuario.id }, r));
    const reenviada = proxima(donoPrincipal.s);
    const doDono = new Promise((r) => daBia.s.on('atividade:atualizada', (x) => x.id === dono.usuario.id && r(x)));
    await new Promise((r) => (donoFamilia.s.emit as (e: string, d: unknown, cb: (x: unknown) => void) => void)('amizade:aceitar', { usuarioId: bia.usuario.id }, r));
    expect(await reenviada).toEqual({ id: bia.usuario.id, atividade: { jogo: 'Celeste' } });
    expect(await doDono).toEqual({ id: dono.usuario.id, atividade: null });

    // Já amigos: uma mudança nova chega pela amizade à conexão do principal.
    const nova = proxima(donoPrincipal.s);
    daBia.s.emit('presenca:atividade', { atividade: { jogo: 'Hades' } });
    expect(await nova).toEqual({ id: bia.usuario.id, atividade: { jogo: 'Hades' } });

    // Desfazem: a conexão do principal recebe null; a da Família continua vendo (são membros em comum).
    const apagada = proxima(donoPrincipal.s);
    const continua = new Promise((r) => donoFamilia.s.on('atividade:atualizada', (x) => x.id === bia.usuario.id && r(x)));
    await new Promise((r) => (donoFamilia.s.emit as (e: string, d: unknown, cb: (x: unknown) => void) => void)('amizade:remover', { usuarioId: bia.usuario.id }, r));
    expect(await apagada).toEqual({ id: bia.usuario.id, atividade: null });
    expect(await continua).toEqual({ id: bia.usuario.id, atividade: { jogo: 'Hades' } });
    await esperar();
    expect(noDonoPrincipal.filter((x) => x.id === bia.usuario.id).at(-1)).toEqual({ id: bia.usuario.id, atividade: null });
  });

  it('CA-2: pedidos cruzados (pedir a quem já pediu) aceitam a amizade e reenviam a atividade', async () => {
    const { dono, abrir, app: servidor } = await preparar();
    const auth = { authorization: `Bearer ${dono.token}` };
    await servidor.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
    const codigo = ((await servidor.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth })).json() as { codigo: string }).codigo;
    const bia = (await servidor.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } })).json() as {
      token: string;
      usuario: { id: number };
    };
    const donoPrincipal = await abrir(dono.token);
    const donoFamilia = await abrir(dono.token, 2);
    const daBia = await abrir(bia.token, 2);
    const naFamilia = proxima(donoFamilia.s);
    daBia.s.emit('presenca:atividade', { atividade: { jogo: 'Celeste' } });
    await naFamilia;
    const pedir = (s: Cliente, evento: string, usuarioId: number) =>
      new Promise((r) => (s.emit as (e: string, d: unknown, cb: (x: unknown) => void) => void)(evento, { usuarioId }, r));
    await pedir(daBia.s, 'amizade:pedir', dono.usuario.id);
    const reenviada = proxima(donoPrincipal.s);
    await pedir(donoFamilia.s, 'amizade:pedir', bia.usuario.id);
    expect(await reenviada).toEqual({ id: bia.usuario.id, atividade: { jogo: 'Celeste' } });
  });

  it('segurança: outro computador que chega invisível apaga a atividade para os outros', async () => {
    const { dono, ana, abrir } = await preparar();
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);
    let chegou = proxima(a.s);
    b.s.emit('presenca:atividade', { atividade: { jogo: 'Hades' } });
    await chegou;
    chegou = proxima(a.s);
    const invisivel = conectar((a.s.io as unknown as { uri: string }).uri, {
      auth: { token: ana.token, status: 'invisivel' },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    }) as Cliente;
    sockets.push(invisivel);
    expect(await chegou).toEqual({ id: ana.usuario.id, atividade: null });
  });

  it('limite de frequência: mudanças em rajada viram a primeira na hora e a última depois (as do meio caem)', async () => {
    const { dono, ana, abrir } = await preparar();
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);
    const recebidas: (string | undefined)[] = [];
    a.s.on('atividade:atualizada', (x) => recebidas.push(x.atividade?.jogo));
    for (const jogo of ['A', 'B', 'C', 'D']) b.s.emit('presenca:atividade', { atividade: { jogo } });
    await expect.poll(() => recebidas, { timeout: 2000 }).toEqual(['A', 'D']);
  });
});
