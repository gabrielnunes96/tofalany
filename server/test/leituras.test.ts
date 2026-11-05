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

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const abrir = async (token: string) => {
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola };
  };
  const ana = (await cadastrar(app, 'ana')).json();
  const bia = (await cadastrar(app, 'bia')).json();
  return { url, abrir, ana: { ...(await abrir(ana.token)), token: ana.token as string, id: ana.usuario.id as number }, bia: { ...(await abrir(bia.token)), token: bia.token as string, id: bia.usuario.id as number } };
}

describe('não lidas (RF-12)', () => {
  it('conta só mensagens dos outros depois da última lida, em canal e DM; reconectar traz os números', async () => {
    const { abrir, ana, bia } = await preparar();
    const geral = ana.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    for (const t of ['um', 'dois', 'três']) await pedir(ana.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: t });
    await pedir(ana.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'oi' });
    await pedir(bia.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: 'minha não conta' });

    const outraDaBia = await abrir(bia.token);
    expect(outraDaBia.ola.naoLidas).toEqual({ [`c:${geral}`]: 3, [`d:${dm}`]: 1 });
    const daAna = await abrir(ana.token);
    expect(daAna.ola.naoLidas).toEqual({ [`c:${geral}`]: 1 });
  });

  it('marcar lido só avança, zera o contador e avisa os outros computadores da mesma pessoa', async () => {
    const { abrir, ana, bia } = await preparar();
    const geral = ana.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const msgs: MensagemDto[] = [];
    for (const t of ['a', 'b']) msgs.push((await pedir(ana.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: t })).valor as MensagemDto);
    const outroPc = await abrir(bia.token);
    const aviso = new Promise((r) => outroPc.s.once('lido:atualizado', r));
    bia.s.emit('lido:marcar', { destino: { canalId: geral }, ultimaMensagemId: msgs[1]!.id });
    expect(await aviso).toEqual({ chave: `c:${geral}`, ultimaMensagemId: msgs[1]!.id });
    // Um computador atrasado marcando a mensagem anterior não "desle" a mais nova.
    bia.s.emit('lido:marcar', { destino: { canalId: geral }, ultimaMensagemId: msgs[0]!.id });
    await new Promise((x) => setTimeout(x, 100));
    expect((await abrir(bia.token)).ola.naoLidas).toEqual({});
  });

  it('um id maior que a última mensagem não marca as futuras como lidas', async () => {
    const { abrir, ana, bia } = await preparar();
    const geral = ana.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const m = (await pedir(ana.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: 'a' })).valor as MensagemDto;
    const aviso = new Promise<{ ultimaMensagemId: number }>((r) => bia.s.once('lido:atualizado', r));
    bia.s.emit('lido:marcar', { destino: { canalId: geral }, ultimaMensagemId: 999_999 });
    expect((await aviso).ultimaMensagemId).toBe(m.id);
    await pedir(ana.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: 'nova depois' });
    expect((await abrir(bia.token)).ola.naoLidas).toEqual({ [`c:${geral}`]: 1 });
  });

  it('remover o canal apaga as leituras dele', async () => {
    const { ana, bia } = await preparar();
    const dono = (await cadastrar(app!, 'dono')).json();
    app!.banco.prepare("UPDATE usuarios SET cargo = 'admin' WHERE id = ?").run(dono.usuario.id);
    const url = `http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`;
    const sd: Cliente = conectar(url, { auth: { token: dono.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(sd);
    await new Promise((r) => sd.once('ola', r));
    const geral = ana.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const m = (await pedir(ana.s, 'mensagem:enviar', { destino: { canalId: geral }, texto: 'a' })).valor as MensagemDto;
    const aviso = new Promise((r) => bia.s.once('lido:atualizado', r));
    bia.s.emit('lido:marcar', { destino: { canalId: geral }, ultimaMensagemId: m.id });
    await aviso;
    await pedir(sd, 'canal:remover', { id: geral });
    expect(app!.banco.prepare('SELECT COUNT(*) AS n FROM leituras').get()).toEqual({ n: 0 });
  });

  it('não marca leitura em DM dos outros nem com dados inválidos', async () => {
    const { ana, bia } = await preparar();
    const dono = (await cadastrar(app!, 'dono')).json();
    const dm = ((await pedir(ana.s, 'dm:abrir', { usuarioId: bia.id })).valor as DmDto).id;
    const url = `http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`;
    const intruso: Cliente = conectar(url, { auth: { token: dono.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(intruso);
    await new Promise((r) => intruso.once('ola', r));
    intruso.emit('lido:marcar', { destino: { dmId: dm }, ultimaMensagemId: 999 });
    intruso.emit('lido:marcar', { destino: { canalId: 1 }, ultimaMensagemId: 'x' } as never);
    await new Promise((x) => setTimeout(x, 100));
    expect(app!.banco.prepare('SELECT COUNT(*) AS n FROM leituras').get()).toEqual({ n: 0 });
  });
});
