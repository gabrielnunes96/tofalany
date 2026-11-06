import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, OlaPayload, TransmissaoDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
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
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
const naVoz = (s: Cliente, canalVozId: number | null) => pedir(s, 'voz:estado', { canalVozId, mudo: false, surdo: false, camera: false });

async function preparar() {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const ana = (await cadastrar(app, 'ana')).json().token as string;
  const a = await abrir(dono);
  const b = await abrir(ana);
  const criar = async (nome: string) => ((await pedir(a.s, 'canal:criar', { tipo: 'voz', nome })).valor as CanalDto).id;
  return { a, b, papo: await criar('Papo'), jogo: await criar('Jogo'), ana };
}

describe('transmissão de tela: trava por canal (RN-10)', () => {
  it('CA-38: o segundo recebe "já está transmitindo"; depois que o primeiro para, consegue; auditoria (CA-49)', async () => {
    const { a, b, papo } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, papo);
    const iniciada = new Promise<TransmissaoDto>((r) => b.s.once('tela:iniciada', r));
    expect(await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({ ok: true, valor: { canalVozId: papo, usuarioId: 1, qualidade: '720p30' } });
    expect(await iniciada).toEqual({ canalVozId: papo, usuarioId: 1, qualidade: '720p30' });
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({ ok: false, erro: 'dono já está transmitindo neste canal.' });
    // Pedir de novo quem já transmite não muda nada; parar de outro não libera.
    expect((await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    await pedir(b.s, 'tela:parar', { canalVozId: papo });
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(false);

    const parada = new Promise((r) => b.s.once('tela:parada', r));
    await pedir(a.s, 'tela:parar', { canalVozId: papo });
    expect(await parada).toEqual({ canalVozId: papo, usuarioId: 1 });
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);

    const registros = listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('tela_')).reverse();
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.canal?.nome])).toEqual([
      ['tela_iniciou', 'dono', 'Papo'],
      ['tela_parou', 'dono', 'Papo'],
      ['tela_iniciou', 'ana', 'Papo'],
    ]);
  });

  it('outro computador da mesma pessoa assume a voz: a transmissão da sessão anterior acaba', async () => {
    const { a, b, papo, ana } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, papo);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    const parada = new Promise((r) => a.s.once('tela:parada', r));
    const b2 = await abrir(ana);
    await naVoz(b2.s, papo);
    expect(await parada).toEqual({ canalVozId: papo, usuarioId: 2 });
  });

  it('só transmite quem está no canal; um por canal (outro canal pode); sair da voz libera; ola traz quem transmite', async () => {
    const { a, b, papo, jogo, ana } = await preparar();
    expect(await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({ ok: false, erro: 'Entre no canal de voz para transmitir.' });
    await naVoz(a.s, papo);
    await naVoz(b.s, jogo);
    expect((await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p30' })).ok).toBe(true);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '4k' })).ok).toBe(false);
    const c = await abrir(ana);
    expect(c.ola.transmissoes).toHaveLength(2);

    // Trocar de canal (sair da voz em Jogo) libera a trava de Jogo.
    const parada = new Promise((r) => a.s.once('tela:parada', r));
    await naVoz(b.s, papo);
    expect(await parada).toEqual({ canalVozId: jogo, usuarioId: 2 });
    // Cair da conexão (depois da carência) libera Papo.
    const parada2 = new Promise((r) => b.s.once('tela:parada', r));
    a.s.close();
    expect(await parada2).toEqual({ canalVozId: papo, usuarioId: 1 });
    // CA-49: transmitir e sair da voz fica registrado como fim da transmissão.
    const motivos = listarAuditoria(app!.banco).registros.filter((r) => r.tipo === 'tela_parou').map((r) => [r.ator?.nome, r.detalhes?.motivo]);
    expect(motivos).toEqual([
      ['dono', 'saiu_da_voz'],
      ['ana', 'saiu_da_voz'],
    ]);
  });
});
