import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, OlaPayload, VozEstadoDto, VozEstadoPedido } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { lerConfig } from '../src/config.js';
import { appTeste, cadastrar } from './apoio.js';

const LIVEKIT = { CARENCIA_OFFLINE_MS: '100', LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'chave-teste', LIVEKIT_API_SECRET: 'segredo-de-teste-com-tamanho-suficiente' };

let app: FastifyInstance | undefined;
const sockets: Socket<EventosServidor, EventosCliente>[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

type Cliente = Socket<EventosServidor, EventosCliente>;

async function abrir(token: string): Promise<{ s: Cliente; ola: OlaPayload }> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  }) as Cliente;
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}

function pedir<T>(s: Cliente, evento: 'canal:criar' | 'canal:remover' | 'voz:estado', dados: unknown): Promise<{ ok: true; valor: T } | { ok: false; erro: string }> {
  return new Promise((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
}

const listarVoz = () => app!.tempoReal.voz.estados().map((e) => e.canalVozId);
const proximoEstado = (s: Cliente) => new Promise<VozEstadoDto[]>((r) => s.once('voz:estados', r));
const voz = (canalVozId: number | null, extra: Partial<VozEstadoPedido> = {}): VozEstadoPedido => ({ canalVozId, mudo: false, surdo: false, camera: false, ...extra });

async function preparar() {
  app = await appTeste(LIVEKIT);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const ana = (await cadastrar(app, 'ana')).json().token as string;
  const a = await abrir(dono);
  const b = await abrir(ana);
  const criar = async (tipo: 'texto' | 'voz', nome: string) => ((await pedir<CanalDto>(a.s, 'canal:criar', { tipo, nome })) as { valor: CanalDto }).valor;
  return { dono, ana, a, b, criar };
}

describe('config do LiveKit', () => {
  it('opcional, mas completa e com ws(s)://', () => {
    expect(lerConfig({}).livekit).toBeUndefined();
    expect(lerConfig(LIVEKIT).livekit).toEqual({ url: 'ws://127.0.0.1:7880', urlInterna: 'ws://127.0.0.1:7880', chave: 'chave-teste', segredo: LIVEKIT.LIVEKIT_API_SECRET });
    expect(lerConfig({ ...LIVEKIT, LIVEKIT_URL_INTERNA: 'http://livekit:7880/' }).livekit?.urlInterna).toBe('http://livekit:7880');
    expect(() => lerConfig({ LIVEKIT_URL: 'ws://x' })).toThrow(/juntos/);
    expect(() => lerConfig({ ...LIVEKIT, LIVEKIT_URL: 'http://x' })).toThrow(/ws:\/\//);
  });
});

describe('token do LiveKit (RF-13)', () => {
  it('sala do canal, identidade = id, cargo no metadado, só fontes permitidas', async () => {
    const { ana, criar } = await preparar();
    const sala = await criar('voz', 'Papo');
    const texto = await criar('texto', 'avisos');
    const pedirToken = (canalVozId: unknown, token: string | null = ana) =>
      app!.inject({ method: 'POST', url: '/api/livekit/token', payload: { canalVozId }, headers: token ? { authorization: `Bearer ${token}` } : {} });

    const r = await pedirToken(sala.id);
    expect(r.statusCode).toBe(200);
    expect(r.json().url).toBe('ws://127.0.0.1:7880');
    const claims = await new TokenVerifier(LIVEKIT.LIVEKIT_API_KEY, LIVEKIT.LIVEKIT_API_SECRET).verify(r.json().token);
    expect(claims.sub).toBe('2');
    expect(claims.name).toBe('ana');
    expect(JSON.parse(claims.metadata!)).toEqual({ cargo: 'membro' });
    expect(claims.video).toMatchObject({ room: `voz-${sala.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    expect(claims.video?.canPublishSources).toEqual(['microphone', 'camera', 'screen_share', 'screen_share_audio']);
    expect((claims.exp ?? 0) - (claims.nbf ?? claims.iat ?? 0)).toBeLessThanOrEqual(6 * 3600 + 5);

    expect((await pedirToken(texto.id)).statusCode).toBe(400);
    expect((await pedirToken(999)).statusCode).toBe(404);
    expect((await pedirToken('x')).statusCode).toBe(400);
    expect((await pedirToken(sala.id, null)).statusCode).toBe(401);
  });

  it('sem LiveKit configurado: 503 voz_indisponivel', async () => {
    app = await appTeste();
    const token = (await cadastrar(app, 'dono')).json().token as string;
    const r = await app.inject({ method: 'POST', url: '/api/livekit/token', payload: { canalVozId: 1 }, headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ erro: 'voz_indisponivel' });
  });
});

describe('presença em voz (RF-13, CA-49)', () => {
  it('entrar, mudar estado, trocar de canal e sair chegam a todos e vão para a auditoria', async () => {
    const { a, b, criar } = await preparar();
    const papo = await criar('voz', 'Papo');
    const jogo = await criar('voz', 'Jogo');

    let aviso = proximoEstado(a.s);
    expect(await pedir(b.s, 'voz:estado', voz(papo.id))).toEqual({ ok: true, valor: undefined });
    expect(await aviso).toEqual([{ usuarioId: 2, canalVozId: papo.id, mudo: false, surdo: false, camera: false }]);

    // Deafen também muta (RF-16).
    aviso = proximoEstado(a.s);
    await pedir(b.s, 'voz:estado', voz(papo.id, { surdo: true }));
    expect(await aviso).toEqual([{ usuarioId: 2, canalVozId: papo.id, mudo: true, surdo: true, camera: false }]);

    aviso = proximoEstado(a.s);
    await pedir(b.s, 'voz:estado', voz(jogo.id));
    expect((await aviso)[0]!.canalVozId).toBe(jogo.id);

    // Quem conecta depois recebe a presença no ola.
    const c = await abrir((await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'senha-forte-1' } })).json().token);
    expect(c.ola.voz).toEqual([{ usuarioId: 2, canalVozId: jogo.id, mudo: false, surdo: false, camera: false }]);

    // Outro computador da mesma pessoa que não está na voz não tira ninguém.
    await pedir(c.s, 'voz:estado', voz(null));
    aviso = proximoEstado(a.s);
    await pedir(b.s, 'voz:estado', voz(null));
    expect(await aviso).toEqual([]);

    // Entrar por outro computador (em outro canal) tira o primeiro: ele recebe voz:tirado.
    await pedir(b.s, 'voz:estado', voz(papo.id));
    const tirado = new Promise((r) => b.s.once('voz:tirado', r));
    aviso = proximoEstado(a.s);
    await pedir(c.s, 'voz:estado', voz(jogo.id));
    expect(await tirado).toEqual({ motivo: 'outro_computador' });
    expect((await aviso).map((e) => e.canalVozId)).toEqual([jogo.id]);
    // O primeiro, já tirado, não consegue tirar a presença do segundo.
    await pedir(b.s, 'voz:estado', voz(null));
    expect(listarVoz()).toEqual([jogo.id]);
    await pedir(c.s, 'voz:estado', voz(null));

    const registros = listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('voz_'));
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.canal?.nome, r.detalhes?.motivo]).reverse()).toEqual([
      ['voz_entrou', 'ana', 'Papo', undefined],
      ['voz_saiu', 'ana', 'Papo', 'trocou_de_canal'],
      ['voz_entrou', 'ana', 'Jogo', undefined],
      ['voz_saiu', 'ana', 'Jogo', 'saiu'],
      ['voz_entrou', 'ana', 'Papo', undefined],
      ['voz_saiu', 'ana', 'Papo', 'trocou_de_canal'],
      ['voz_entrou', 'ana', 'Jogo', undefined],
      ['voz_saiu', 'ana', 'Jogo', 'saiu'],
    ]);
  });

  it('recusa canal de texto, inexistente e dados ruins', async () => {
    const { b, criar } = await preparar();
    const texto = await criar('texto', 'avisos');
    expect(await pedir(b.s, 'voz:estado', voz(texto.id))).toEqual({ ok: false, erro: 'Esse canal não é de voz.' });
    expect(await pedir(b.s, 'voz:estado', voz(999))).toEqual({ ok: false, erro: 'Canal não encontrado.' });
    expect(await pedir(b.s, 'voz:estado', { canalVozId: 1, mudo: 'sim' })).toMatchObject({ ok: false });
    expect(await pedir(b.s, 'voz:estado', null)).toMatchObject({ ok: false });
  });

  it('queda curta do tempo real não tira da voz; reenvio do estado não gera saída/entrada', async () => {
    const { ana, a, b, criar } = await preparar();
    const papo = await criar('voz', 'Papo');
    await pedir(b.s, 'voz:estado', voz(papo.id));
    b.s.close();
    const b2 = await abrir(ana);
    await pedir(b2.s, 'voz:estado', voz(papo.id));
    await new Promise((r) => setTimeout(r, 200));
    expect(listarVoz()).toEqual([papo.id]);
    expect(listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('voz_')).map((r) => r.tipo)).toEqual(['voz_entrou']);
    void a;
  });

  it('sessão revogada (conta removida) sai da voz na hora', async () => {
    const { a, b, criar } = await preparar();
    const papo = await criar('voz', 'Papo');
    await pedir(b.s, 'voz:estado', voz(papo.id));
    const aviso = proximoEstado(a.s);
    app!.tempoReal.revogarUsuario(2, 'conta_removida');
    expect(await aviso).toEqual([]);
    expect(listarAuditoria(app!.banco).registros.find((r) => r.tipo === 'voz_saiu')?.detalhes?.motivo).toBe('sessao_revogada');
  });

  it('desconectar (depois da carência) ou remover o canal tira da voz', async () => {
    const { a, b, criar } = await preparar();
    const papo = await criar('voz', 'Papo');
    await pedir(a.s, 'voz:estado', voz(papo.id));
    let aviso = proximoEstado(a.s);
    await pedir(b.s, 'voz:estado', voz(papo.id));
    expect(await aviso).toHaveLength(2);

    aviso = proximoEstado(a.s);
    b.s.close();
    expect((await aviso).map((e) => e.usuarioId)).toEqual([1]);

    aviso = proximoEstado(a.s);
    await pedir(a.s, 'canal:remover', { id: papo.id });
    expect(await aviso).toEqual([]);
    const motivos = listarAuditoria(app!.banco).registros.filter((r) => r.tipo === 'voz_saiu').map((r) => [r.ator?.nome, r.detalhes?.motivo, r.canal?.nome]);
    expect(motivos).toEqual([
      ['dono', 'canal_removido', 'Papo'],
      ['ana', 'desconectou', 'Papo'],
    ]);
  });
});

describe('webhook do LiveKit', () => {
  async function webhook(corpo: Record<string, unknown>, segredo = LIVEKIT.LIVEKIT_API_SECRET) {
    const texto = JSON.stringify(corpo);
    const t = new AccessToken(LIVEKIT.LIVEKIT_API_KEY, segredo);
    t.sha256 = createHash('sha256').update(texto).digest('base64');
    return app!.inject({ method: 'POST', url: '/api/livekit/webhook', payload: texto, headers: { 'content-type': 'application/webhook+json', authorization: await t.toJwt() } });
  }

  it('participant_left tira da voz; assinatura inválida é recusada', async () => {
    const { a, b, criar } = await preparar();
    const papo = await criar('voz', 'Papo');
    await pedir(b.s, 'voz:estado', voz(papo.id));

    expect((await webhook({ event: 'participant_left', room: { name: `voz-${papo.id}` }, participant: { identity: '2' } }, 'segredo-errado-com-tamanho-suficiente')).statusCode).toBe(401);
    expect((await app!.inject({ method: 'POST', url: '/api/livekit/webhook', payload: '{}', headers: { 'content-type': 'application/webhook+json' } })).statusCode).toBe(401);

    // Sessão de mídia antiga (sid diferente do informado pelo app) não tira a presença atual.
    await pedir(b.s, 'voz:estado', voz(papo.id, { sid: 'PA_novo' }));
    await webhook({ event: 'participant_left', room: { name: `voz-${papo.id}` }, participant: { identity: '2', sid: 'PA_velho' } });
    expect(listarVoz()).toEqual([papo.id]);
    // Evento velho (reenvio) é ignorado.
    await webhook({ event: 'participant_left', room: { name: `voz-${papo.id}` }, participant: { identity: '2', sid: 'PA_novo' }, createdAt: Math.floor(Date.now() / 1000) - 3600 });
    expect(listarVoz()).toEqual([papo.id]);

    // Sala de outro canal não mexe na presença.
    expect((await webhook({ event: 'participant_left', room: { name: 'voz-999' }, participant: { identity: '2' } })).statusCode).toBe(200);
    const aviso = proximoEstado(a.s);
    const evento = { id: 'EV_1', event: 'participant_left', room: { name: `voz-${papo.id}` }, participant: { identity: '2', sid: 'PA_novo' } };
    expect((await webhook(evento)).statusCode).toBe(200);
    expect(await aviso).toEqual([]);
    // Mesmo evento reenviado depois de voltar à voz: ignorado.
    await pedir(b.s, 'voz:estado', voz(papo.id, { sid: 'PA_outro' }));
    await webhook(evento);
    expect(listarVoz()).toEqual([papo.id]);
    expect(listarAuditoria(app!.banco).registros.find((r) => r.tipo === 'voz_saiu')?.detalhes?.motivo).toBe('midia_saiu');
    // R-2: tela publicada fora da regra chega pelo webhook e é conferida (o LiveKit de teste nem existe: só não pode derrubar).
    const tela = { id: 'EV_tela', event: 'track_published', room: { name: `voz-${papo.id}` }, participant: { identity: '2' }, track: { sid: 'TR_1', source: 3, width: 1920, height: 1080 } };
    expect((await webhook(tela)).statusCode).toBe(200);
  });
});
