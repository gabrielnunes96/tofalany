import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { DmDto, EventosCliente, EventosServidor, MensagemDto, OlaPayload } from '@tofalando/shared';
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

/** dono (admin), ana e bia conectados; cada um registra o que recebe. */
async function trio() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const abrir = async (nome: string) => {
    const { token, usuario } = (await cadastrar(app!, nome)).json();
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const recebidos: { evento: string; dados: unknown }[] = [];
    // Status das pessoas (RF-37) é público: não entra na conta de "o que vazou".
    s.onAny((evento, dados) => evento !== 'presenca:atualizada' && recebidos.push({ evento, dados }));
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola, id: usuario.id as number, token: token as string, recebidos };
  };
  return { dono: await abrir('dono'), ana: await abrir('ana'), bia: await abrir('bia') };
}

const tipos = (r: { evento: string }[]) => r.map((x) => x.evento).filter((e) => e !== 'usuario:criado' && e !== 'ola');

describe('mensagens diretas (RF-12a, RN-18)', () => {
  it('CA-19a: A abre DM com B e manda texto; só B recebe (C e o admin nada); ambos veem a DM na lista', async () => {
    const { dono, ana, bia } = await trio();
    const aberta = await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id });
    expect(aberta).toMatchObject({ ok: true, valor: { outroId: bia.id } });
    const dm = (aberta.valor as DmDto).id;
    const r = await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'só pra você' });
    expect(r).toMatchObject({ ok: true, valor: { dmId: dm, canalId: null, texto: 'só pra você' } });
    await expect.poll(() => tipos(bia.recebidos)).toContain('mensagem:nova');
    await new Promise((x) => setTimeout(x, 100));
    expect(tipos(dono.recebidos)).toEqual([]);
    expect(bia.recebidos.find((x) => x.evento === 'dm:atualizada')?.dados).toMatchObject({ id: dm, outroId: ana.id });
    // Só abrir não avisa a outra pessoa: ela recebeu a DM junto com a primeira mensagem.
    expect(bia.recebidos.filter((x) => x.evento === 'dm:atualizada')).toHaveLength(1);
    // Reabrir a mesma conversa devolve a mesma DM (de qualquer lado).
    expect((await pedir(bia.s, 'dm:abrir', { usuarioId: ana.id })).valor).toMatchObject({ id: dm, outroId: ana.id });
  });

  it('CA-19b: editar/apagar a própria chega ao outro; admin não lê nem apaga DM alheia; terceiro não manda nada nela', async () => {
    const { dono, ana, bia } = await trio();
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    const m = (await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'oi' })).valor as MensagemDto;
    expect(await pedir(ana.s, 'mensagem:editar', { id: m.id, texto: 'oi, bia' })).toMatchObject({ ok: true });
    await expect.poll(() => tipos(bia.recebidos)).toContain('mensagem:editada');

    // Admin: nem ler (REST) nem apagar (socket); e não fica sabendo que a mensagem existe.
    const historico = await app!.inject({ method: 'GET', url: `/api/dms/${dm}/mensagens`, headers: { authorization: `Bearer ${dono.token}` } });
    expect(historico.statusCode).toBe(403);
    expect(await pedir(dono.s, 'mensagem:apagar', { id: m.id })).toEqual({ ok: false, erro: 'Conversa não encontrada.' });
    expect(await pedir(dono.s, 'mensagem:editar', { id: m.id, texto: 'x' })).toEqual({ ok: false, erro: 'Conversa não encontrada.' });
    expect(await pedir(dono.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'intruso' })).toEqual({ ok: false, erro: 'Conversa não encontrada.' });

    // Participantes leem; a autora apaga e a outra é avisada.
    const lido = await app!.inject({ method: 'GET', url: `/api/dms/${dm}/mensagens`, headers: { authorization: `Bearer ${bia.token}` } });
    expect(lido.json().mensagens.map((x: MensagemDto) => x.texto)).toEqual(['oi, bia']);
    expect(await pedir(ana.s, 'mensagem:apagar', { id: m.id })).toEqual({ ok: true, valor: undefined });
    await expect.poll(() => bia.recebidos.find((x) => x.evento === 'mensagem:apagada')?.dados).toEqual({ id: m.id, canalId: null, dmId: dm });
    await new Promise((x) => setTimeout(x, 100));
    expect(tipos(dono.recebidos)).toEqual([]);
  });

  it('RN-18: administrador que participa da DM não edita nem apaga a mensagem da outra pessoa', async () => {
    const { dono, ana } = await trio();
    const dm = ((await pedir(dono.s, 'dm:abrir', { usuarioId: ana.id })).valor as DmDto).id;
    const m = (await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'minha' })).valor as MensagemDto;
    expect(await pedir(dono.s, 'mensagem:apagar', { id: m.id })).toEqual({ ok: false, erro: 'Você só pode apagar as suas mensagens.' });
    expect(await pedir(dono.s, 'mensagem:editar', { id: m.id, texto: 'x' })).toEqual({ ok: false, erro: 'Só quem escreveu pode editar a mensagem.' });
  });

  it('DM com conta removida fica só para leitura', async () => {
    const { dono, ana, bia } = await trio();
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'antes' });
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${bia.id}`, headers: { authorization: `Bearer ${dono.token}` } });
    expect(await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'depois' })).toEqual({
      ok: false,
      erro: 'Essa conta foi removida; a conversa ficou só para leitura.',
    });
    const lido = await app!.inject({ method: 'GET', url: `/api/dms/${dm}/mensagens`, headers: { authorization: `Bearer ${ana.token}` } });
    expect(lido.json().mensagens.map((x: MensagemDto) => x.texto)).toEqual(['antes']);
  });

  it('nada das DMs vai para a auditoria (RN-21)', async () => {
    const { ana, bia } = await trio();
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    const m = (await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'segredo-dm' })).valor as MensagemDto;
    await pedir(ana.s, 'mensagem:editar', { id: m.id, texto: 'segredo-dm-2' });
    await pedir(ana.s, 'mensagem:apagar', { id: m.id });
    const tiposAuditoria = (app!.banco.prepare('SELECT tipo FROM auditoria').all() as { tipo: string }[]).map((x) => x.tipo);
    expect(tiposAuditoria.filter((t) => t.startsWith('mensagem'))).toEqual([]);
    expect(JSON.stringify(app!.banco.prepare('SELECT * FROM auditoria').all())).not.toContain('segredo');
  });

  it('digitando em DM chega só para o outro participante', async () => {
    const { dono, ana, bia } = await trio();
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    ana.s.emit('digitando', { destino: { dmId: dm } });
    await expect.poll(() => bia.recebidos.find((x) => x.evento === 'digitando')?.dados).toEqual({ canalId: null, dmId: dm, usuarioId: ana.id });
    await new Promise((x) => setTimeout(x, 100));
    expect(dono.recebidos.some((x) => x.evento === 'digitando')).toBe(false);
    // Terceiro tentando sinalizar na DM dos outros: ignorado.
    dono.s.emit('digitando', { destino: { dmId: dm } });
    await new Promise((x) => setTimeout(x, 100));
    expect(bia.recebidos.filter((x) => x.evento === 'digitando')).toHaveLength(1);
  });

  it('não abre DM consigo nem com pessoa inexistente; o retrato inicial traz as DMs, a mais recente primeiro', async () => {
    const { dono, ana, bia } = await trio();
    expect(await pedir(ana.s, 'dm:abrir', { usuarioId: ana.id })).toEqual({ ok: false, erro: 'Escolha outra pessoa para conversar.' });
    expect(await pedir(ana.s, 'dm:abrir', { usuarioId: 999 })).toEqual({ ok: false, erro: 'Pessoa não encontrada.' });
    const comBia = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    const comDono = ((await pedir(ana.s, 'dm:abrir', { usuarioId: dono.id })).valor as DmDto).id;
    // Garante um milissegundo diferente da abertura (a ordem é por horário).
    await new Promise((x) => setTimeout(x, 10));
    await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: comBia }, texto: 'mais recente' });
    const url = `http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`;
    const outra: Cliente = conectar(url, { auth: { token: ana.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(outra);
    const ola = await new Promise<OlaPayload>((r) => outra.once('ola', r));
    expect(ola.dms.map((d) => d.id)).toEqual([comBia, comDono]);
  });
});
