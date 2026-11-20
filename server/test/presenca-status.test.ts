import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, OlaPayload, StatusPessoa } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function abrir(token: string): Promise<{ s: Cliente; ola: OlaPayload }> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}

/** Próximo status de `id` que chegar em `s`. */
const proximo = (s: Cliente, id: number) =>
  new Promise<StatusPessoa>((r) => {
    const fn = (p: { id: number; status: StatusPessoa }) => {
      if (p.id !== id) return;
      s.off('presenca:atualizada', fn);
      r(p.status);
    };
    s.on('presenca:atualizada', fn);
  });

describe('status das pessoas (RF-37, RN-25)', () => {
  it('CA-56/CA-57: online ao conectar, ausente quando o app avisa, de volta online, offline depois da carência', async () => {
    app = await appTeste({ CARENCIA_OFFLINE_MS: '150' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const a = await abrir(dono);
    expect(a.ola.presencas).toEqual({ '1': 'online' });

    let status = proximo(a.s, 2);
    const b = await abrir(ana);
    expect(await status).toBe('online');
    expect(b.ola.presencas).toEqual({ '1': 'online', '2': 'online' });

    status = proximo(a.s, 2);
    b.s.emit('presenca:ausente', { ausente: 'sim' } as never);
    b.s.emit('presenca:ausente', null as never);
    b.s.emit('presenca:ausente', { ausente: true });
    b.s.emit('presenca:ausente', { ausente: true });
    // Dados inválidos não mudam nada; o primeiro aviso válido vira "ausente".
    expect(await status).toBe('ausente');

    // Outro computador da ana, em uso: ela fica online; quando ele sai, volta a ausente.
    status = proximo(a.s, 2);
    const b2 = await abrir(ana);
    expect(await status).toBe('online');
    status = proximo(a.s, 2);
    b2.s.close();
    expect(await status).toBe('ausente');

    status = proximo(a.s, 2);
    b.s.emit('presenca:ausente', { ausente: false });
    expect(await status).toBe('online');

    // Fechou o app: offline só depois da carência.
    const inicio = Date.now();
    status = proximo(a.s, 2);
    b.s.close();
    expect(await status).toBe('offline');
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(140);
  });

  it('quem reconecta já ausente avisa no handshake (não aparece online)', async () => {
    app = await appTeste();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const a = await abrir(dono);
    const status = proximo(a.s, 2);
    const s = conectar(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, { auth: { token: ana, ausente: true }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
    sockets.push(s);
    expect(await status).toBe('ausente');
  });

  it('queda curta (volta dentro da carência) não vira offline', async () => {
    app = await appTeste({ CARENCIA_OFFLINE_MS: '400' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const a = await abrir(dono);
    const b = await abrir(ana);
    const vistos: StatusPessoa[] = [];
    a.s.on('presenca:atualizada', (p) => p.id === 2 && vistos.push(p.status));
    b.s.close();
    await new Promise((r) => setTimeout(r, 100));
    await abrir(ana);
    await new Promise((r) => setTimeout(r, 500));
    expect(vistos).not.toContain('offline');
  });

  it('backlog v2, item 2: status escolhido (não incomodar, ausente, invisível) vence a ociosidade; auto volta ao normal', async () => {
    app = await appTeste({ CARENCIA_OFFLINE_MS: '150' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const a = await abrir(dono);
    let status = proximo(a.s, 2);
    const b = await abrir(ana);
    expect(await status).toBe('online');

    status = proximo(a.s, 2);
    b.s.emit('presenca:escolher', { status: 'qualquer' } as never);
    b.s.emit('presenca:escolher', { status: 'naoIncomodar' });
    expect(await status).toBe('naoIncomodar');

    // Ausente escolhido vale mesmo com o computador em uso.
    status = proximo(a.s, 2);
    b.s.emit('presenca:escolher', { status: 'ausente' });
    expect(await status).toBe('ausente');

    // Invisível: os outros veem offline; quem chega depois também não vê.
    status = proximo(a.s, 2);
    b.s.emit('presenca:escolher', { status: 'invisivel' });
    expect(await status).toBe('offline');
    const c = await abrir(dono);
    expect(c.ola.presencas).toEqual({ '1': 'online' });

    status = proximo(a.s, 2);
    b.s.emit('presenca:escolher', { status: 'auto' });
    expect(await status).toBe('online');
  });

  it('backlog v2, item 2: quem reconecta invisível (no handshake) não aparece online nem por um instante', async () => {
    app = await appTeste({ CARENCIA_OFFLINE_MS: '150' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const a = await abrir(dono);
    const vistos: StatusPessoa[] = [];
    a.s.on('presenca:atualizada', (p) => p.id === 2 && vistos.push(p.status));
    const s = conectar(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, {
      auth: { token: ana, status: 'invisivel' },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    }) as Cliente;
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    await new Promise((r) => setTimeout(r, 100));
    expect(vistos).toEqual([]);
  });
});
