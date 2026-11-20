import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, SomDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { wav } from './audio-teste.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function abrir(token: string): Promise<Cliente> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
  sockets.push(s);
  await new Promise((r) => s.once('ola', r));
  return s;
}

const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
const naVoz = (s: Cliente, canalVozId: number | null) => pedir(s, 'voz:estado', { canalVozId, mudo: false, surdo: false, camera: false });

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const tokens = [];
  for (const nome of ['dono', 'ana', 'bia']) tokens.push((await cadastrar(app, nome)).json().token as string);
  const [a, b, c] = await Promise.all(tokens.map(abrir));
  const criar = async (nome: string) => ((await pedir(a!, 'canal:criar', { tipo: 'voz', nome })).valor as CanalDto).id;
  const papo = await criar('Papo');
  const jogo = await criar('Jogo');
  // Som cadastrado pelo dono (primeira conta = admin).
  const limite = '----x';
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="nome"\r\n\r\nGrilo\r\n--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="g.wav"\r\n\r\n`),
    wav(1),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const som = (
    await app.inject({ method: 'POST', url: '/api/admin/sons', payload: corpo, headers: { 'content-type': `multipart/form-data; boundary=${limite}`, authorization: `Bearer ${tokens[0]}` } })
  ).json() as SomDto;
  return { a: a!, b: b!, c: c!, papo, jogo, som };
}

describe('soundboard: tocar (RF-23, RN-12, RN-13)', () => {
  it('CA-32: só quem está no mesmo canal recebe, com quem tocou', async () => {
    const { a, b, c, papo, jogo, som } = await preparar();
    await naVoz(a, papo);
    await naVoz(b, papo);
    await naVoz(c, jogo);
    const recebidoB = new Promise((r) => b.once('som:tocado', r));
    const recebidoA = new Promise((r) => a.once('som:tocado', r));
    const fofoca = vi.fn();
    c.on('som:tocado', fofoca);
    expect(await pedir(a, 'som:tocar', { somId: som.id })).toEqual({ ok: true, valor: undefined });
    expect(await recebidoB).toEqual({ somId: som.id, porUsuarioId: 1, canalVozId: papo });
    expect(await recebidoA).toEqual({ somId: som.id, porUsuarioId: 1, canalVozId: papo });
    await new Promise((r) => setTimeout(r, 100));
    expect(fofoca).not.toHaveBeenCalled();
  });

  it('CA-33/CA-34: fora da voz recusa; menos de 3 s recusa; som inexistente recusa', async () => {
    const { a, papo, som } = await preparar();
    expect(await pedir(a, 'som:tocar', { somId: som.id })).toEqual({ ok: false, erro: 'Entre num canal de voz para tocar sons.' });
    await naVoz(a, papo);
    expect(await pedir(a, 'som:tocar', { somId: 999 })).toEqual({ ok: false, erro: 'Som não encontrado.' });
    expect((await pedir(a, 'som:tocar', { somId: som.id })).ok).toBe(true);
    expect(await pedir(a, 'som:tocar', { somId: som.id })).toEqual({ ok: false, erro: 'Aguarde 3 s para tocar outro som.' });
    expect(await pedir(a, 'som:tocar', { somId: 'x' })).toMatchObject({ ok: false });
  });

  it('CA-34: o intervalo é por pessoa e acaba em 3 s', async () => {
    const { a, b, papo, som } = await preparar();
    vi.useFakeTimers({ toFake: ['Date'] });
    await naVoz(a, papo);
    await naVoz(b, papo);
    expect((await pedir(a, 'som:tocar', { somId: som.id })).ok).toBe(true);
    // Outra pessoa toca logo em seguida.
    expect((await pedir(b, 'som:tocar', { somId: som.id })).ok).toBe(true);
    vi.setSystemTime(Date.now() + 2900);
    expect((await pedir(a, 'som:tocar', { somId: som.id })).ok).toBe(false);
    vi.setSystemTime(Date.now() + 200);
    expect(await pedir(a, 'som:tocar', { somId: som.id })).toEqual({ ok: true, valor: undefined });
  });
});
