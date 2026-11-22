import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, SomDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { wav } from './audio-teste.js';

/** audios-na-loja, T4: tocar o áudio comprado e as conferências do soundboard (CA-8, CA-9, CA-10; A1–A4, A14). */
type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function abrir(token: string, comunidade?: number): Promise<Cliente> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token, comunidade }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
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
  const contas: { token: string; usuario: { id: number } }[] = [];
  for (const nome of ['dono', 'ana', 'bia']) contas.push((await cadastrar(app, nome)).json());
  const [dono, ana, bia] = contas as [(typeof contas)[0], (typeof contas)[0], (typeof contas)[0]];
  const [d, a, b] = await Promise.all([dono, ana, bia].map((c) => abrir(c.token)));
  const criar = async (nome: string) => ((await pedir(d!, 'canal:criar', { tipo: 'voz', nome })).valor as CanalDto).id;
  const papo = await criar('Papo');
  const descanso = await criar('Descanso');
  const audioId = Number(
    app.banco
      .prepare("INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em) VALUES ('Trovão', 'abc.wav', 1500, 'epico', ?, 0)")
      .run(dono.usuario.id).lastInsertRowid,
  );
  app.banco.prepare('INSERT INTO loja_audios_compras (usuario_id, audio_id, comprado_em) VALUES (?, ?, 0)').run(ana.usuario.id, audioId);
  const limite = '----x';
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="nome"\r\n\r\nGrilo\r\n--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="g.wav"\r\n\r\n`),
    wav(1),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const som = (await app.inject({ method: 'POST', url: '/api/admin/sons', payload: corpo, headers: { 'content-type': `multipart/form-data; boundary=${limite}`, authorization: `Bearer ${dono.token}` } })).json() as SomDto;
  return { dono, ana, bia, d: d!, a: a!, b: b!, papo, descanso, audioId, som };
}

describe('soundboard: áudios comprados', () => {
  it('CA-8/A4: quem tem toca; a sala recebe o áudio do banco (campos do pedido não passam)', async () => {
    const { ana, a, b, papo, audioId } = await preparar();
    await naVoz(a, papo);
    await naVoz(b, papo);
    const recebido = new Promise((r) => b.once('audio:tocado', r));
    expect((await pedir(a, 'som:tocar', { audioId, nome: '<b>falso</b>', url: 'https://fora.example/x.mp3' })).ok).toBe(true);
    expect(await recebido).toEqual({
      audio: { id: audioId, nome: 'Trovão', url: '/files/abc.wav', duracaoMs: 1500, raridade: 'epico' },
      porUsuarioId: ana.usuario.id,
      canalVozId: papo,
    });
  });

  it('CA-9/A3: sem o áudio, recusa (mesmo erro de inexistente) e ninguém recebe; o administrador toca sem comprar', async () => {
    const { a, b, d, papo, audioId } = await preparar();
    await naVoz(a, papo);
    await naVoz(b, papo);
    await naVoz(d, papo);
    const nada = vi.fn();
    a.on('audio:tocado', nada);
    expect(await pedir(b, 'som:tocar', { audioId })).toEqual({ ok: false, erro: 'Som não encontrado.' });
    expect(await pedir(b, 'som:tocar', { audioId: 999 })).toEqual({ ok: false, erro: 'Som não encontrado.' });
    expect((await pedir(b, 'som:tocar', { audioId, somId: 1 })).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(nada).not.toHaveBeenCalled();
    expect((await pedir(d, 'som:tocar', { audioId })).ok).toBe(true);
  });

  it('CA-10/A2/A14: fora da voz, na AFK, de castigo recusam (também o som do servidor); intervalo comum aos dois', async () => {
    const { ana, a, papo, descanso, audioId, som } = await preparar();
    expect((await pedir(a, 'som:tocar', { audioId })).erro).toMatch(/Entre num canal de voz/);
    await naVoz(a, papo);
    expect((await pedir(a, 'som:tocar', { somId: som.id })).ok).toBe(true);
    expect((await pedir(a, 'som:tocar', { audioId })).erro).toMatch(/Aguarde/);
    app!.banco.prepare('UPDATE comunidades SET afk_canal_id = ? WHERE id = 1').run(descanso);
    await naVoz(a, descanso);
    expect((await pedir(a, 'som:tocar', { audioId })).erro).toMatch(/AFK/);
    expect((await pedir(a, 'som:tocar', { somId: som.id })).erro).toMatch(/AFK/);
    app!.banco.prepare('UPDATE comunidades SET afk_canal_id = NULL WHERE id = 1').run();
    await naVoz(a, papo);
    app!.banco.prepare('UPDATE membros SET castigo_ate = ? WHERE comunidade_id = 1 AND usuario_id = ?').run(Date.now() + 60_000, ana.usuario.id);
    expect((await pedir(a, 'som:tocar', { audioId })).erro).toBe('Você está de castigo.');
    expect((await pedir(a, 'som:tocar', { somId: som.id })).erro).toBe('Você está de castigo.');
  });

  it('CA-10: sem "Soundboard" no cargo, recusa o áudio comprado e o som do servidor', async () => {
    const { dono, bia, b, papo, som } = await preparar();
    const auth = { authorization: `Bearer ${dono.token}` };
    const cargo = (await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth, payload: { nome: 'Calado', cor: '#888888', permissoes: ['entrar_voz'] } })).json() as { id: number };
    await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${bia.usuario.id}/funcao`, headers: auth, payload: { funcaoId: cargo.id } });
    const audioId = Number(app!.banco.prepare("INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em) VALUES ('X', 'x.wav', 1000, 'comum', 1, 0)").run().lastInsertRowid);
    app!.banco.prepare('INSERT INTO loja_audios_compras (usuario_id, audio_id, comprado_em) VALUES (?, ?, 0)').run(bia.usuario.id, audioId);
    await naVoz(b, papo);
    expect((await pedir(b, 'som:tocar', { audioId })).erro).toBe('Seu cargo não permite tocar sons.');
    expect((await pedir(b, 'som:tocar', { somId: som.id })).erro).toBe('Seu cargo não permite tocar sons.');
  });

  it('CA-8: o áudio comprado toca na chamada de outro servidor da instalação', async () => {
    const { dono, ana, bia, audioId } = await preparar();
    const auth = (t: string) => ({ authorization: `Bearer ${t}` });
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    for (const u of [ana, bia]) app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (2, ?, 'membro', 0)").run(u.usuario.id);
    const a2 = await abrir(ana.token, 2);
    const b2 = await abrir(bia.token, 2);
    const d2 = await abrir(dono.token, 2);
    const sala = ((await pedir(d2, 'canal:criar', { tipo: 'voz', nome: 'Sala da família' })).valor as CanalDto).id;
    await naVoz(a2, sala);
    await naVoz(b2, sala);
    const recebido = new Promise<{ audio: { id: number } }>((r) => b2.once('audio:tocado', r));
    expect((await pedir(a2, 'som:tocar', { audioId })).ok).toBe(true);
    expect((await recebido).audio.id).toBe(audioId);
  });

  it('CA-12: áudio tirado da loja continua tocando para quem comprou', async () => {
    const { a, papo, audioId } = await preparar();
    app!.banco.prepare('UPDATE loja_audios SET retirado_em = 1 WHERE id = ?').run(audioId);
    await naVoz(a, papo);
    expect((await pedir(a, 'som:tocar', { audioId })).ok).toBe(true);
  });

  it('A1: com a chamada num servidor, tocar pela conexão de outro servidor é recusado', async () => {
    const { dono, ana, a, papo, audioId } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: { authorization: `Bearer ${dono.token}` }, payload: { nome: 'Família' } });
    app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (2, ?, 'membro', 0)").run(ana.usuario.id);
    await naVoz(a, papo);
    const outra = await abrir(ana.token, 2);
    expect((await pedir(outra, 'som:tocar', { audioId })).erro).toMatch(/servidor da sua chamada/);
  });
});
