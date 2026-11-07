import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, FuncaoDto, OlaPayload, UsuarioDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const pedir = <K extends keyof EventosCliente>(s: Cliente, evento: K, dados: Parameters<EventosCliente[K]>[0]) =>
  new Promise<{ ok: boolean; valor?: unknown; erro?: string }>((r) => (s.emit as (e: string, d: unknown, a: (x: never) => void) => void)(evento, dados, r));

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const anaCad = (await cadastrar(app, 'ana')).json();
  const abrir = async (token: string) => {
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola };
  };
  return { dono, ana: anaCad.token as string, anaId: anaCad.usuario.id as number, abrir };
}

describe('cargos personalizados (backlog v2, item 10c)', () => {
  it('o Moderador vem de fábrica; com ele, a ana remove canal e troca o convite, mas não vê auditoria nem mexe em contas', async () => {
    const { dono, ana, anaId, abrir } = await preparar();
    const a = await abrir(ana);
    const moderador = a.ola.funcoes.find((f) => f.nome === 'Moderador')!;
    expect(moderador.permissoes).toEqual(['gerenciar_canais', 'apagar_mensagens', 'gerenciar_convite']);

    // Sem cargo: não pode.
    expect((await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: auth(ana) })).statusCode).toBe(403);

    // Só administrador atribui.
    const negado = await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${anaId}/funcao`, headers: auth(ana), payload: { funcaoId: moderador.id } });
    expect(negado.statusCode).toBe(403);
    const atualizado = new Promise<UsuarioDto>((r) => a.s.on('usuario:atualizado', (u) => u.id === anaId && r(u)));
    const ok = await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${anaId}/funcao`, headers: auth(dono), payload: { funcaoId: moderador.id } });
    expect(ok.json()).toMatchObject({ id: anaId, cargo: 'membro', funcaoId: moderador.id });
    expect((await atualizado).funcaoId).toBe(moderador.id);

    expect((await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: auth(ana) })).statusCode).toBe(200);
    expect((await app!.inject({ method: 'GET', url: '/api/admin/auditoria', headers: auth(ana) })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'GET', url: '/api/admin/usuarios', headers: auth(ana) })).statusCode).toBe(403);
    const sala = a.ola.canais.find((c) => c.tipo === 'voz') as CanalDto;
    expect(await pedir(a.s, 'canal:remover', { id: sala.id })).toMatchObject({ ok: true });
  });

  it('administrador cria, edita e remove cargos; tirar a permissão vale na hora; quem tinha fica sem cargo', async () => {
    const { dono, ana, anaId, abrir } = await preparar();
    const a = await abrir(ana);
    const recusado = await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono), payload: { nome: 'DJ', cor: 'azul', permissoes: [] } });
    expect(recusado.statusCode).toBe(400);
    const lista = new Promise<FuncaoDto[]>((r) => a.s.once('funcoes:atualizadas', r));
    const criado = await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono), payload: { nome: '  DJ  ', cor: '#FF8800', permissoes: ['gerenciar_sons'] } });
    expect(criado.statusCode).toBe(201);
    const dj = criado.json() as FuncaoDto;
    expect(dj).toMatchObject({ nome: 'DJ', cor: '#ff8800', permissoes: ['gerenciar_sons'] });
    expect((await lista).map((f) => f.nome)).toContain('DJ');

    await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${anaId}/funcao`, headers: auth(dono), payload: { funcaoId: dj.id } });
    // Com "Gerenciar sons": passa da permissão (cai na validação do arquivo, que não foi mandado).
    expect((await app!.inject({ method: 'POST', url: '/api/admin/sons', headers: auth(ana) })).statusCode).not.toBe(403);
    const semSons = await app!.inject({ method: 'PUT', url: `/api/admin/funcoes/${dj.id}`, headers: auth(dono), payload: { nome: 'DJ', cor: '#ff8800', permissoes: [] } });
    expect(semSons.json().permissoes).toEqual([]);
    expect((await app!.inject({ method: 'POST', url: '/api/admin/sons', headers: auth(ana) })).statusCode).toBe(403);

    const removido = await app!.inject({ method: 'DELETE', url: `/api/admin/funcoes/${dj.id}`, headers: auth(dono) });
    expect(removido.statusCode).toBe(204);
    const eu = await app!.inject({ method: 'GET', url: '/api/eu', headers: auth(ana) });
    expect(eu.json().funcaoId).toBeNull();
  });
});
