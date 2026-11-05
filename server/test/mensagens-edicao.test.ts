import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, MensagemDto, OlaPayload } from '@tofalando/shared';
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

type Resposta = { ok: boolean; valor?: unknown; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));

async function trio() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const abrir = async (nome: string) => {
    const { token, usuario } = (await cadastrar(app!, nome)).json();
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola, id: usuario.id as number };
  };
  const dono = await abrir('dono');
  const ana = await abrir('ana');
  const bia = await abrir('bia');
  const canal = dono.ola.canais.find((c) => c.tipo === 'texto')!.id;
  return { dono, ana, bia, canal };
}

const enviar = async (s: Cliente, canalId: number, texto: string) =>
  (await pedir(s, 'mensagem:enviar', { destino: { canalId }, texto })).valor as MensagemDto;

describe('editar e apagar (CA-18, RN-9)', () => {
  it('autor edita: todos recebem com editadaEm; outro membro não edita nem apaga', async () => {
    const { ana, bia, canal } = await trio();
    const m = await enviar(ana.s, canal, 'original');
    const naBia = new Promise<MensagemDto>((r) => bia.s.once('mensagem:editada', r));
    const r = await pedir(ana.s, 'mensagem:editar', { id: m.id, texto: '  corrigida ' });
    expect(r).toMatchObject({ ok: true, valor: { id: m.id, texto: 'corrigida' } });
    const recebida = await naBia;
    expect(recebida.texto).toBe('corrigida');
    expect(recebida.editadaEm).toEqual(expect.any(Number));

    expect(await pedir(bia.s, 'mensagem:editar', { id: m.id, texto: 'invasão' })).toEqual({ ok: false, erro: 'Só quem escreveu pode editar a mensagem.' });
    expect(await pedir(bia.s, 'mensagem:apagar', { id: m.id })).toEqual({ ok: false, erro: 'Você só pode apagar as suas mensagens.' });
  });

  it('administrador apaga mensagem alheia no canal; autor apaga a própria; todos são avisados', async () => {
    const { dono, ana, bia, canal } = await trio();
    const daAna = await enviar(ana.s, canal, 'apagar pelo admin');
    const daBia = await enviar(bia.s, canal, 'apagar pela autora');
    const avisos: { id: number; canalId: number | null }[] = [];
    ana.s.on('mensagem:apagada', (p) => avisos.push(p));
    expect(await pedir(dono.s, 'mensagem:apagar', { id: daAna.id })).toEqual({ ok: true, valor: undefined });
    expect(await pedir(bia.s, 'mensagem:apagar', { id: daBia.id })).toEqual({ ok: true, valor: undefined });
    await expect.poll(() => avisos).toEqual([
      { id: daAna.id, canalId: canal },
      { id: daBia.id, canalId: canal },
    ]);
    expect((app!.banco.prepare('SELECT COUNT(*) AS n FROM mensagens').get() as { n: number }).n).toBe(0);
    expect(await pedir(dono.s, 'mensagem:apagar', { id: daAna.id })).toEqual({ ok: false, erro: 'Mensagem não encontrada.' });
  });

  it('valida id e texto na edição; mesmo texto não marca como editada', async () => {
    const { ana, canal } = await trio();
    const m = await enviar(ana.s, canal, 'igual');
    expect(await pedir(ana.s, 'mensagem:editar', { id: 'x', texto: 'a' })).toEqual({ ok: false, erro: 'Mensagem inválida.' });
    expect(await pedir(ana.s, 'mensagem:editar', { id: m.id, texto: '  ' })).toEqual({ ok: false, erro: 'A mensagem está vazia.' });
    expect(await pedir(ana.s, 'mensagem:editar', { id: m.id, texto: 'igual' })).toMatchObject({ ok: true, valor: { editadaEm: null } });
  });
});

describe('digitando (CA-17)', () => {
  it('chega para os outros com o canal e quem digita, não para quem digita; destino inválido é ignorado', async () => {
    const { ana, bia, canal } = await trio();
    const naBia = new Promise((r) => bia.s.once('digitando', r));
    let paraAna = 0;
    ana.s.on('digitando', () => paraAna++);
    ana.s.emit('digitando', { destino: { canalId: 999 } });
    ana.s.emit('digitando', { destino: { canalId: canal } });
    expect(await naBia).toEqual({ canalId: canal, usuarioId: ana.id });
    await new Promise((r) => setTimeout(r, 100));
    expect(paraAna).toBe(0);
  });

  it('o servidor descarta sinais repetidos do mesmo socket em menos de 1 s', async () => {
    const { ana, bia, canal } = await trio();
    let recebidos = 0;
    bia.s.on('digitando', () => recebidos++);
    for (let i = 0; i < 20; i++) ana.s.emit('digitando', { destino: { canalId: canal } });
    await new Promise((r) => setTimeout(r, 200));
    expect(recebidos).toBe(1);
  });
});

describe('auditoria de mensagens (CA-50, CA-51 — parte de canal)', () => {
  it('editada, apagada pelo autor e apagada pelo admin; nunca o texto', async () => {
    const { dono, ana, canal } = await trio();
    const m1 = await enviar(ana.s, canal, 'segredo um');
    const m2 = await enviar(ana.s, canal, 'segredo dois');
    await pedir(ana.s, 'mensagem:editar', { id: m1.id, texto: 'segredo três' });
    await pedir(ana.s, 'mensagem:apagar', { id: m1.id });
    await pedir(dono.s, 'mensagem:apagar', { id: m2.id });
    const registros = listarAuditoria(app!.banco, { canal }).registros;
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.alvo?.nome ?? null])).toEqual([
      ['mensagem_apagada_admin', 'dono', 'ana'],
      ['mensagem_apagada', 'ana', null],
      ['mensagem_editada', 'ana', null],
    ]);
    const tudo = JSON.stringify(app!.banco.prepare('SELECT * FROM auditoria').all());
    expect(tudo).not.toContain('segredo');
  });
});
