import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { io as conectar, type Socket } from 'socket.io-client';
import { HISTORICO_ATE_MAX, trechoDeResposta as trechoDe, type AnexoDto, type DmDto, type EventosCliente, type EventosServidor, type MensagemDto, type OlaPayload, type PaginaMensagens } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { inserirMensagem } from '../src/dominio/mensagens.js';

/** Reações e respostas (0.16.0), parte do servidor: respostas e histórico até um id (T2). */
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
type Resposta<T = unknown> = { ok: boolean; valor?: T; erro?: string };
const pedir = <T = MensagemDto>(s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta<T>>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta<T>) => void) => void)(evento, dados, r));
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const beto = (await cadastrar(app, 'beto')).json() as { token: string; usuario: { id: number } };
  const a = await abrir(ana.token);
  const b = await abrir(beto.token);
  const canal = a.ola.canais.find((c) => c.tipo === 'texto')!.id;
  return { dono, ana, beto, a, b, canal };
}

const enviar = (s: Cliente, destino: object, texto: string, extra: object = {}) => pedir(s, 'mensagem:enviar', { destino, texto, ...extra });
const historico = async (token: string, url: string) => (await app!.inject({ method: 'GET', url, headers: auth(token) })).json() as PaginaMensagens;

describe('respostas (T2)', () => {
  it('trecho: primeira linha, até 100 caracteres', () => {
    expect(trechoDe('  oi\nsegunda linha')).toBe('oi');
    const longo = 'a'.repeat(150);
    expect([...trechoDe(longo)]).toHaveLength(100);
    expect(trechoDe(longo).endsWith('…')).toBe(true);
    // Não parte emoji composto no corte.
    const familia = 'a'.repeat(98) + '👨‍👩‍👧' + 'fim';
    expect(trechoDe(familia)).toBe('a'.repeat(98) + '👨‍👩‍👧…');
  });

  it('CA-10/CA-14: a resposta traz o trecho da original e avisa o autor dela como uma menção', async () => {
    const { ana, beto, a, b, canal } = await preparar();
    const original = (await enviar(b.s, { canalId: canal }, 'vamos jogar hoje?\nàs 21h')).valor!;
    const nova = new Promise<MensagemDto>((r) => b.s.on('mensagem:nova', (m) => m.autorId === ana.usuario.id && r(m)));
    const r = (await enviar(a.s, { canalId: canal }, 'concordo', { respostaA: original.id })).valor!;
    expect(r.resposta).toEqual({ id: original.id, autorId: beto.usuario.id, trecho: 'vamos jogar hoje?' });
    expect(r.mencoes).toEqual([beto.usuario.id]);
    expect((await nova).resposta).toMatchObject({ id: original.id });
    const h = await historico(ana.token, `/api/canais/${canal}/mensagens`);
    expect(h.mensagens.at(-1)!.resposta).toEqual(r.resposta);
  });

  it('CA-15: sem aviso, ou respondendo a si mesmo, ninguém é marcado; editar mantém o aviso de quem era avisado', async () => {
    const { beto, a, b, canal } = await preparar();
    const dele = (await enviar(b.s, { canalId: canal }, 'pergunta')).valor!;
    const minha = (await enviar(a.s, { canalId: canal }, 'minha')).valor!;
    expect((await enviar(a.s, { canalId: canal }, 'sem aviso', { respostaA: dele.id, avisar: false })).valor).not.toHaveProperty('mencoes');
    expect((await enviar(a.s, { canalId: canal }, 'eu mesma', { respostaA: minha.id })).valor).not.toHaveProperty('mencoes');

    const avisando = (await enviar(a.s, { canalId: canal }, 'resposta', { respostaA: dele.id })).valor!;
    expect(avisando.mencoes).toEqual([beto.usuario.id]);
    const editada = (await pedir(a.s, 'mensagem:editar', { id: avisando.id, texto: 'resposta melhor' })).valor!;
    expect(editada.mencoes).toEqual([beto.usuario.id]);
    expect(editada.resposta).toMatchObject({ id: dele.id, trecho: 'pergunta' });
  });

  it('CA-12/CA-13: original só com anexo vira "soAnexo"; editada mostra o texto novo; apagada vira "apagada"', async () => {
    const { ana, a, b, canal } = await preparar();
    const png = await sharp(randomBytes(8 * 8 * 3), { raw: { width: 8, height: 8, channels: 3 } }).png().toBuffer();
    const limite = '----t' + randomBytes(4).toString('hex');
    const payload = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="f.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const up = await app!.inject({ method: 'POST', url: '/api/anexos', payload, headers: { 'content-type': `multipart/form-data; boundary=${limite}`, authorization: `Bearer ${ana.token}` } });
    expect(up.statusCode).toBe(201);
    const soImagem = (await enviar(a.s, { canalId: canal }, '', { anexos: [(up.json() as AnexoDto).id] })).valor!;
    expect((await enviar(b.s, { canalId: canal }, 'que foto', { respostaA: soImagem.id })).valor!.resposta).toMatchObject({ trecho: '', soAnexo: true });

    const texto = (await enviar(a.s, { canalId: canal }, 'antes')).valor!;
    const resposta = (await enviar(b.s, { canalId: canal }, 'ok', { respostaA: texto.id })).valor!;
    await pedir(a.s, 'mensagem:editar', { id: texto.id, texto: 'depois' });
    const achar = async () => (await historico(ana.token, `/api/canais/${canal}/mensagens`)).mensagens.find((m) => m.id === resposta.id)!;
    expect((await achar()).resposta).toMatchObject({ trecho: 'depois' });
    expect((await pedir(a.s, 'mensagem:apagar', { id: texto.id })).ok).toBe(true);
    expect((await achar()).resposta).toEqual({ id: texto.id, apagada: true });
  });

  it('CA-16: responder a mensagem de outro canal, de uma DM ou inexistente é recusado', async () => {
    const { beto, a, b, canal } = await preparar();
    const outro = (await pedir<{ id: number }>(a.s, 'canal:criar', { tipo: 'texto', nome: 'outro' })).valor!.id;
    const laFora = (await enviar(b.s, { canalId: outro }, 'em outro canal')).valor!;
    const erro = { ok: false, erro: 'Mensagem respondida não encontrada.' };
    expect(await enviar(a.s, { canalId: canal }, 'x', { respostaA: laFora.id })).toEqual(erro);
    const dm = (await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!.id;
    const naDm = (await enviar(a.s, { dmId: dm }, 'na dm')).valor!;
    expect(await enviar(a.s, { canalId: canal }, 'x', { respostaA: naDm.id })).toEqual(erro);
    expect(await enviar(a.s, { canalId: canal }, 'x', { respostaA: 999_999 })).toEqual(erro);
    expect(await enviar(a.s, { canalId: canal }, 'x', { respostaA: 'abc' })).toEqual({ ok: false, erro: 'Mensagem respondida inválida.' });
  });

  it('CA-18: na DM, responder funciona e avisa o outro participante', async () => {
    const { beto, a, b } = await preparar();
    const dm = (await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!.id;
    const dele = (await enviar(b.s, { dmId: dm }, 'oi ana')).valor!;
    const r = (await enviar(a.s, { dmId: dm }, 'oi beto', { respostaA: dele.id })).valor!;
    expect(r).toMatchObject({ dmId: dm, mencoes: [beto.usuario.id], resposta: { id: dele.id, trecho: 'oi ana' } });
  });

  it('CA-11/CA-18: ?ate também na DM', async () => {
    const { ana, beto, a } = await preparar();
    const dm = (await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!.id;
    const banco = (app as unknown as { banco: Parameters<typeof inserirMensagem>[0] }).banco;
    const ids: number[] = [];
    for (let i = 0; i < 60; i++) ids.push(inserirMensagem(banco, { dmId: dm }, i % 2 ? ana.usuario.id : beto.usuario.id, `d${i}`));
    const url = `/api/dms/${dm}/mensagens`;
    const primeira = (await historico(ana.token, url)).mensagens[0]!.id;
    const ate = await historico(ana.token, `${url}?antes=${primeira}&ate=${ids[3]}`);
    expect(ate.mensagens.map((m) => m.id)).toEqual(ids.slice(3, ids.indexOf(primeira)));
    expect(ate.fim).toBe(false);
  });

  it('aviso: só para quem ainda alcança a conversa; "avisar" precisa ser verdadeiro ou falso', async () => {
    const { dono, beto, a, b, canal } = await preparar();
    const dele = (await enviar(b.s, { canalId: canal }, 'antes de sair')).valor!;
    expect(await enviar(a.s, { canalId: canal }, 'x', { respostaA: dele.id, avisar: 'false' })).toEqual({ ok: false, erro: 'Aviso inválido.' });
    const resposta = (await enviar(a.s, { canalId: canal }, 'resposta', { respostaA: dele.id })).valor!;
    expect(resposta.mencoes).toEqual([beto.usuario.id]);
    // A conta do beto é removida: editar não o marca de novo, e responder de novo não o avisa.
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${beto.usuario.id}`, headers: auth(dono.token) })).statusCode).toBeLessThan(300);
    expect((await pedir(a.s, 'mensagem:editar', { id: resposta.id, texto: 'resposta 2' })).valor).not.toHaveProperty('mencoes');
    expect((await enviar(a.s, { canalId: canal }, 'de novo', { respostaA: dele.id })).valor).not.toHaveProperty('mencoes');
  });

  it(`CA-11: ?ate devolve tudo da original até a página carregada (até ${HISTORICO_ATE_MAX}); acima disso, a página normal`, async () => {
    const { ana, canal } = await preparar();
    const banco = (app as unknown as { banco: Parameters<typeof inserirMensagem>[0] }).banco;
    const ids: number[] = [];
    for (let i = 0; i < 250; i++) ids.push(inserirMensagem(banco, { canalId: canal }, ana.usuario.id, `m${i}`));
    const url = `/api/canais/${canal}/mensagens`;
    const pagina = await historico(ana.token, url);
    const primeira = pagina.mensagens[0]!.id;
    const ate = await historico(ana.token, `${url}?antes=${primeira}&ate=${ids[10]}`);
    expect(ate.mensagens[0]!.id).toBe(ids[10]);
    expect(ate.mensagens.at(-1)!.id).toBe(primeira - 1);
    expect(ate.fim).toBe(false);
    expect((await historico(ana.token, `${url}?antes=${primeira}&ate=${ids[0]}`)).fim).toBe(true);
    // ate depois de antes: vale a página normal.
    expect((await historico(ana.token, `${url}?antes=${ids[5]}&ate=${ids[100]}`)).mensagens.at(-1)!.id).toBe(ids[4]);

    for (let i = 0; i < HISTORICO_ATE_MAX; i++) inserirMensagem(banco, { canalId: canal }, ana.usuario.id, `n${i}`);
    const longe = await historico(ana.token, `${url}?ate=${ids[0]}`);
    expect(longe.mensagens).toHaveLength(50);
    expect(longe.fim).toBe(false);
  });
});
