import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, OlaPayload } from '@tofalando/shared';
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

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const ana = (await cadastrar(app, 'ana')).json().token as string;
  const abrir = async (token: string) => {
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola };
  };
  return { dono: await abrir(dono), ana: await abrir(ana) };
}

const pedir = <K extends keyof EventosCliente>(s: Cliente, evento: K, dados: Parameters<EventosCliente[K]>[0]) =>
  new Promise<{ ok: boolean; valor?: unknown; erro?: string }>((r) => (s.emit as (e: string, d: unknown, a: (x: never) => void) => void)(evento, dados, r));

describe('canais (RF-7)', () => {
  it('servidor novo já tem um canal de texto e um de voz no retrato inicial', async () => {
    const { dono } = await preparar();
    expect(dono.ola.canais.map((c) => `${c.tipo}:${c.nome}`)).toEqual(['texto:geral', 'voz:Sala 1']);
  });

  it('CA-12: membro cria e renomeia; o outro vê em menos de 2 s', async () => {
    const { dono, ana } = await preparar();
    const inicio = Date.now();
    const criadoNoDono = new Promise<CanalDto>((r) => dono.s.once('canal:criado', r));
    const criado = await pedir(ana.s, 'canal:criar', { tipo: 'texto', nome: '  jogos  ' });
    expect(criado).toMatchObject({ ok: true, valor: { tipo: 'texto', nome: 'jogos', posicao: 2 } });
    expect(await criadoNoDono).toEqual((criado as { valor: CanalDto }).valor);

    const id = (criado.valor as CanalDto).id;
    const renomeadoNoDono = new Promise<CanalDto>((r) => dono.s.once('canal:renomeado', r));
    expect(await pedir(ana.s, 'canal:renomear', { id, nome: 'jogatina' })).toMatchObject({ ok: true, valor: { id, nome: 'jogatina' } });
    expect(await renomeadoNoDono).toMatchObject({ id, nome: 'jogatina' });
    expect(Date.now() - inicio).toBeLessThan(2000);
  });

  it('CA-13 / RN-7: membro não remove; admin remove e todos são avisados', async () => {
    const { dono, ana } = await preparar();
    const id = dono.ola.canais[0]!.id;
    await new Promise((r) => dono.s.emit('mensagem:enviar', { destino: { canalId: id }, texto: 'vai sumir' }, r as never));
    const contarMensagens = () => (app!.banco.prepare('SELECT COUNT(*) AS n FROM mensagens WHERE canal_id = ?').get(id) as { n: number }).n;
    expect(contarMensagens()).toBe(1);
    expect(await pedir(ana.s, 'canal:remover', { id })).toEqual({ ok: false, erro: 'Seu cargo não permite remover canais.' });
    const removidoNaAna = new Promise<{ id: number }>((r) => ana.s.once('canal:removido', r));
    expect(await pedir(dono.s, 'canal:remover', { id })).toEqual({ ok: true, valor: undefined });
    expect(await removidoNaAna).toEqual({ id });
    // RN-8: o histórico do canal sai junto.
    expect(contarMensagens()).toBe(0);
    expect(await pedir(dono.s, 'canal:remover', { id })).toMatchObject({ ok: false, erro: 'Canal não encontrado.' });
  });

  it('valida tipo, nome e id', async () => {
    const { ana } = await preparar();
    expect(await pedir(ana.s, 'canal:criar', { tipo: 'video' as never, nome: 'x' })).toMatchObject({ ok: false, erro: 'Tipo de canal inválido.' });
    expect(await pedir(ana.s, 'canal:criar', { tipo: 'voz', nome: '   ' })).toMatchObject({ ok: false, erro: 'Informe o nome do canal.' });
    expect(await pedir(ana.s, 'canal:renomear', { id: 'a' as never, nome: 'x' })).toMatchObject({ ok: false, erro: 'Canal inválido.' });
    expect(await pedir(ana.s, 'canal:renomear', { id: 999, nome: 'x' })).toMatchObject({ ok: false, erro: 'Canal não encontrado.' });
  });

  it('CA-50 (T8): criado, renomeado e removido na auditoria com o nome do canal no momento', async () => {
    const { dono, ana } = await preparar();
    const criado = (await pedir(ana.s, 'canal:criar', { tipo: 'voz', nome: 'Sala 2' })).valor as CanalDto;
    await pedir(ana.s, 'canal:renomear', { id: criado.id, nome: 'Squad' });
    await pedir(ana.s, 'canal:renomear', { id: criado.id, nome: 'Squad' });
    await pedir(dono.s, 'canal:remover', { id: criado.id });
    const registros = listarAuditoria(app!.banco, { canal: criado.id }).registros;
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.canal?.nome, r.detalhes])).toEqual([
      ['canal_removido', 'dono', 'Squad', { tipoCanal: 'voz' }],
      ['canal_renomeado', 'ana', 'Squad', { nomeAnterior: 'Sala 2' }],
      ['canal_criado', 'ana', 'Sala 2', { tipoCanal: 'voz' }],
    ]);
  });
});
