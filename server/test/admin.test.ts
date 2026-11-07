import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { MotivoRevogacao, UsuarioAdminDto, UsuarioDto } from '@tofalando/shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { listarAuditoria, registrarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar, CONVITE } from './apoio.js';

let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function grupo(extra: Record<string, string> = {}) {
  app = await appTeste(extra);
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: UsuarioDto };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: UsuarioDto };
  return { dono, ana };
}

async function abrirSocket(token: string): Promise<Socket> {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`;
  const s = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  await new Promise((r) => s.once('ola', r));
  return s;
}

const cargo = (token: string, id: number, novo: string) =>
  app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${id}/cargo`, headers: auth(token), payload: { cargo: novo } });

describe('cargos (CA-9, CA-10, RN-5)', () => {
  it('CA-9: admin promove membro; o promovido passa a usar funções de admin; todos recebem a mudança', async () => {
    const { dono, ana } = await grupo();
    const s = await abrirSocket(ana.token);
    const atualizado = new Promise<UsuarioDto>((r) => s.once('usuario:atualizado', r));
    expect((await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: auth(ana.token) })).statusCode).toBe(403);

    const r = await cargo(dono.token, ana.usuario.id, 'admin');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ usuario: 'ana', cargo: 'admin' });
    expect(await atualizado).toMatchObject({ id: ana.usuario.id, cargo: 'admin' });
    expect((await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: auth(ana.token) })).statusCode).toBe(200);
  });

  it('CA-10: o único administrador não consegue se rebaixar; com dois, consegue', async () => {
    const { dono, ana } = await grupo();
    const r = await cargo(dono.token, dono.usuario.id, 'membro');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'ultimo_admin', mensagem: 'O servidor precisa de pelo menos um administrador.' });
    await cargo(dono.token, ana.usuario.id, 'admin');
    expect((await cargo(dono.token, dono.usuario.id, 'membro')).json()).toMatchObject({ cargo: 'membro' });
  });

  it('cargo inválido ou conta inexistente', async () => {
    const { dono } = await grupo();
    expect((await cargo(dono.token, 99, 'membro')).statusCode).toBe(404);
    expect((await cargo(dono.token, 2, 'dono')).statusCode).toBe(400);
  });
});

describe('permissão no servidor (CA-11, RN-6)', () => {
  it('membro chamando direto as rotas de administração recebe 403 em todas', async () => {
    const { ana, dono } = await grupo();
    const chamadas = [
      { method: 'GET', url: '/api/admin/usuarios' },
      { method: 'PATCH', url: `/api/admin/usuarios/${ana.usuario.id}/cargo`, payload: { cargo: 'admin' } },
      { method: 'DELETE', url: `/api/admin/usuarios/${dono.usuario.id}` },
      { method: 'GET', url: '/api/admin/convite' },
      { method: 'PUT', url: '/api/admin/convite', payload: { codigo: 'novo-codigo' } },
    ] as const;
    for (const c of chamadas) {
      const r = await app!.inject({ ...c, headers: auth(ana.token) });
      expect(r.statusCode, `${c.method} ${c.url}`).toBe(403);
    }
    expect(app!.banco.prepare("SELECT cargo FROM usuarios WHERE usuario = 'ana'").get()).toEqual({ cargo: 'membro' });
  });
});

describe('remover conta (CA-11a, RN-16)', () => {
  it('desconecta na hora, impede login, libera o nome e a vaga, e todos são avisados', async () => {
    const { dono, ana } = await grupo({ LIMITE_CONTAS: '2' });
    const sAna = await abrirSocket(ana.token);
    const sDono = await abrirSocket(dono.token);
    const revogada = new Promise<{ motivo: MotivoRevogacao }>((r) => sAna.once('sessao:revogada', r));
    const removido = new Promise<{ id: number }>((r) => sDono.once('usuario:removido', r));
    expect((await cadastrar(app!, 'bia')).json()).toMatchObject({ erro: 'limite_contas' });

    const r = await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${ana.usuario.id}`, headers: auth(dono.token) });
    expect(r.statusCode).toBe(204);
    expect(await revogada).toEqual({ motivo: 'conta_removida' });
    expect(await removido).toEqual({ id: ana.usuario.id });

    const login = await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } });
    expect(login.statusCode).toBe(401);
    expect((await app!.inject({ method: 'GET', url: '/api/eu', headers: auth(ana.token) })).statusCode).toBe(401);
    // Vaga liberada (limite 2) e o mesmo nome pode ser usado por outra pessoa.
    expect((await cadastrar(app!, 'ana')).statusCode).toBe(201);

    const todos = (await app!.inject({ method: 'GET', url: '/api/admin/usuarios', headers: auth(dono.token) })).json() as UsuarioAdminDto[];
    expect(todos.map((u) => `${u.usuario}:${u.removido}`)).toEqual(['ana:false', 'dono:false', 'ana:true']);
  });

  it('apaga o avatar da conta removida', async () => {
    const { dono, ana } = await grupo();
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000000' } }).png().toBuffer();
    const limite = '----x';
    const corpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const { avatarUrl } = (
      await app!.inject({
        method: 'PUT',
        url: '/api/eu/avatar',
        payload: corpo,
        headers: { ...auth(ana.token), 'content-type': `multipart/form-data; boundary=${limite}` },
      })
    ).json();
    const arquivo = join(app!.armazem.pasta, avatarUrl.replace('/files/', ''));
    expect(existsSync(arquivo)).toBe(true);
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${ana.usuario.id}`, headers: auth(dono.token) });
    expect(existsSync(arquivo)).toBe(false);
    expect(app!.banco.prepare('SELECT avatar_arquivo FROM usuarios WHERE id = ?').get(ana.usuario.id)).toEqual({ avatar_arquivo: null });
  });

  it('admin remove a si mesmo quando há outro admin; também remove outro admin; conta já removida dá 404', async () => {
    const { dono, ana } = await grupo();
    const bia = (await cadastrar(app!, 'bia')).json();
    await cargo(dono.token, ana.usuario.id, 'admin');
    await cargo(dono.token, bia.usuario.id, 'admin');
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${bia.usuario.id}`, headers: auth(ana.token) })).statusCode).toBe(204);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${dono.usuario.id}`, headers: auth(dono.token) })).statusCode).toBe(204);
    expect((await app!.inject({ method: 'GET', url: '/api/eu', headers: auth(dono.token) })).statusCode).toBe(401);
    expect((await app!.inject({ method: 'GET', url: '/api/eu', headers: auth(ana.token) })).json()).toMatchObject({ cargo: 'admin' });
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${bia.usuario.id}`, headers: auth(ana.token) })).statusCode).toBe(404);
    expect((await cargo(ana.token, bia.usuario.id, 'membro')).statusCode).toBe(404);
  });

  it('filtro da auditoria: removidas só aparecem se ainda têm registro no prazo', async () => {
    const { dono, ana } = await grupo({ AUDITORIA_DIAS: '30' });
    const bia = (await cadastrar(app!, 'bia')).json();
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${ana.usuario.id}`, headers: auth(dono.token) });
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${bia.usuario.id}`, headers: auth(dono.token) });
    // A bia "foi removida há 40 dias": todos os registros dela ficam fora do prazo.
    app!.banco.prepare('UPDATE auditoria SET quando = ? WHERE ator_id = ? OR alvo_usuario_id = ?').run(Date.now() - 40 * 86_400_000, bia.usuario.id, bia.usuario.id);
    registrarAuditoria(app!.banco, { tipo: 'login', atorId: dono.usuario.id });
    const todos = (await app!.inject({ method: 'GET', url: '/api/admin/usuarios', headers: auth(dono.token) })).json() as UsuarioAdminDto[];
    expect(todos.map((u) => `${u.usuario}:${u.removido}`)).toEqual(['dono:false', 'ana:true']);
  });

  it('não remove o último administrador', async () => {
    const { dono } = await grupo();
    const r = await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${dono.usuario.id}`, headers: auth(dono.token) });
    expect(r.statusCode).toBe(409);
  });
});

describe('código de convite (CA-11b, RF-6a)', () => {
  it('troca invalida o antigo; o novo funciona; link usa URL_PUBLICA', async () => {
    const { dono } = await grupo({ URL_PUBLICA: 'https://fala.exemplo.com/' });
    expect((await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: auth(dono.token) })).json()).toEqual({
      codigo: CONVITE,
      link: `https://fala.exemplo.com/convite/${CONVITE}`,
    });
    const troca = await app!.inject({ method: 'PUT', url: '/api/admin/convite', headers: auth(dono.token), payload: { codigo: 'turma-nova-2026' } });
    expect(troca.json()).toEqual({ codigo: 'turma-nova-2026', link: 'https://fala.exemplo.com/convite/turma-nova-2026' });
    expect((await cadastrar(app!, 'bia', 'Senha-forte-1', CONVITE)).statusCode).toBe(403);
    expect((await cadastrar(app!, 'bia', 'Senha-forte-1', 'turma-nova-2026')).statusCode).toBe(201);
    const ruim = await app!.inject({ method: 'PUT', url: '/api/admin/convite', headers: auth(dono.token), payload: { codigo: 'a b' } });
    expect(ruim.statusCode).toBe(400);
    const trocas = () => listarAuditoria(app!.banco, { tipo: 'convite_trocado' }).registros.length;
    const antes = trocas();
    await app!.inject({ method: 'PUT', url: '/api/admin/convite', headers: auth(dono.token), payload: { codigo: 'turma-nova-2026' } });
    expect(trocas()).toBe(antes);
  });

  it('sem URL_PUBLICA, o link usa o endereço da requisição', async () => {
    const { dono } = await grupo();
    const r = await app!.inject({ method: 'GET', url: '/api/admin/convite', headers: { ...auth(dono.token), host: '100.64.0.1:3000' } });
    expect(r.json().link).toBe(`http://100.64.0.1:3000/convite/${CONVITE}`);
  });
});

describe('auditoria das ações de administração (CA-50, parte da T6)', () => {
  it('cargo, conta removida e convite aparecem com quem fez e o alvo', async () => {
    const { dono, ana } = await grupo();
    await cargo(dono.token, ana.usuario.id, 'admin');
    await cargo(dono.token, ana.usuario.id, 'membro');
    await app!.inject({ method: 'PUT', url: '/api/admin/convite', headers: auth(dono.token), payload: { codigo: 'novo-codigo' } });
    await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${ana.usuario.id}`, headers: auth(dono.token) });
    const registros = listarAuditoria(app!.banco, { pessoa: dono.usuario.id }).registros.filter((r) => r.tipo !== 'conta_criada');
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.alvo?.nome ?? null, r.detalhes])).toEqual([
      ['conta_removida', 'dono', 'ana', {}],
      ['convite_trocado', 'dono', null, {}],
      ['cargo_alterado', 'dono', 'ana', { cargo: 'membro' }],
      ['cargo_alterado', 'dono', 'ana', { cargo: 'admin' }],
    ]);
  });
});
