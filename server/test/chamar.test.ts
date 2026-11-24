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

async function preparar(ambiente?: Record<string, string>) {
  app = await appTeste(ambiente);
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
    expect(await chamado).toMatchObject({ porId: ana.usuario.id, porNome: 'ana', canalVozId: papo, canalNome: 'Papo', segundos: 15, id: expect.any(String) });
    // Encerrado (recusado), um segundo chamado para a mesma pessoa em menos de 1 min é recusado pelo limite.
    await pedir(b, 'voz:responder', { id: ((await chamado) as { id: string }).id, aceitar: false });
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
    const { bia, a, papo, abrir } = await preparar();
    // RN-1: a Bia está online no computador; o celular (app fechado) recebe o push.
    await abrir(bia.token);
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

describe('chamar como um telefone (chamar-tocando)', () => {
  type Fim = { id: string; motivo: string; nome: string };
  const proximo = <T>(s: Socket, evento: string) => new Promise<T>((r) => s.once(evento, r));

  it('CA-1: offline e invisível não podem ser chamados, com a mesma resposta de quem não pode', async () => {
    const { bia, caio, a, papo, abrir } = await preparar();
    await naVoz(a, papo);
    const offline = await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    expect(offline.erro).toBe('Essa pessoa não pode ser chamada para a voz.');
    const c = await abrir(caio.token);
    c.emit('presenca:escolher', { status: 'invisivel' });
    await new Promise((r) => setTimeout(r, 100));
    expect((await pedir(a, 'voz:chamar', { usuarioId: caio.usuario.id })).erro).toBe(offline.erro);
  });

  it('CA-2: Entrar (responder aceitando) encerra como atendido para os dois lados', async () => {
    const { bia, a, papo, abrir } = await preparar();
    const b = await abrir(bia.token);
    await naVoz(a, papo);
    const chamado = proximo<{ id: string }>(b, 'voz:chamado');
    const r = await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    const { id } = await chamado;
    expect(r.valor).toEqual({ id });
    const [fimA, fimB] = [proximo<Fim>(a, 'voz:chamado:fim'), proximo<Fim>(b, 'voz:chamado:fim')];
    expect((await pedir(b, 'voz:responder', { id, aceitar: true })).ok).toBe(true);
    expect(await fimA).toEqual({ id, motivo: 'atendido', nome: 'bia' });
    expect((await fimB).motivo).toBe('atendido');
  });

  it('CA-2: entrar na sala de quem chamou encerra como atendido; entrar em outra sala, como não atendido', async () => {
    const { bia, caio, a, papo, abrir } = await preparar();
    const b = await abrir(bia.token);
    const c = await abrir(caio.token);
    await naVoz(a, papo);
    let fim = proximo<Fim>(a, 'voz:chamado:fim');
    await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    await naVoz(b, papo);
    expect((await fim).motivo).toBe('atendido');
    const outra = ((await pedir(a, 'canal:criar', { tipo: 'voz', nome: 'Outra' })).valor as CanalDto).id;
    fim = proximo<Fim>(a, 'voz:chamado:fim');
    await pedir(a, 'voz:chamar', { usuarioId: caio.usuario.id });
    await naVoz(c, outra);
    expect((await fim).motivo).toBe('tempo');
  });

  it('CA-3: recusar avisa quem chamou; só quem foi chamado responde', async () => {
    const { bia, caio, a, papo, abrir } = await preparar();
    const b = await abrir(bia.token);
    const c = await abrir(caio.token);
    await naVoz(a, papo);
    const chamado = proximo<{ id: string }>(b, 'voz:chamado');
    await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    const { id } = await chamado;
    const fim = proximo<Fim>(a, 'voz:chamado:fim');
    // Outra pessoa (ou quem chamou) responder não tem efeito.
    await pedir(c, 'voz:responder', { id, aceitar: true });
    await pedir(a, 'voz:responder', { id, aceitar: true });
    await pedir(b, 'voz:responder', { id, aceitar: false });
    expect(await fim).toEqual({ id, motivo: 'recusado', nome: 'bia' });
  });

  it('CA-4: sem resposta no tempo, encerra dos dois lados como não atendido', async () => {
    const { bia, a, papo, abrir } = await preparar({ CHAMADO_DURACAO_MS: '300' });
    const b = await abrir(bia.token);
    await naVoz(a, papo);
    const chamado = proximo<{ segundos: number }>(b, 'voz:chamado');
    const [fimA, fimB] = [proximo<Fim>(a, 'voz:chamado:fim'), proximo<Fim>(b, 'voz:chamado:fim')];
    await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    await chamado;
    expect((await fimA).motivo).toBe('tempo');
    expect((await fimB).motivo).toBe('tempo');
  });

  it('CA-5: cancelar ou sair da voz encerra como cancelado; só quem chamou cancela', async () => {
    const { bia, caio, a, papo, abrir } = await preparar();
    const b = await abrir(bia.token);
    const c = await abrir(caio.token);
    await naVoz(a, papo);
    const chamado = proximo<{ id: string }>(b, 'voz:chamado');
    await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id });
    const { id } = await chamado;
    const fim = proximo<Fim>(b, 'voz:chamado:fim');
    await pedir(b, 'voz:cancelar', { id });
    await pedir(a, 'voz:cancelar', { id });
    expect((await fim).motivo).toBe('cancelado');
    await pedir(a, 'voz:chamar', { usuarioId: caio.usuario.id });
    const fimCaio = proximo<Fim>(c, 'voz:chamado:fim');
    await naVoz(a, null);
    expect((await fimCaio).motivo).toBe('cancelado');
  });

  it('CA-8: com um chamado aberto, outro chamador é recusado (antes do limite de tentativas)', async () => {
    const { bia, caio, a, papo, abrir } = await preparar();
    await abrir(bia.token);
    const c = await abrir(caio.token);
    await naVoz(a, papo);
    await naVoz(c, papo);
    expect((await pedir(a, 'voz:chamar', { usuarioId: bia.usuario.id })).ok).toBe(true);
    expect((await pedir(c, 'voz:chamar', { usuarioId: bia.usuario.id })).erro).toBe('bia já está recebendo um chamado.');
  });
});
