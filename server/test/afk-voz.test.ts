import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { abrirBanco } from '../src/db/banco.js';
import { criarCanal } from '../src/dominio/canais.js';
import { criarVoz } from '../src/realtime/voz.js';
import type { ServidorTempoReal, SocketTofalando } from '../src/realtime/tempo-real.js';
import { appTeste, cadastrar } from './apoio.js';

/** mover-e-afk, T3: sala de AFK na voz (RN-9, A6–A9) e token sem publicação. */
function socketFalso(id: string, usuarioId: number) {
  const tratadores = new Map<string, (...a: unknown[]) => void>();
  const socket = { id, data: { usuarioId, comunidadeId: 1 }, on: (e: string, fn: (...a: unknown[]) => void) => tratadores.set(e, fn) };
  const pedir = (dados: unknown) => new Promise<{ ok: boolean; erro?: string }>((r) => tratadores.get('voz:estado')!(dados, r));
  return { socket: socket as unknown as SocketTofalando, pedir };
}

function preparar() {
  const banco = abrirBanco(':memory:');
  banco.prepare("INSERT INTO usuarios (id, usuario, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (1, 'ana', 'x', 'ana', '#00f0ff', 'membro', 0)").run();
  banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (1, 1, 'membro', 0)").run();
  const papo = criarCanal(banco, 'voz', 'Papo', 1);
  const afk = criarCanal(banco, 'voz', 'AFK', 1);
  banco.prepare('UPDATE comunidades SET afk_canal_id = ? WHERE id = 1').run(afk.id);
  const io = {
    emit: () => undefined,
    to: () => ({ emit: () => undefined }),
    of: () => ({ adapter: { rooms: new Map([['comunidade:1', new Set()]]) } }),
  } as unknown as ServidorTempoReal;
  const removerDaMidia = vi.fn(async () => undefined);
  const calarNaMidia = vi.fn(async () => undefined);
  const voz = criarVoz(io, banco, (e) => {
    throw e;
  }, { carenciaMs: 20, removerDaMidia, calarNaMidia, prazoMoverMs: 50 });
  const { socket, pedir } = socketFalso('s1', 1);
  voz.registrar(socket);
  return { banco, voz, papo, afk, pedir, removerDaMidia, calarNaMidia };
}
const estado = (canalVozId: number, extra: object = {}) => ({ canalVozId, mudo: false, surdo: false, camera: true, ...extra });

describe('sala de AFK na voz', () => {
  it('RN-9: na AFK fica mudo e sem câmera, mesmo se o app pedir outra coisa', async () => {
    const { voz, afk, pedir } = preparar();
    expect((await pedir(estado(afk.id))).ok).toBe(true);
    expect(voz.estados()).toMatchObject([{ canalVozId: afk.id, mudo: true, camera: false }]);
  });

  it('A8/A9: motivo afk só para a AFK deste servidor; uma ida por minuto; auditoria voz_afk', async () => {
    const { banco, papo, afk, pedir } = preparar();
    await pedir(estado(papo.id));
    expect((await pedir(estado(papo.id, { motivo: 'afk' }))).erro).toMatch(/não é a de AFK/);
    expect((await pedir(estado(afk.id, { motivo: 'afk' }))).ok).toBe(true);
    await pedir(estado(papo.id));
    expect((await pedir(estado(afk.id, { motivo: 'afk' }))).erro).toMatch(/idas seguidas/);
    expect((await pedir(estado(papo.id, { motivo: 'outro' }))).ok).toBe(false);
    const reg = banco.prepare("SELECT ator_id AS ator, canal_id AS canal, detalhes FROM auditoria WHERE tipo = 'voz_afk'").all() as { ator: number; canal: number; detalhes: string }[];
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ ator: 1, canal: afk.id });
    expect(JSON.parse(reg[0]!.detalhes)).toMatchObject({ de: 'Papo' });
  });

  it('A6: quem entra numa sala do LiveKit sem estar nela pela presença é tirado depois do prazo; quem está, não', async () => {
    const { voz, papo, afk, pedir, removerDaMidia } = preparar();
    await pedir(estado(papo.id));
    voz.midiaEntrou(1, papo.id);
    voz.midiaEntrou(1, afk.id);
    await new Promise((r) => setTimeout(r, 120));
    expect(removerDaMidia).toHaveBeenCalledTimes(1);
    expect(removerDaMidia).toHaveBeenCalledWith(1, afk.id);
  });

  it('A7: a AFK passa a ser uma sala ocupada — quem está nela fica mudo e sem poder publicar', async () => {
    const { banco, voz, papo, pedir, calarNaMidia } = preparar();
    await pedir(estado(papo.id));
    banco.prepare('UPDATE comunidades SET afk_canal_id = ? WHERE id = 1').run(papo.id);
    voz.afkMudou(1);
    expect(voz.estados()).toMatchObject([{ canalVozId: papo.id, mudo: true, camera: false }]);
    expect(calarNaMidia).toHaveBeenCalledWith(1, papo.id);
  });
});

describe('token da sala de AFK', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('RN-9/A7: o token da AFK não deixa publicar nada; o de outra sala, sim', async () => {
    app = await appTeste({ LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'chave-teste', LIVEKIT_API_SECRET: 'segredo-de-teste-com-tamanho-suficiente' });
    const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
    const papo = criarCanal(app.banco, 'voz', 'Papo', dono.usuario.id).id;
    const afk = criarCanal(app.banco, 'voz', 'AFK', dono.usuario.id).id;
    app.banco.prepare('UPDATE comunidades SET afk_canal_id = ? WHERE id = 1').run(afk);
    const grant = async (canalVozId: number) => {
      const r = await app!.inject({ method: 'POST', url: '/api/livekit/token', headers: { authorization: `Bearer ${dono.token}` }, payload: { canalVozId } });
      const jwt = (r.json() as { token: string }).token;
      return JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()).video as { canPublish: boolean; canPublishSources?: string[] };
    };
    expect(await grant(afk)).toMatchObject({ canPublish: false, canPublishSources: [] });
    const normal = await grant(papo);
    expect(normal.canPublish).toBe(true);
    expect(normal.canPublishSources?.length).toBeGreaterThan(0);
  });
});
