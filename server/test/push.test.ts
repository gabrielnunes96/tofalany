import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, DmDto, ResumoPushDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { criarPush, INTERVALO_AVISO_MS, tomarPendentes, type Transporte } from '../src/dominio/push.js';
import { criarTransporteFcm } from '../src/dominio/fcm.js';
import { appTeste, cadastrar } from './apoio.js';

/** celular, T2: push sem conteúdo e preferências de aviso (CA-8, CA-9, CA-16; A3–A7, A19, A21). */
let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const FCM = (n = 1) => `token-do-aparelho-${n}-${'x'.repeat(30)}`;
const K = (n = 1) => String(n).repeat(32).slice(0, 32).replace(/\D/g, 'a');
const pedir = (s: Socket, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const bia = (await cadastrar(app, 'bia')).json() as { token: string; usuario: { id: number } };
  // O celular da Bia: outra sessão, com o aparelho registrado e o app fechado (sem socket).
  const celular = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'bia', senha: 'Senha-forte-1', aparelho: 'Android' } })).json() as { token: string };
  expect((await app.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(celular.token), payload: { fcmToken: FCM(), k: K() } })).statusCode).toBe(204);
  const enviados: Parameters<Transporte>[0][] = [];
  app.tempoReal.push.usarTransporte(async (a) => {
    enviados.push(a);
    return 'ok';
  });
  const abrir = async (token: string) => {
    const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    return s;
  };
  return { ana, bia, celular, enviados, abrir };
}

describe('push sem conteúdo', () => {
  it('CA-8: DM para quem está com o app fechado → aviso só com {k}; o resumo é buscado uma vez, pela própria sessão', async () => {
    const { ana, bia, celular, enviados, abrir } = await preparar();
    const a = await abrir(ana.token);
    const dm = (await pedir(a, 'dm:abrir', { usuarioId: bia.usuario.id })).valor as DmDto;
    expect((await pedir(a, 'mensagem:enviar', { destino: { dmId: dm.id }, texto: 'oi bia, tudo bem?' })).ok).toBe(true);
    await vi.waitFor(() => expect(enviados).toHaveLength(1));
    expect(Object.keys(enviados[0]!).sort()).toEqual(['fcmToken', 'k', 'ttlSegundos', 'urgente']);
    expect(enviados[0]).toMatchObject({ fcmToken: FCM(), k: K() });
    // Outra sessão (o computador da Bia) e k errado: nada.
    expect((await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${K()}`, headers: auth(bia.token) })).statusCode).toBe(404);
    expect((await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${'f'.repeat(32)}`, headers: auth(celular.token) })).statusCode).toBe(404);
    const pendentes = (await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${K()}`, headers: auth(celular.token) })).json() as ResumoPushDto[];
    expect(pendentes).toEqual([expect.objectContaining({ tipo: 'mensagem', porNome: 'ana', texto: 'oi bia, tudo bem?', onde: 'Conversa direta', conversa: `d:${dm.id}` })]);
    // Uso único.
    expect((await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${K()}`, headers: auth(celular.token) })).json()).toEqual([]);
  });

  it('canal: só quem foi mencionado; app aberto naquele aparelho não recebe push; o autor nunca', async () => {
    const { ana, celular, enviados, abrir } = await preparar();
    const a = await abrir(ana.token);
    const canal = ((await pedir(a, 'canal:criar', { tipo: 'texto', nome: 'papo' })).valor as CanalDto).id;
    await pedir(a, 'mensagem:enviar', { destino: { canalId: canal }, texto: 'sem menção' });
    await new Promise((r) => setTimeout(r, 100));
    expect(enviados).toHaveLength(0);
    // Com o app aberto no celular, nada de push.
    const noCelular = await abrir(celular.token);
    await pedir(a, 'mensagem:enviar', { destino: { canalId: canal }, texto: '@bia olha' });
    await new Promise((r) => setTimeout(r, 100));
    expect(enviados).toHaveLength(0);
    noCelular.close();
    await new Promise((r) => setTimeout(r, 100));
    await pedir(a, 'mensagem:enviar', { destino: { canalId: canal }, texto: '@bia agora sim' });
    await vi.waitFor(() => expect(enviados).toHaveLength(1));
    const [r] = (await app!.inject({ method: 'GET', url: `/api/push/pendentes?k=${K()}`, headers: auth(celular.token) })).json() as ResumoPushDto[];
    expect(r).toMatchObject({ onde: '#papo', texto: '@bia agora sim', comunidadeId: 1 });
  });

  it('CA-9/CA-16: mensagens desligadas ou conversa silenciada → sem push; preferências validadas', async () => {
    const { ana, bia, enviados, abrir } = await preparar();
    const a = await abrir(ana.token);
    const dm = (await pedir(a, 'dm:abrir', { usuarioId: bia.usuario.id })).valor as DmDto;
    const prefs = await app!.inject({ method: 'PUT', url: '/api/conta/preferencias-aviso', headers: auth(bia.token), payload: { mensagens: true, chamados: true, silenciadas: [`d:${dm.id}`, 'lixo'] } });
    expect(prefs.json()).toEqual({ mensagens: true, chamados: true, silenciadas: [`d:${dm.id}`] });
    await pedir(a, 'mensagem:enviar', { destino: { dmId: dm.id }, texto: 'silenciada' });
    await app!.inject({ method: 'PUT', url: '/api/conta/preferencias-aviso', headers: auth(bia.token), payload: { mensagens: false, chamados: true, silenciadas: [] } });
    await pedir(a, 'mensagem:enviar', { destino: { dmId: dm.id }, texto: 'desligadas' });
    await new Promise((r) => setTimeout(r, 150));
    expect(enviados).toHaveLength(0);
    expect((await app!.inject({ method: 'PUT', url: '/api/conta/preferencias-aviso', headers: auth(bia.token), payload: { mensagens: 'sim' } })).statusCode).toBe(400);
  });

  it('A3/RN-5: sair e desconectar o aparelho apagam o registro (CASCADE); A4: o mesmo token muda de sessão; auditoria sem o token', async () => {
    const { bia, celular } = await preparar();
    const conta = () => (app!.banco.prepare('SELECT COUNT(*) AS n FROM push_aparelhos').get() as { n: number }).n;
    // A4: o mesmo token registrado no computador da Bia sai do celular (uma linha só).
    expect((await app!.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(bia.token), payload: { fcmToken: FCM(), k: K(2) } })).statusCode).toBe(204);
    expect(conta()).toBe(1);
    await app!.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(celular.token), payload: { fcmToken: FCM(3), k: K() } });
    expect(conta()).toBe(2);
    await app!.inject({ method: 'POST', url: '/api/auth/sair', headers: auth(celular.token) });
    expect(conta()).toBe(1);
    const id = ((await app!.inject({ method: 'GET', url: '/api/sessoes', headers: auth(bia.token) })).json() as { id: string; atual: boolean }[]).find((s) => s.atual)!.id;
    await app!.inject({ method: 'DELETE', url: `/api/sessoes/${id}`, headers: auth(bia.token) });
    expect(conta()).toBe(0);
    const auditoria = JSON.stringify(listarAuditoria(app!.banco).registros);
    expect(auditoria).toContain('aparelho_registrado');
    expect(auditoria).not.toContain(FCM());
    // Registro inválido.
    const nova = (await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } })).json() as { token: string };
    expect((await app!.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(nova.token), payload: { fcmToken: 'curto', k: K() } })).statusCode).toBe(400);
  });
});

describe('serviço de push (agrupamento e falhas)', () => {
  it('chamar-tocando (RN-8, CA-4): o push do chamado vale 15 s (ttl e pendente); o de mensagem continua 10 min', async () => {
    app = await appTeste();
    const bia = (await cadastrar(app, 'bia')).json() as { token: string; usuario: { id: number } };
    await app.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(bia.token), payload: { fcmToken: FCM(), k: K() } });
    let agora = 1_000_000;
    const ttls: number[] = [];
    const push = criarPush({ banco: app.banco, transporte: async (a) => (ttls.push(a.ttlSegundos), 'ok'), conectada: () => false, registrarErro: () => undefined, agora: () => agora });
    push.avisar([bia.usuario.id], { tipo: 'chamado', resumo: { tipo: 'chamado', porNome: 'ana', texto: 'Papo', onde: 'Papo' } });
    push.avisar([bia.usuario.id], { tipo: 'mensagem', resumo: { tipo: 'mensagem', porNome: 'ana', texto: 'oi', onde: 'Conversa direta' } });
    await vi.waitFor(() => expect(ttls[0]).toBe(15));
    agora += 16_000;
    const h = (app.banco.prepare('SELECT sessao_hash AS h FROM push_aparelhos').get() as { h: string }).h;
    expect(tomarPendentes(app.banco, h, K(), agora).map((r) => r.tipo)).toEqual(['mensagem']);
    push.fechar();
  });

  it('A6/A19: várias mensagens seguidas → 1 aviso agora e 1 no fim da janela; chamado não espera; UNREGISTERED apaga o aparelho', async () => {
    app = await appTeste();
    const bia = (await cadastrar(app, 'bia')).json() as { token: string; usuario: { id: number } };
    await app.inject({ method: 'POST', url: '/api/push/aparelho', headers: auth(bia.token), payload: { fcmToken: FCM(), k: K() } });
    vi.useFakeTimers();
    const envios: boolean[] = [];
    let resposta: 'ok' | 'nao_registrado' = 'ok';
    const push = criarPush({ banco: app.banco, transporte: async (a) => (envios.push(a.urgente), resposta), conectada: () => false, registrarErro: () => undefined });
    const item = { tipo: 'mensagem' as const, resumo: { tipo: 'mensagem' as const, porNome: 'ana', texto: 'oi', onde: 'Conversa direta' } };
    for (let i = 0; i < 5; i++) push.avisar([bia.usuario.id], item);
    await vi.advanceTimersByTimeAsync(10);
    expect(envios).toEqual([false]);
    await vi.advanceTimersByTimeAsync(INTERVALO_AVISO_MS);
    expect(envios).toEqual([false, false]);
    push.avisar([bia.usuario.id], { tipo: 'chamado', resumo: { tipo: 'chamado', porNome: 'ana', texto: 'Papo', onde: 'Papo' } });
    await vi.advanceTimersByTimeAsync(10);
    expect(envios).toEqual([false, false, true]);
    resposta = 'nao_registrado';
    await vi.advanceTimersByTimeAsync(INTERVALO_AVISO_MS);
    push.avisar([bia.usuario.id], item);
    await vi.advanceTimersByTimeAsync(10);
    expect((app.banco.prepare('SELECT COUNT(*) AS n FROM push_aparelhos').get() as { n: number }).n).toBe(0);
    push.fechar();
  });

  it('A6/A7: o envio ao FCM é data-only {v,k}, sem bloco notification, com OAuth assinado pela conta de serviço', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const conta = { project_id: 'tofalany-teste', client_email: 'envio@tofalany-teste.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    const chamadas: { url: string; corpo: string }[] = [];
    const buscar = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: String(init?.body) });
      if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'acesso', expires_in: 3600 }), { status: 200 });
      if (chamadas.length > 3) return new Response('{}', { status: 404 });
      return new Response('{}', { status: 200 });
    });
    const t = criarTransporteFcm(conta, buscar as unknown as typeof fetch);
    expect(await t({ fcmToken: FCM(), k: K(), ttlSegundos: 600, urgente: false })).toBe('ok');
    expect(await t({ fcmToken: FCM(), k: K(), ttlSegundos: 60, urgente: true })).toBe('ok');
    // O token de acesso é reaproveitado (uma ida ao OAuth só).
    expect(chamadas.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
    const mensagem = JSON.parse(chamadas[1]!.corpo).message;
    expect(mensagem).toEqual({ token: FCM(), data: { v: '1', k: K() }, android: { priority: 'normal', ttl: '600s', collapse_key: K() } });
    expect(chamadas[1]!.url).toBe('https://fcm.googleapis.com/v1/projects/tofalany-teste/messages:send');
    expect(await t({ fcmToken: FCM(), k: K(), ttlSegundos: 600, urgente: false })).toBe('nao_registrado');
  });
});
