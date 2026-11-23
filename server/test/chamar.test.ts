import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, ResumoPushDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import type { Transporte } from '../src/dominio/push.js';
import { appTeste, cadastrar } from './apoio.js';

/** celular, T3: chamar para a voz (CA-14, RN-11). */
let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const pedir = (s: Socket, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
const naVoz = (s: Socket, canalVozId: number | null) => pedir(s, 'voz:estado', { canalVozId, mudo: false, surdo: false, camera: false });

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const contas: { token: string; usuario: { id: number } }[] = [];
  for (const n of ['ana', 'bia', 'caio']) contas.push((await cadastrar(app, n)).json());
  const [ana, bia, caio] = contas as [(typeof contas)[0], (typeof contas)[0], (typeof contas)[0]];
  const abrir = async (token: string, comunidade?: number) => {
    const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token, comunidade }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    return s;
  };
  const a = await abrir(ana.token);
  const papo = ((await pedir(a, 'canal:criar', { tipo: 'voz', nome: 'Papo' })).valor as CanalDto).id;
  return { ana, bia, caio, a, papo, abrir };
}

describe('chamar para a voz', () => {
  it('CA-14: quem está na voz chama; a pessoa recebe com quem e onde; um segundo em menos de 1 min é recusado; auditoria', async () => {
    const { ana, bia, a, papo, abrir } = await preparar();
    const b = await abrir(bia.token);
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).erro).toMatch(/Entre numa sala de voz/);
    await naVoz(a, papo);
    const chamado = new Promise((r) => b.once('voz:chamado', r));
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).ok).toBe(true);
    expect(await chamado).toEqual({ porId: ana.usuario.id, porNome: 'ana', canalVozId: papo, canalNome: 'Papo' });
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).erro).toMatch(/espere um pouco/);
    expect(listarAuditoria(app!.banco, { tipo: 'voz_chamou' }).registros).toHaveLength(1);
  });

  it('não chama quem já está na sala, a si mesmo, quem não é do servidor; não incomodar não recebe', async () => {
    const { bia, caio, a, papo, abrir, ana } = await preparar();
    await naVoz(a, papo);
    expect((await pedir(a, 'voz:chamar', { usuarioId: ana.usuario.id })).ok).toBe(false);
    expect((await pedir(a, 'voz:chamar', { usuarioId: 999 })).erro).toMatch(/não pode ser chamada/);
    const c = await abrir(caio.token);
    await naVoz(c, papo);
    expect((await pedir(a, 'voz:chamar', { usuarioId: caio.usuario.id })).erro).toMatch(/já está na sala/);
    const b = await abrir(bia.token);
    b.emit('presenca:escolher', { status: 'naoIncomodar' });
    await new Promise((r) => setTimeout(r, 100));
    const nada = vi.fn();
    b.on('voz:chamado', nada);
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(nada).not.toHaveBeenCalled();
  });

  it('com o app fechado, o chamado vai por push (urgente) e o resumo diz quem e onde', async () => {
    const { bia, a, papo } = await preparar();
    const celular = (await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'bia', senha: 'Senha-forte-1' } })).json() as { token: string };
    const k = 'a'.repeat(32);
    await app!.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(celular.token), payload: { fcmToken: `fcm-${'y'.repeat(40)}`, k } });
    const envios: Parameters<Transporte>[0][] = [];
    app!.tempoReal.push.usarTransporte(async (x) => (envios.push(x), 'ok'));
    await naVoz(a, papo);
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).ok).toBe(true);
    await vi.waitFor(() => expect(envios).toHaveLength(1));
    expect(envios[0]!.urgente).toBe(true);
    const [r] = (await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${k}`, headers: auth(celular.token) })).json() as ResumoPushDto[];
    expect(r).toMatchObject({ tipo: 'chamado', porNome: 'ana', onde: 'Papo', canalVozId: papo, comunidadeId: 1 });
  });
});
