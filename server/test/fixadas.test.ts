import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import {
  FIXADAS_POR_CONVERSA,
  type DmDto,
  type EventosCliente,
  type EventosServidor,
  type FixadaDto,
  type MensagemDto,
  type OlaPayload,
} from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { inserirMensagem } from '../src/dominio/mensagens.js';
import { criarCanal } from '../src/dominio/canais.js';
import { contarNaoLidas } from '../src/dominio/leituras.js';

/** chat-fixar-e-buscar, T2: fixar e desafixar, lista de fixadas e a linha "fixou". */
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
  const s: Cliente = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(s);
  return { s, ola: await new Promise<OlaPayload>((r) => s.once('ola', r)) };
}
type Resposta<T = unknown> = { ok: boolean; valor?: T; erro?: string };
const pedir = <T = undefined>(s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta<T>>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta<T>) => void) => void)(evento, dados, r));
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const fixadas = async (token: string, url: string) => {
  const r = await app!.inject({ method: 'GET', url, headers: auth(token) });
  return { status: r.statusCode, lista: r.statusCode === 200 ? (r.json() as { fixadas: FixadaDto[] }).fixadas : [] };
};

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const beto = (await cadastrar(app, 'beto')).json() as { token: string; usuario: { id: number } };
  const d = await abrir(dono.token);
  const a = await abrir(ana.token);
  const b = await abrir(beto.token);
  const canal = a.ola.canais.find((c) => c.tipo === 'texto')!.id;
  const msg = (autor: number, texto: string, destino: { canalId: number } | { dmId: number } = { canalId: canal }) =>
    inserirMensagem(app!.banco, destino, autor, texto);
  /** Cargo com "Fixar mensagens" para a Ana. */
  const darPermissao = async () => {
    const cargo = (
      await app!.inject({
        method: 'POST',
        url: '/api/admin/funcoes',
        headers: auth(dono.token),
        payload: { nome: 'Fixa', cor: '#ff8800', permissoes: ['enviar_mensagens', 'fixar_mensagens'] },
      })
    ).json() as {
      id: number;
    };
    await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${ana.usuario.id}/funcao`, headers: auth(dono.token), payload: { funcaoId: cargo.id } });
  };
  return { dono, ana, beto, d, a, b, canal, msg, darPermissao };
}

describe('fixar mensagens (chat-fixar-e-buscar, T2)', () => {
  it('o ola anuncia os recursos novos', async () => {
    const { a } = await preparar();
    expect(a.ola.recursos).toEqual({ fixar: true, busca: true });
  });

  it('CA-1: sem a permissão (membro comum, ou de castigo com ela) não fixa', async () => {
    const { ana, a, msg, darPermissao, dono } = await preparar();
    const id = msg(ana.usuario.id, 'importante');
    expect((await pedir(a.s, 'mensagem:fixar', { id })).erro).toMatch(/não permite fixar/);
    await darPermissao();
    await app!.inject({ method: 'POST', url: `/api/moderacao/${ana.usuario.id}/castigo`, headers: auth(dono.token), payload: { minutos: 10 } });
    expect((await pedir(a.s, 'mensagem:fixar', { id })).ok).toBe(false);
  });

  it('CA-2/CA-5: com a permissão fixa; os outros recebem fixadas:mudou e a linha, que não conta como não lida; auditoria sem texto', async () => {
    const { ana, beto, a, b, canal, msg, darPermissao } = await preparar();
    await darPermissao();
    const id = msg(beto.usuario.id, 'o churrasco é sábado');
    const mudou = new Promise((r) => b.s.once('fixadas:mudou', r));
    const linha = new Promise<MensagemDto>((r) => b.s.once('mensagem:nova', r));
    expect((await pedir(a.s, 'mensagem:fixar', { id })).ok).toBe(true);
    expect(await mudou).toEqual({ canalId: canal, dmId: null, mensagemId: id, fixada: true, por: ana.usuario.id });
    const l = await linha;
    expect(l.fixou).toEqual({ mensagemId: id, apagada: false });
    expect(l.autorId).toBe(ana.usuario.id);
    expect(l.texto).toBe('fixou uma mensagem.');
    // A linha não conta como não lida para o Beto (só a mensagem dele mesmo, que também não conta).
    expect(contarNaoLidas(app!.banco, beto.usuario.id)[`c:${canal}`]).toBeUndefined();
    const lista = await fixadas(beto.token, `/api/canais/${canal}/fixadas`);
    expect(lista.lista.map((f) => [f.mensagem.id, f.fixadaPor])).toEqual([[id, ana.usuario.id]]);
    const auditoria = app!.banco.prepare("SELECT ator_id, detalhes FROM auditoria WHERE tipo = 'mensagem_fixada'").all() as {
      ator_id: number;
      detalhes: string;
    }[];
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.detalhes).not.toContain('churrasco');
    expect(
      app!.banco.prepare("SELECT ator_id AS ator, alvo_usuario_id AS alvo, canal_id AS canal FROM auditoria WHERE tipo = 'mensagem_fixada'").get(),
    ).toEqual({
      ator: ana.usuario.id,
      alvo: beto.usuario.id,
      canal,
    });
    // Fixar de novo não duplica nem gera outra linha; desafixar não gera linha e audita.
    expect((await pedir(a.s, 'mensagem:fixar', { id })).ok).toBe(true);
    expect((await pedir(a.s, 'mensagem:desafixar', { id })).ok).toBe(true);
    expect((await fixadas(beto.token, `/api/canais/${canal}/fixadas`)).lista).toEqual([]);
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM mensagens WHERE tipo = 'fixou'").get()).toEqual({ n: 1 });
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo = 'mensagem_desafixada'").get()).toEqual({ n: 1 });
    // Refixar logo depois: sem linha nova (anti-spam de 10 min).
    expect((await pedir(a.s, 'mensagem:fixar', { id })).ok).toBe(true);
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM mensagens WHERE tipo = 'fixou'").get()).toEqual({ n: 1 });
  });

  it('a linha "fixou" não se edita, não se responde, não recebe reação e não se fixa', async () => {
    const { beto, a, msg, darPermissao, canal } = await preparar();
    await darPermissao();
    const id = msg(beto.usuario.id, 'x');
    await pedir(a.s, 'mensagem:fixar', { id });
    const linha = (app!.banco.prepare("SELECT id FROM mensagens WHERE tipo = 'fixou'").get() as { id: number }).id;
    expect((await pedir(a.s, 'mensagem:editar', { id: linha, texto: 'falsificada' })).erro).toMatch(/não pode ser editada/);
    expect((await pedir(a.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'oi', respostaA: linha })).erro).toMatch(/não pode ser respondida/);
    expect((await pedir(a.s, 'reacao:alternar', { mensagemId: linha, emoji: '👍' })).erro).toMatch(/não recebe reações/);
    expect((await pedir(a.s, 'mensagem:fixar', { id: linha })).erro).toMatch(/não pode ser fixada/);
  });

  it('CA-3: na DM os dois fixam e desafixam; terceiro e administrador não fixam nem listam', async () => {
    const { ana, beto, a, b, d, dono } = await preparar();
    const dm = (await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!;
    const id = inserirMensagem(app!.banco, { dmId: dm.id }, ana.usuario.id, 'segredo da DM');
    expect((await pedir(b.s, 'mensagem:fixar', { id })).ok).toBe(true);
    expect((await fixadas(ana.token, `/api/dms/${dm.id}/fixadas`)).lista).toHaveLength(1);
    expect((await pedir(d.s, 'mensagem:fixar', { id })).ok).toBe(false);
    expect((await pedir(d.s, 'mensagem:desafixar', { id })).ok).toBe(false);
    expect((await fixadas(dono.token, `/api/dms/${dm.id}/fixadas`)).status).toBe(403);
    expect((await pedir(a.s, 'mensagem:desafixar', { id })).ok).toBe(true);
    expect((await fixadas(beto.token, `/api/dms/${dm.id}/fixadas`)).lista).toEqual([]);
    // DM não vai para a auditoria (RN-21).
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo LIKE 'mensagem_%fixada'").get()).toEqual({ n: 0 });
  });

  it('A17/CA-3: DM com conta removida fica só leitura; quem não participa (não administrador) não fixa nem recebe o aviso', async () => {
    const { ana, beto, a, b, dono } = await preparar();
    const caio = (await cadastrar(app!, 'caio')).json() as { token: string; usuario: { id: number } };
    const c = await abrir(caio.token);
    const dm = (await pedir<DmDto>(a.s, 'dm:abrir', { usuarioId: beto.usuario.id })).valor!;
    const id = inserirMensagem(app!.banco, { dmId: dm.id }, ana.usuario.id, 'só nossa');
    let caioViu = false;
    c.s.on('fixadas:mudou', () => (caioViu = true));
    expect((await pedir(c.s, 'mensagem:fixar', { id })).ok).toBe(false);
    expect((await pedir(b.s, 'mensagem:fixar', { id })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(caioViu).toBe(false);
    // Conta do Beto removida: a DM vira só leitura (lista continua).
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${beto.usuario.id}`, headers: auth(dono.token) });
    expect((await pedir(a.s, 'mensagem:desafixar', { id })).erro).toMatch(/só para leitura/);
    expect((await fixadas(ana.token, `/api/dms/${dm.id}/fixadas`)).lista).toHaveLength(1);
  });

  it('CA-4: com 50 fixadas, a 51ª é recusada com o aviso', async () => {
    const { beto, a, msg, darPermissao, canal, ana } = await preparar();
    await darPermissao();
    const agora = Date.now();
    for (let i = 0; i < FIXADAS_POR_CONVERSA; i++) {
      app!.banco
        .prepare('INSERT INTO mensagens_fixadas (mensagem_id, fixada_por, fixada_em) VALUES (?, ?, ?)')
        .run(msg(beto.usuario.id, `m${i}`), ana.usuario.id, agora);
    }
    const r = await pedir(a.s, 'mensagem:fixar', { id: msg(beto.usuario.id, 'a 51ª') });
    expect(r.erro).toBe('Este canal já tem 50 mensagens fixadas. Desafixe uma antes.');
    expect((await fixadas(ana.token, `/api/canais/${canal}/fixadas`)).lista).toHaveLength(50);
  });

  it('CA-7: apagada sai da lista e a linha mostra "apagada"; editada aparece com o texto novo', async () => {
    const { beto, a, b, msg, darPermissao, canal, ana } = await preparar();
    await darPermissao();
    const editar = await pedir<MensagemDto>(b.s, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'antes' });
    const apagar = msg(beto.usuario.id, 'vai sumir');
    await pedir(a.s, 'mensagem:fixar', { id: editar.valor!.id });
    await pedir(a.s, 'mensagem:fixar', { id: apagar });
    await pedir(b.s, 'mensagem:editar', { id: editar.valor!.id, texto: 'depois' });
    await pedir(b.s, 'mensagem:apagar', { id: apagar });
    const lista = (await fixadas(ana.token, `/api/canais/${canal}/fixadas`)).lista;
    expect(lista.map((f) => f.mensagem.texto)).toEqual(['depois']);
    const pagina = (await app!.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: auth(ana.token) })).json() as {
      mensagens: MensagemDto[];
    };
    const linhas = pagina.mensagens.filter((m) => m.fixou);
    expect(linhas.map((m) => m.fixou)).toEqual([
      { mensagemId: editar.valor!.id, apagada: false },
      { mensagemId: apagar, apagada: true },
    ]);
  });

  it('A1/A4: mensagem e canal de outro servidor são "não encontrados"', async () => {
    const { dono, a, darPermissao, ana } = await preparar();
    await darPermissao();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const outro = criarCanal(app!.banco, 'texto', 'secreto', dono.usuario.id, Date.now(), 2);
    const id = inserirMensagem(app!.banco, { canalId: outro.id }, dono.usuario.id, 'de lá');
    expect((await pedir(a.s, 'mensagem:fixar', { id })).erro).toMatch(/não encontrada/);
    expect((await fixadas(ana.token, `/api/canais/${outro.id}/fixadas`)).status).toBe(404);
    expect((await fixadas(dono.token, `/api/canais/${outro.id}/fixadas`)).status).toBe(404);
  });

  it('A11: muitos fixar/desafixar seguidos param no limite', async () => {
    const { beto, a, msg, darPermissao } = await preparar();
    await darPermissao();
    const id = msg(beto.usuario.id, 'x');
    const respostas = [];
    for (let i = 0; i < 8; i++) respostas.push(await pedir(a.s, i % 2 ? 'mensagem:desafixar' : 'mensagem:fixar', { id }));
    expect(respostas.filter((r) => !r.ok).at(-1)?.erro).toMatch(/muitas mensagens fixadas/);
    expect(respostas.filter((r) => r.ok)).toHaveLength(5);
  });
});
