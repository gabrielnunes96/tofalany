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
  const abrir = (token: string) =>
    new Promise<{ s: Cliente; ola: OlaPayload }>((r) => {
      const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.once('ola', (ola) => r({ s, ola }));
    });
  return { dono, ana, abrir };
}
const proxima = (s: Cliente) => new Promise<{ id: number; atividade: AtividadeDto | null }>((r) => s.once('atividade:atualizada', r));

describe('atividade (jogo, música)', () => {
  it('chega para todos, entra no ola, é limpa e cortada; invisível esconde; desconectar apaga', async () => {
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
});
