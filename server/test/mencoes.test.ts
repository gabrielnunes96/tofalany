import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import { extrairMencoes, type EventosCliente, type EventosServidor, type MensagemDto, type OlaPayload, type PaginaMensagens } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function abrir(token: string) {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s: Cliente = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  return { s, ola: await new Promise<OlaPayload>((r) => s.once('ola', r)) };
}
type Resposta = { ok: boolean; valor?: MensagemDto; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe('menções (@pessoa, @todos)', () => {
  it('extrai @usuario e @todos; e-mail e @@ não contam; ponto final sai', () => {
    expect(extrairMencoes('oi @Ana e @beto.silva. e @todos!')).toEqual({ usuarios: ['ana', 'beto.silva'], todos: true });
    expect(extrairMencoes('mande para a@b.com ou @@ana')).toEqual({ usuarios: [], todos: false });
  });

  it('o servidor resolve quem foi marcado (só quem está no servidor); @todos só com permissão; edição atualiza; histórico guarda', async () => {
    app = await appTeste();
    const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
    const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);
    const canal = a.ola.canais.find((c) => c.tipo === 'texto')!.id;

    const chegou = new Promise<MensagemDto>((r) => b.s.once('mensagem:nova', r));
    const r = await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'oi @ana, @ninguem e @dono, @todos' });
    expect(r.valor).toMatchObject({ mencoes: [ana.usuario.id], mencionaTodos: true });
    expect(await chegou).toMatchObject({ mencoes: [ana.usuario.id], mencionaTodos: true });

    // Membro sem "Mencionar @todos": o texto fica, a marcação não.
    const daAna = await pedir(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: '@todos @dono' });
    expect(daAna.valor).toMatchObject({ mencoes: [dono.usuario.id] });
    expect(daAna.valor).not.toHaveProperty('mencionaTodos');

    const editada = await pedir(a.s, 'mensagem:editar', { id: r.valor!.id, texto: 'só texto agora' });
    expect(editada.valor).not.toHaveProperty('mencoes');
    expect(editada.valor).not.toHaveProperty('mencionaTodos');

    const pagina = (await app.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: auth(ana.token) })).json() as PaginaMensagens;
    expect(pagina.mensagens.at(-1)).toMatchObject({ mencoes: [dono.usuario.id] });
  });
});
