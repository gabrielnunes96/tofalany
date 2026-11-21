import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { AtividadeDto, EventosCliente, EventosServidor, OlaPayload, StatusPessoa } from '@tofalando/shared';
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

/**
 * dono (admin, principal e Família), carla (principal; entra na Família pelo convite quando o teste pede) e bia (só
 * na Família). Cada conexão anota o que recebe de status e de atividade.
 */
async function preparar() {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const dono = (await cadastrar(app, 'dono')).json() as Conta;
  const carla = (await cadastrar(app, 'carla')).json() as Conta;
  const auth = { authorization: `Bearer ${dono.token}` };
  await app.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
  const codigo = ((await app.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth })).json() as { codigo: string }).codigo;
  const bia = (await app.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } })).json() as Conta;
  const abrir = async (conta: Conta, comunidade?: number) => {
    const s: Cliente = conectar(url, { auth: comunidade ? { token: conta.token, comunidade } : { token: conta.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const status: { id: number; status: StatusPessoa }[] = [];
    const atividades: { id: number; atividade: AtividadeDto | null }[] = [];
    s.on('presenca:atualizada', (x) => status.push(x));
    s.on('atividade:atualizada', (x) => atividades.push(x));
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola, status, atividades };
  };
  const entrar = (conta: Conta) =>
    app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: { authorization: `Bearer ${conta.token}` }, payload: { codigo } });
  return { dono, carla, bia, abrir, entrar, app: app! };
}
const esperar = () => new Promise((r) => setTimeout(r, 120));

describe('status e atividade só para quem pode ver (qualidade-de-vida)', () => {
  it('CA-11: mudança de status não chega a uma conta sem servidor em comum nem amizade', async () => {
    const { dono, carla, bia, abrir } = await preparar();
    const daBia = await abrir(bia, 2);
    const doDono = await abrir(dono);
    const daCarla = await abrir(carla);
    daCarla.s.emit('presenca:escolher', { status: 'naoIncomodar' });
    await expect.poll(() => doDono.status.filter((x) => x.id === carla.usuario.id).at(-1)?.status).toBe('naoIncomodar');
    await esperar();
    expect(daBia.status.filter((x) => x.id === carla.usuario.id)).toEqual([]);
  });

  it('CA-12: entrar num servidor manda o status e a atividade a quem já estava; sair manda offline e null', async () => {
    const { carla, bia, abrir, entrar, app: servidor } = await preparar();
    const daBia = await abrir(bia, 2);
    const daCarla = await abrir(carla);
    daCarla.s.emit('presenca:atividade', { atividade: { jogo: 'Hades' } });
    await esperar();
    // Ainda sem servidor em comum: a bia não sabe nada da carla.
    expect(daBia.status.filter((x) => x.id === carla.usuario.id)).toEqual([]);
    expect(daBia.atividades.filter((x) => x.id === carla.usuario.id)).toEqual([]);

    // A carla entra na Família: a bia passa a ver o status e a atividade dela na hora.
    expect((await entrar(carla)).statusCode).toBe(200);
    await expect.poll(() => daBia.status.filter((x) => x.id === carla.usuario.id).at(-1)?.status).toBe('online');
    await expect.poll(() => daBia.atividades.filter((x) => x.id === carla.usuario.id).at(-1)?.atividade).toEqual({ jogo: 'Hades' });

    // A carla sai da Família: a bia recebe offline e null.
    const sair = await servidor.inject({ method: 'POST', url: '/c/2/api/comunidade/sair', headers: { authorization: `Bearer ${carla.token}` } });
    expect(sair.statusCode).toBe(204);
    await expect.poll(() => daBia.status.filter((x) => x.id === carla.usuario.id).at(-1)?.status).toBe('offline');
    await expect.poll(() => daBia.atividades.filter((x) => x.id === carla.usuario.id).at(-1)?.atividade).toBeNull();
  });

  it('amizade aceita reenvia também o status (sem servidor em comum, os dois se veem online)', async () => {
    const { dono, bia, abrir } = await preparar();
    const donoPrincipal = await abrir(dono);
    const donoFamilia = await abrir(dono, 2);
    const daBia = await abrir(bia, 2);
    const pedir = (s: Cliente, evento: string, usuarioId: number) =>
      new Promise((r) => (s.emit as (e: string, d: unknown, cb: (x: unknown) => void) => void)(evento, { usuarioId }, r));
    await pedir(daBia.s, 'amizade:pedir', dono.usuario.id);
    await pedir(donoFamilia.s, 'amizade:aceitar', bia.usuario.id);
    await expect.poll(() => donoPrincipal.status.filter((x) => x.id === bia.usuario.id).at(-1)?.status).toBe('online');
  });
});
