import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, ComunidadeDto, EventosCliente, EventosServidor, OlaPayload } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

type Resposta = { ok: boolean; valor?: unknown; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  /** Conexão em tempo real com um servidor; erro do handshake vira { erro }. */
  const abrir = (token: string, comunidade?: number) =>
    new Promise<{ s: Cliente; ola: OlaPayload } | { erro: string }>((r) => {
      const s: Cliente = conectar(url, { auth: { token, ...(comunidade ? { comunidade } : {}) }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.once('ola', (ola) => r({ s, ola }));
      s.once('connect_error', (e) => r({ erro: e.message }));
    });
  return { url, dono, ana, abrir };
}

describe('vários servidores na mesma instalação', () => {
  it('só o administrador cria; o servidor novo vem com #geral, Sala 1 e convite próprio; endereço /c/<id>', async () => {
    const { dono, ana } = await preparar();
    const negado = await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(ana.token), payload: { nome: 'Da ana' } });
    expect(negado.statusCode).toBe(403);
    const criado = await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: '  Família  ' } });
    expect(criado.statusCode).toBe(201);
    const familia = criado.json() as ComunidadeDto;
    expect(familia.nome).toBe('Família');
    expect(familia.url).toMatch(/\/c\/2$/);
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/servidor' })).json()).toMatchObject({ nome: 'Família' });
    expect((await app!.inject({ method: 'GET', url: '/c/99/api/servidor' })).statusCode).toBe(404);
    const convite = (await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth(dono.token) })).json() as { codigo: string; link: string };
    expect(convite.link).toMatch(/\/c\/2\/convite\//);
    expect((await app!.inject({ method: 'GET', url: `/c/2/convite/${convite.codigo}` })).body).toContain('Família');
    // O código do principal não abre a página do servidor novo.
    expect((await app!.inject({ method: 'GET', url: '/c/2/convite/convite-de-teste' })).statusCode).toBe(404);
  });

  it('cada um vê só os servidores em que entrou; o administrador vê todos; o convite põe a pessoa dentro', async () => {
    const { dono, ana, abrir } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const lista = async (token: string) => ((await app!.inject({ method: 'GET', url: '/api/comunidades', headers: auth(token) })).json() as ComunidadeDto[]).map((c) => c.nome);
    expect(await lista(dono.token)).toEqual(['ToFalany', 'Família']);
    expect(await lista(ana.token)).toEqual(['ToFalany']);
    // Fora do servidor: nem HTTP nem tempo real.
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/eu', headers: auth(ana.token) })).json()).toMatchObject({ erro: 'nao_membro' });
    expect(await abrir(ana.token, 2)).toEqual({ erro: 'nao_membro' });

    const doDono = await abrir(dono.token, 2);
    if ('erro' in doDono) throw new Error(doDono.erro);
    const chegou = new Promise((r) => doDono.s.once('usuario:criado', r));
    const codigo = ((await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth(dono.token) })).json() as { codigo: string }).codigo;
    const entrou = await app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: auth(ana.token), payload: { codigo } });
    expect(entrou.json()).toMatchObject({ id: 2, nome: 'Família' });
    expect(await chegou).toMatchObject({ id: ana.usuario.id, cargo: 'membro' });
    expect(await lista(ana.token)).toEqual(['ToFalany', 'Família']);
    expect((await app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: auth(ana.token), payload: { codigo: 'errado' } })).statusCode).toBe(403);
  });

  it('o retrato de cada servidor traz só os canais, membros e cargos dele; eventos de um não vazam para o outro', async () => {
    const { dono, ana, abrir } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const principal = await abrir(dono.token);
    const familia = await abrir(dono.token, 2);
    const daAna = await abrir(ana.token);
    if ('erro' in principal || 'erro' in familia || 'erro' in daAna) throw new Error('handshake');
    expect(familia.ola.servidor.nome).toBe('Família');
    expect(familia.ola.canais.map((c) => c.nome)).toEqual(['geral', 'Sala 1']);
    expect(familia.ola.usuarios.map((u) => u.usuario)).toEqual(['dono']);
    expect(familia.ola.funcoes).toEqual([]);
    expect(principal.ola.funcoes!.map((f) => f.nome)).toEqual(['Moderador']);
    expect(principal.ola.canais.some((c) => familia.ola.canais.some((f) => f.id === c.id))).toBe(false);

    const vistosPelaAna: string[] = [];
    daAna.s.on('canal:criado', (c) => vistosPelaAna.push(c.nome));
    const criado = (await pedir(familia.s, 'canal:criar', { tipo: 'texto', nome: 'receitas' })).valor as CanalDto;
    await pedir(principal.s, 'canal:criar', { tipo: 'texto', nome: 'avisos' });
    await new Promise((r) => setTimeout(r, 100));
    expect(vistosPelaAna).toEqual(['avisos']);
    // Mandar mensagem num canal de outro servidor por esta conexão: como se não existisse.
    expect(await pedir(principal.s, 'mensagem:enviar', { destino: { canalId: criado.id }, texto: 'oi' })).toEqual({ ok: false, erro: 'Canal não encontrado.' });
    const salaFamilia = familia.ola.canais.find((c) => c.tipo === 'voz')!.id;
    expect(await pedir(daAna.s, 'voz:estado', { canalVozId: salaFamilia, mudo: false, surdo: false, camera: false })).toEqual({ ok: false, erro: 'Canal não encontrado.' });
  });

  it('cargo vale por servidor; cadastro pelo convite de um servidor entra só nele; sair e excluir', async () => {
    const { dono, ana, abrir } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const codigo = ((await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth(dono.token) })).json() as { codigo: string }).codigo;
    await app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: auth(ana.token), payload: { codigo } });
    const promovida = await app!.inject({ method: 'PATCH', url: `/c/2/api/admin/usuarios/${ana.usuario.id}/cargo`, headers: auth(dono.token), payload: { cargo: 'admin' } });
    expect(promovida.json()).toMatchObject({ cargo: 'admin' });
    expect((await app!.inject({ method: 'GET', url: '/api/eu', headers: auth(ana.token) })).json()).toMatchObject({ cargo: 'membro' });
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/eu', headers: auth(ana.token) })).json()).toMatchObject({ cargo: 'admin' });
    // Admin da Família não cria servidores nem gera código de senha (é da instalação).
    expect((await app!.inject({ method: 'POST', url: `/c/2/api/admin/usuarios/${dono.usuario.id}/redefinicao`, headers: auth(ana.token) })).statusCode).toBe(403);

    // Conta nova pelo convite da Família: entra só nela.
    const bia = await app!.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: codigo, usuario: 'bia', senha: 'Senha-forte-1' } });
    expect(bia.statusCode).toBe(201);
    const tokenBia = (bia.json() as { token: string }).token;
    expect(await abrir(tokenBia)).toEqual({ erro: 'nao_membro' });
    expect('ola' in (await abrir(tokenBia, 2))).toBe(true);
    // O convite do principal não cria conta na Família (e vice-versa).
    expect((await app!.inject({ method: 'POST', url: '/c/2/api/auth/cadastro', payload: { convite: 'convite-de-teste', usuario: 'caio', senha: 'Senha-forte-1' } })).statusCode).toBe(403);

    // A bia sai; o dono não sai (exclui); a ana (admin, não dona) não exclui.
    expect((await app!.inject({ method: 'POST', url: '/c/2/api/comunidade/sair', headers: auth(tokenBia) })).statusCode).toBe(204);
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/eu', headers: auth(tokenBia) })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'POST', url: '/c/2/api/comunidade/sair', headers: auth(dono.token) })).statusCode).toBe(400);
    expect((await app!.inject({ method: 'DELETE', url: '/c/2/api/comunidade', headers: auth(ana.token) })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'DELETE', url: '/api/comunidade', headers: auth(dono.token) })).statusCode).toBe(400);
    expect((await app!.inject({ method: 'DELETE', url: '/c/2/api/comunidade', headers: auth(dono.token) })).statusCode).toBe(204);
    expect((await app!.inject({ method: 'GET', url: '/c/2/api/servidor' })).statusCode).toBe(404);
    expect(app!.banco.prepare('SELECT COUNT(*) AS n FROM canais WHERE comunidade_id = 2').get()).toEqual({ n: 0 });
  });
});
