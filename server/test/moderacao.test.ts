import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { BanimentoDto, CanalDto, EventosCliente, EventosServidor, OlaPayload, UsuarioDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar, CONVITE } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
type Resposta = { ok: boolean; valor?: unknown; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));

async function preparar() {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const conta = async (nome: string) => (await cadastrar(app!, nome)).json() as { token: string; usuario: { id: number } };
  const dono = await conta('dono');
  const ana = await conta('ana');
  const beto = await conta('beto');
  const abrir = (token: string) =>
    new Promise<{ s: Cliente; ola: OlaPayload }>((r) => {
      const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.once('ola', (ola) => r({ s, ola }));
    });
  return { dono, ana, beto, abrir };
}

const injetar = (method: 'POST' | 'DELETE' | 'GET' | 'PATCH', url: string, token: string, payload?: object) =>
  app!.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

describe('moderação: castigo, expulsar e banir', () => {
  it('castigo: a pessoa não escreve nem entra na voz, sai da voz, vê o motivo; acabou ou tirado, volta ao normal', async () => {
    const { dono, ana, abrir } = await preparar();
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);
    const texto = a.ola.canais.find((c) => c.tipo === 'texto')!.id;
    const voz = ((await pedir(a.s, 'canal:criar', { tipo: 'voz', nome: 'Papo' })).valor as CanalDto).id;
    expect((await pedir(b.s, 'voz:estado', { canalVozId: voz, mudo: false, surdo: false, camera: false })).ok).toBe(true);

    // Membro comum não modera; ninguém modera administrador.
    expect((await injetar('POST', `/api/moderacao/${dono.usuario.id}/castigo`, ana.token, { minutos: 5 })).statusCode).toBe(403);
    expect((await injetar('POST', `/api/moderacao/${ana.usuario.id}/castigo`, dono.token, { minutos: 0 })).statusCode).toBe(400);

    const tirado = new Promise((r) => b.s.once('voz:tirado', r));
    const aviso = new Promise((r) => b.s.once('moderacao:castigo', r));
    const atualizado = new Promise<UsuarioDto>((r) => a.s.once('usuario:atualizado', r));
    const r = await injetar('POST', `/api/moderacao/${ana.usuario.id}/castigo`, dono.token, { minutos: 10, motivo: '  flood  no chat ' });
    expect(r.statusCode).toBe(200);
    const ate = (r.json() as UsuarioDto).castigoAte!;
    expect(ate).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(await tirado).toEqual({ motivo: 'castigo' });
    expect(await aviso).toEqual({ ate, motivo: 'flood no chat' });
    expect((await atualizado).castigoAte).toBe(ate);

    expect((await pedir(b.s, 'mensagem:enviar', { destino: { canalId: texto }, texto: 'oi' })).ok).toBe(false);
    expect((await pedir(b.s, 'voz:estado', { canalVozId: voz, mudo: false, surdo: false, camera: false })).ok).toBe(false);
    // Reconectar não escapa: o ola traz o castigo e o motivo (só para a pessoa).
    const b2 = await abrir(ana.token);
    expect(b2.ola.meuCastigo).toEqual({ ate, motivo: 'flood no chat' });
    expect(b2.ola.eu.castigoAte).toBe(ate);

    const fim = new Promise((r) => b.s.once('moderacao:castigo', r));
    expect((await injetar('DELETE', `/api/moderacao/${ana.usuario.id}/castigo`, dono.token)).json()).not.toHaveProperty('castigoAte');
    expect(await fim).toBeNull();
    expect((await pedir(b.s, 'mensagem:enviar', { destino: { canalId: texto }, texto: 'voltei' })).ok).toBe(true);

    // Castigo vencido não vale mais (sem precisar de ninguém tirar).
    app!.banco.prepare('UPDATE membros SET castigo_ate = ? WHERE usuario_id = ?').run(Date.now() - 1, ana.usuario.id);
    expect((await pedir(b.s, 'mensagem:enviar', { destino: { canalId: texto }, texto: 'de novo' })).ok).toBe(true);

    const tipos = listarAuditoria(app!.banco).registros.map((x) => x.tipo);
    expect(tipos).toContain('castigo_aplicado');
    expect(tipos).toContain('castigo_removido');
  });

  it('expulsar: sai com o motivo e volta pelo convite; banir: sai, não volta nem com convite, até desbanir', async () => {
    const { dono, ana, abrir } = await preparar();
    const a = await abrir(dono.token);
    const b = await abrir(ana.token);

    let revogada = new Promise((r) => b.s.once('sessao:revogada', r));
    const removido = new Promise((r) => a.s.once('usuario:removido', r));
    expect((await injetar('POST', `/api/moderacao/${ana.usuario.id}/expulsar`, dono.token, { motivo: 'brigou' })).statusCode).toBe(204);
    expect(await revogada).toEqual({ motivo: 'expulso', detalhe: 'brigou' });
    expect(await removido).toEqual({ id: ana.usuario.id });
    expect((await injetar('GET', '/api/servidor', ana.token)).statusCode).toBe(200);
    expect((await injetar('POST', '/api/comunidades/entrar', ana.token, { codigo: CONVITE })).statusCode).toBe(200);

    const b2 = await abrir(ana.token);
    revogada = new Promise((r) => b2.s.once('sessao:revogada', r));
    expect((await injetar('POST', `/api/moderacao/${ana.usuario.id}/banir`, dono.token, {})).statusCode).toBe(204);
    expect(await revogada).toEqual({ motivo: 'banido', detalhe: null });
    const voltar = await injetar('POST', '/api/comunidades/entrar', ana.token, { codigo: CONVITE });
    expect(voltar.statusCode).toBe(403);
    expect(voltar.json()).toMatchObject({ mensagem: 'Você foi banido deste servidor.' });

    const banidos = (await injetar('GET', '/api/moderacao/banidos', dono.token)).json() as BanimentoDto[];
    expect(banidos).toMatchObject([{ usuario: { id: ana.usuario.id, nomeExibicao: 'ana' }, motivo: null, porNome: 'dono' }]);
    expect((await injetar('DELETE', `/api/moderacao/banidos/${ana.usuario.id}`, dono.token)).statusCode).toBe(204);
    expect((await injetar('POST', '/api/comunidades/entrar', ana.token, { codigo: CONVITE })).statusCode).toBe(200);
    expect(listarAuditoria(app!.banco).registros.map((x) => x.tipo)).toEqual(expect.arrayContaining(['expulso', 'banido', 'desbanido']));
  });

  it('cargo com "Moderar membros" modera membros, mas não outro moderador nem a si mesmo', async () => {
    const { dono, ana, beto } = await preparar();
    const funcao = (await injetar('POST', '/api/admin/funcoes', dono.token, { nome: 'Mod', cor: '#ff8800', permissoes: ['moderar_membros'] })).json() as { id: number };
    for (const u of [ana, beto]) expect((await injetar('PATCH', `/api/admin/usuarios/${u.usuario.id}/funcao`, dono.token, { funcaoId: funcao.id })).statusCode).toBe(200);
    expect((await injetar('POST', `/api/moderacao/${beto.usuario.id}/castigo`, ana.token, { minutos: 5 })).statusCode).toBe(403);
    expect((await injetar('POST', `/api/moderacao/${ana.usuario.id}/castigo`, ana.token, { minutos: 5 })).statusCode).toBe(400);
    // Tirando o cargo do beto, a ana já pode.
    expect((await injetar('PATCH', `/api/admin/usuarios/${beto.usuario.id}/funcao`, dono.token, { funcaoId: null })).statusCode).toBe(200);
    expect((await injetar('POST', `/api/moderacao/${beto.usuario.id}/castigo`, ana.token, { minutos: 5, motivo: 'x'.repeat(301) })).statusCode).toBe(400);
    expect((await injetar('POST', `/api/moderacao/${beto.usuario.id}/castigo`, ana.token, { minutos: 5 })).statusCode).toBe(200);
  });
});
