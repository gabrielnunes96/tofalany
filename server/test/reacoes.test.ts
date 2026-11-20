import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import { REACOES_POR_MENSAGEM, type DmDto, type EventosCliente, type EventosServidor, type MensagemDto, type OlaPayload, type ReacaoDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

/** Reações e respostas (0.16.0), parte do servidor: reações (T1). */
type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

type Recebido = { evento: string; dados: unknown };
async function abrir(token: string) {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s: Cliente = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  const recebidos: Recebido[] = [];
  s.onAny((evento: string, dados: unknown) => recebidos.push({ evento, dados }));
  return { s, recebidos, ola: await new Promise<OlaPayload>((r) => s.once('ola', r)) };
}
type Resposta<T = unknown> = { ok: boolean; valor?: T; erro?: string };
const pedir = <T = unknown>(s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta<T>>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta<T>) => void) => void)(evento, dados, r));
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const beto = (await cadastrar(app, 'beto')).json() as { token: string; usuario: { id: number } };
  const d = await abrir(dono.token);
  const a = await abrir(ana.token);
  const b = await abrir(beto.token);
  const canal = d.ola.canais.find((c) => c.tipo === 'texto')!.id;
  return { dono, ana, beto, d, a, b, canal };
}

const reagir = (s: Cliente, mensagemId: number, emoji: string) => pedir<ReacaoDto[]>(s, 'reacao:alternar', { mensagemId, emoji });

describe('reações (T1)', () => {
  it('CA-1/CA-2/CA-3: pôr, tirar e pôr de novo; todos recebem a lista inteira; ordem do primeiro uso; sem mensagem nova', async () => {
    const { ana, beto, a, b, canal } = await preparar();
    const m = (await pedir<MensagemDto>(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'bom dia' })).valor!;
    const antes = b.recebidos.length;

    expect(await reagir(a.s, m.id, '👍')).toEqual({ ok: true, valor: [{ emoji: '👍', usuarios: [ana.usuario.id] }] });
    await expect.poll(() => b.recebidos.filter((x) => x.evento === 'mensagem:reacoes').length).toBe(1);
    expect(b.recebidos.find((x) => x.evento === 'mensagem:reacoes')!.dados).toEqual({ id: m.id, canalId: canal, dmId: null, reacoes: [{ emoji: '👍', usuarios: [ana.usuario.id] }] });

    // Outro emoji e o mesmo emoji por outra pessoa: o 👍 continua primeiro.
    await reagir(b.s, m.id, '😂');
    expect((await reagir(b.s, m.id, '👍')).valor).toEqual([
      { emoji: '👍', usuarios: [ana.usuario.id, beto.usuario.id] },
      { emoji: '😂', usuarios: [beto.usuario.id] },
    ]);
    // Clicar de novo tira só a da própria pessoa; e põe de volta.
    expect((await reagir(a.s, m.id, '👍')).valor).toEqual([
      { emoji: '👍', usuarios: [beto.usuario.id] },
      { emoji: '😂', usuarios: [beto.usuario.id] },
    ]);
    expect((await reagir(a.s, m.id, '👍')).valor![0]).toEqual({ emoji: '👍', usuarios: [beto.usuario.id, ana.usuario.id] });

    // CA-9: nada de mensagem nova; o histórico traz as reações.
    await new Promise((r) => setTimeout(r, 100));
    expect(b.recebidos.slice(antes).map((x) => x.evento).filter((e) => e !== 'mensagem:reacoes')).toEqual([]);
    const h = await app!.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: auth(ana.token) });
    expect((h.json().mensagens as MensagemDto[]).find((x) => x.id === m.id)!.reacoes).toHaveLength(2);
    // Mensagem sem reação não ganha o campo (o DTO continua igual ao de antes).
    const n = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'sem reação' })).valor!;
    expect(n).not.toHaveProperty('reacoes');
  });

  it('CA-9: reagir não muda o contador de não lidas de quem escreveu', async () => {
    const { beto, a, b, canal } = await preparar();
    await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'uma' });
    const m = (await pedir<MensagemDto>(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'minha' })).valor!;
    const total = async () => (await app!.inject({ method: 'GET', url: '/api/nao-lidas', headers: auth(beto.token) })).json().total as number;
    const antes = await total();
    await reagir(a.s, m.id, '❤️');
    expect(await total()).toBe(antes);
  });

  it(`CA-5: até ${REACOES_POR_MENSAGEM} emojis diferentes; somar a um que já está continua valendo`, async () => {
    const { a, b, canal } = await preparar();
    const m = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'vote' })).valor!;
    const emojis = [...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂🤗'];
    // O limite de rajada é por conexão: metade por cada pessoa.
    for (const [i, e] of emojis.slice(0, REACOES_POR_MENSAGEM).entries()) expect((await reagir(i % 2 ? a.s : b.s, m.id, e)).ok).toBe(true);
    expect(await reagir(a.s, m.id, emojis[REACOES_POR_MENSAGEM]!)).toEqual({ ok: false, erro: `Esta mensagem já tem ${REACOES_POR_MENSAGEM} reações diferentes.` });
    const depois = (await reagir(b.s, m.id, emojis[1]!)).valor!;
    expect(depois.map((r) => r.emoji)).toEqual(emojis.slice(0, REACOES_POR_MENSAGEM));
  });

  it('CA-6: texto que não é um emoji padrão é recusado e nada é gravado; mensagem inexistente também', async () => {
    const { a, canal } = await preparar();
    const m = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'x' })).valor!;
    for (const e of ['abc', '👍👍', ' 👍', '', 42, null]) expect(await reagir(a.s, m.id, e as string)).toEqual({ ok: false, erro: 'Emoji inválido.' });
    expect(await reagir(a.s, 999_999, '👍')).toEqual({ ok: false, erro: 'Mensagem não encontrada.' });
    const historico = await pedir<MensagemDto>(a.s, 'mensagem:editar', { id: m.id, texto: 'y' });
    expect(historico.valor).not.toHaveProperty('reacoes');
  });

  it('rajada: mais de 20 pedidos em 10 s pela mesma conexão são recusados', async () => {
    const { a, canal } = await preparar();
    const m = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'x' })).valor!;
    for (let i = 0; i < 20; i++) expect((await reagir(a.s, m.id, '👍')).ok).toBe(true);
    expect(await reagir(a.s, m.id, '👍')).toEqual({ ok: false, erro: 'Calma, muitas reações seguidas.' });
  });

  it('CA-7: de castigo, não reage no canal', async () => {
    const { dono, ana, a, b, canal } = await preparar();
    const m = (await pedir<MensagemDto>(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'x' })).valor!;
    const r = await app!.inject({ method: 'POST', url: `/api/moderacao/${ana.usuario.id}/castigo`, headers: auth(dono.token), payload: { minutos: 10 } });
    expect(r.statusCode).toBe(200);
    expect(await reagir(a.s, m.id, '👍')).toEqual({ ok: false, erro: 'Você não pode reagir aqui.' });
  });

  it('CA-8: editar mantém as reações; apagar a mensagem leva as reações junto', async () => {
    const { a, b, canal } = await preparar();
    const m = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'x' })).valor!;
    await reagir(b.s, m.id, '🔥');
    const editada = (await pedir<MensagemDto>(a.s, 'mensagem:editar', { id: m.id, texto: 'x editado' })).valor!;
    expect(editada.reacoes).toEqual([{ emoji: '🔥', usuarios: [expect.any(Number)] }]);
    expect((await pedir(a.s, 'mensagem:apagar', { id: m.id })).ok).toBe(true);
    const banco = (app as unknown as { banco: { prepare(sql: string): { get(...a: unknown[]): unknown } } }).banco;
    expect(banco.prepare('SELECT COUNT(*) AS n FROM reacoes WHERE mensagem_id = ?').get(m.id)).toEqual({ n: 0 });
  });

  it('CA-18: na DM, os dois reagem e só eles recebem; um terceiro não reage nem fica sabendo', async () => {
    const { beto, a, b, d } = await preparar();
    const dm = ((await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!).id;
    const m = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'só nós' })).valor!;
    const antesDono = d.recebidos.length;
    expect((await reagir(b.s, m.id, '🥳')).ok).toBe(true);
    await expect.poll(() => a.recebidos.some((x) => x.evento === 'mensagem:reacoes')).toBe(true);
    await expect.poll(() => b.recebidos.some((x) => x.evento === 'mensagem:reacoes')).toBe(true);
    expect(a.recebidos.find((x) => x.evento === 'mensagem:reacoes')!.dados).toMatchObject({ id: m.id, canalId: null, dmId: dm });
    expect(await reagir(d.s, m.id, '👍')).toEqual({ ok: false, erro: 'Conversa não encontrada.' });
    await new Promise((r) => setTimeout(r, 100));
    expect(d.recebidos.slice(antesDono).map((x) => x.evento)).not.toContain('mensagem:reacoes');
  });

  it('autorização: mensagem de canal de outro servidor não existe para esta conexão; DM com conta removida fica só para leitura', async () => {
    const { dono, beto, a, b, canal } = await preparar();
    const m = (await pedir<MensagemDto>(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'no principal' })).valor!;
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
    const port = (app!.server.address() as AddressInfo).port;
    const naFamilia: Cliente = conectar(`http://127.0.0.1:${port}`, { auth: { token: dono.token, comunidade: 2 }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(naFamilia);
    await new Promise((r) => naFamilia.once('ola', r));
    expect(await reagir(naFamilia, m.id, '👍')).toEqual({ ok: false, erro: 'Mensagem não encontrada.' });

    const dm = ((await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!).id;
    const nadm = (await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { dmId: dm }, texto: 'oi' })).valor!;
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${beto.usuario.id}`, headers: auth(dono.token) })).statusCode).toBeLessThan(300);
    expect(await reagir(a.s, nadm.id, '👍')).toEqual({ ok: false, erro: 'Essa conta foi removida; a conversa ficou só para leitura.' });
  });

  it('CA-20: cliente que manda só {destino, texto} continua funcionando e recebe o DTO sem campos novos', async () => {
    const { a, canal } = await preparar();
    const r = await pedir<MensagemDto>(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'cliente antigo' });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.valor!).sort()).toEqual(['anexos', 'autorId', 'canalId', 'criadaEm', 'dmId', 'editadaEm', 'id', 'texto']);
  });
});
