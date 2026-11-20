import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, MensagemDto, OlaPayload, PaginaMensagens } from '@tofalando/shared';
import { construirApp } from '../src/app.js';
import { lerConfig } from '../src/config.js';
import { appTeste, cadastrar, CONVITE } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
const pastas: string[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

async function abrir(a: FastifyInstance, token: string) {
  if (!a.server.listening) await a.listen({ port: 0, host: '127.0.0.1' });
  const s: Cliente = conectar(`http://127.0.0.1:${(a.server.address() as AddressInfo).port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}

const enviar = (s: Cliente, canalId: number, texto: string) =>
  new Promise<{ ok: boolean; valor?: MensagemDto; erro?: string }>((r) => s.emit('mensagem:enviar', { destino: { canalId }, texto }, r as never));

const historico = async (a: FastifyInstance, token: string, canalId: number, antes?: number) => {
  const r = await a.inject({ method: 'GET', url: `/api/canais/${canalId}/mensagens${antes ? `?antes=${antes}` : ''}`, headers: { authorization: `Bearer ${token}` } });
  return { status: r.statusCode, corpo: r.json() as PaginaMensagens };
};

describe('mensagens de canal (RF-8)', () => {
  it('envia, todos recebem mensagem:nova, e o texto chega aparado', async () => {
    app = await appTeste();
    const dono = (await cadastrar(app, 'dono')).json().token;
    const ana = (await cadastrar(app, 'ana')).json().token;
    const a = await abrir(app, dono);
    const b = await abrir(app, ana);
    const geral = a.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const chegou = new Promise<MensagemDto>((r) => b.s.once('mensagem:nova', r));
    const r = await enviar(a.s, geral, '  oi, pessoal!  ');
    expect(r).toMatchObject({ ok: true, valor: { canalId: geral, texto: 'oi, pessoal!', editadaEm: null } });
    expect(await chegou).toEqual(r.valor);
  });

  it('valida texto, destino e tipo do canal', async () => {
    app = await appTeste();
    const token = (await cadastrar(app, 'dono')).json().token;
    const { s, ola } = await abrir(app, token);
    const voz = ola.canais.find((c) => c.tipo === 'voz')!.id;
    const texto = ola.canais.find((c) => c.tipo === 'texto')!.id;
    expect(await enviar(s, texto, '   ')).toEqual({ ok: false, erro: 'A mensagem está vazia.' });
    expect(await enviar(s, texto, 'x'.repeat(4001))).toMatchObject({ ok: false });
    expect(await enviar(s, voz, 'oi')).toEqual({ ok: false, erro: 'Canal não encontrado.' });
    expect(await enviar(s, 999, 'oi')).toEqual({ ok: false, erro: 'Canal não encontrado.' });
    expect(await new Promise((r) => s.emit('mensagem:enviar', { texto: 'oi' } as never, r as never))).toEqual({ ok: false, erro: 'Destino inválido.' });
  });

  it('CA-14: 500 mensagens; abre nas mais recentes e pagina para trás até a primeira', async () => {
    app = await appTeste();
    const token = (await cadastrar(app, 'dono')).json().token;
    const autor = 1;
    const canal = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'texto'").get() as { id: number }).id;
    const inserir = app.banco.prepare('INSERT INTO mensagens (canal_id, autor_id, texto, criada_em) VALUES (?, ?, ?, ?)');
    app.banco.transaction(() => {
      for (let i = 1; i <= 500; i++) inserir.run(canal, autor, `mensagem ${i}`, i);
    })();

    let pagina = await historico(app, token, canal);
    expect(pagina.status).toBe(200);
    expect(pagina.corpo.mensagens).toHaveLength(50);
    expect(pagina.corpo.mensagens.at(-1)!.texto).toBe('mensagem 500');
    expect(pagina.corpo.mensagens[0]!.texto).toBe('mensagem 451');
    const todas = [...pagina.corpo.mensagens];
    while (!pagina.corpo.fim) {
      pagina = await historico(app, token, canal, todas[0]!.id);
      todas.unshift(...pagina.corpo.mensagens);
    }
    expect(todas).toHaveLength(500);
    expect(todas[0]!.texto).toBe('mensagem 1');
    expect(todas.map((m) => m.texto)).toEqual(Array.from({ length: 500 }, (_, i) => `mensagem ${i + 1}`));
  });

  it('CA-15: a mensagem continua no histórico depois de reiniciar o servidor', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalando-msg-'));
    pastas.push(pasta);
    const config = lerConfig({ LOG: 'false', BANCO: join(pasta, 't.db'), CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' });
    app = await construirApp(config);
    const token = (await cadastrar(app, 'dono')).json().token;
    const { s, ola } = await abrir(app, token);
    const canal = ola.canais.find((c) => c.tipo === 'texto')!.id;
    await enviar(s, canal, 'fica guardada');
    s.close();
    await app.close();
    app = await construirApp(config);
    expect((await historico(app, token, canal)).corpo.mensagens.map((m) => m.texto)).toEqual(['fica guardada']);
  });

  it('limite: 10 devolve 10 com fim=false; acima de 100 é recusado', async () => {
    app = await appTeste();
    const token = (await cadastrar(app, 'dono')).json().token;
    const canal = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'texto'").get() as { id: number }).id;
    const inserir = app.banco.prepare('INSERT INTO mensagens (canal_id, autor_id, texto, criada_em) VALUES (?, 1, ?, ?)');
    for (let i = 1; i <= 15; i++) inserir.run(canal, `m${i}`, i);
    const auth = { authorization: `Bearer ${token}` };
    const dez = (await app.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens?limite=10`, headers: auth })).json() as PaginaMensagens;
    expect(dez.mensagens.map((m) => m.texto)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15']);
    expect(dez.fim).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens?limite=101`, headers: auth })).statusCode).toBe(400);
  });

  it('histórico exige sessão; canal de voz ou inexistente dá 404', async () => {
    app = await appTeste();
    const token = (await cadastrar(app, 'dono')).json().token;
    expect((await app.inject({ method: 'GET', url: '/api/canais/1/mensagens' })).statusCode).toBe(401);
    const voz = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'voz'").get() as { id: number }).id;
    expect((await historico(app, token, voz)).status).toBe(404);
    expect((await historico(app, token, 999)).status).toBe(404);
  });
});
