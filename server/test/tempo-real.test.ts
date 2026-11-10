import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, MotivoRevogacao, OlaPayload } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { revogarSessoesDoUsuario } from '../src/dominio/sessoes.js';

type Cliente = Socket<EventosServidor, EventosCliente>;

let app: FastifyInstance | undefined;
const clientes: Cliente[] = [];
afterEach(async () => {
  for (const c of clientes.splice(0)) c.close();
  await app?.close();
  app = undefined;
});

async function subir(extra: Record<string, string> = {}): Promise<string> {
  app = await appTeste(extra);
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

function abrir(url: string, token: string | undefined): Cliente {
  const c: Cliente = conectar(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
  clientes.push(c);
  return c;
}

const proximo = <T>(c: Cliente, evento: 'ola' | 'sessao:revogada' | 'connect_error' | 'disconnect') =>
  new Promise<T>((resolver) => c.once(evento as 'ola', resolver as never));

describe('Socket.IO autenticado (T4)', () => {
  it('recusa conexão sem token ou com token inválido', async () => {
    const url = await subir();
    const semToken = await proximo<Error>(abrir(url, undefined), 'connect_error');
    expect(semToken.message).toBe('nao_autenticado');
    const inventado = await proximo<Error>(abrir(url, 'inventado'), 'connect_error');
    expect(inventado.message).toBe('nao_autenticado');
  });

  it('envia o retrato inicial (ola) com eu, usuários e nome do servidor', async () => {
    const url = await subir({ NOME_SERVIDOR: 'Turma' });
    const { token } = (await cadastrar(app!, 'ana')).json();
    await cadastrar(app!, 'bia');
    const ola = await proximo<OlaPayload>(abrir(url, token), 'ola');
    expect(ola.servidor).toEqual({ nome: 'Turma', id: 1, donoId: null, iconeUrl: null });
    expect(ola.eu).toMatchObject({ usuario: 'ana', cargo: 'admin' });
    expect(ola.usuarios.map((u) => u.usuario)).toEqual(['ana', 'bia']);
  });

  it('conta nova é avisada a quem está conectado', async () => {
    const url = await subir();
    const { token } = (await cadastrar(app!, 'ana')).json();
    const c = abrir(url, token);
    await proximo(c, 'ola');
    const criado = new Promise((r) => c.once('usuario:criado', r));
    await cadastrar(app!, 'bia');
    expect(await criado).toMatchObject({ usuario: 'bia', cargo: 'membro' });
  });

  it('sair pela API derruba na hora as conexões daquela sessão, não as de outra', async () => {
    const url = await subir();
    const { token } = (await cadastrar(app!, 'ana')).json();
    const outra = (await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } })).json().token;
    const c1 = abrir(url, token);
    const c2 = abrir(url, outra);
    await Promise.all([proximo(c1, 'ola'), proximo(c2, 'ola')]);
    const revogada = proximo<{ motivo: MotivoRevogacao }>(c1, 'sessao:revogada');
    await app!.inject({ method: 'POST', url: '/api/auth/sair', headers: { authorization: `Bearer ${token}` } });
    expect(await revogada).toEqual({ motivo: 'saiu' });
    await expect.poll(() => c1.connected).toBe(false);
    expect(c2.connected).toBe(true);
  });

  it('revogação feita por outro processo (comando da T3) derruba na próxima conferência', async () => {
    const url = await subir({ INTERVALO_SESSAO_MS: '100' });
    const { token, usuario } = (await cadastrar(app!, 'ana')).json();
    const c = abrir(url, token);
    await proximo(c, 'ola');
    const revogada = proximo<{ motivo: MotivoRevogacao }>(c, 'sessao:revogada');
    revogarSessoesDoUsuario(app!.banco, usuario.id);
    expect(await revogada).toEqual({ motivo: 'sessao_invalida' });
    await expect.poll(() => c.connected).toBe(false);
  });

  it('revogarUsuario derruba todas as conexões do usuário (base para remover conta, T6)', async () => {
    const url = await subir();
    const { token, usuario } = (await cadastrar(app!, 'ana')).json();
    const c = abrir(url, token);
    await proximo(c, 'ola');
    const revogada = proximo<{ motivo: MotivoRevogacao }>(c, 'sessao:revogada');
    app!.tempoReal.revogarUsuario(usuario.id, 'conta_removida');
    expect(await revogada).toEqual({ motivo: 'conta_removida' });
  });

  it('CA-42: batimento curto para perceber queda de rede sem fechamento em menos de 10 s', async () => {
    await subir();
    const { pingInterval, pingTimeout } = app!.tempoReal.io.engine.opts;
    expect(pingInterval + pingTimeout).toBeLessThan(10_000);
  });

  it('falha do banco no handshake não derruba o servidor; o cliente recebe erro transitório', async () => {
    const url = await subir();
    const { token } = (await cadastrar(app!, 'ana')).json();
    app!.banco.exec('ALTER TABLE sessoes RENAME TO sessoes_quebrada');
    const erro = await proximo<Error>(abrir(url, token), 'connect_error');
    expect(erro.message).toBe('erro_interno');
    app!.banco.exec('ALTER TABLE sessoes_quebrada RENAME TO sessoes');
    expect((await app!.inject({ method: 'GET', url: '/api/saude' })).statusCode).toBe(200);
  });

  it('fechar o servidor encerra as conexões abertas sem travar', async () => {
    const url = await subir();
    const { token } = (await cadastrar(app!, 'ana')).json();
    const c = abrir(url, token);
    await proximo(c, 'ola');
    const caiu = proximo(c, 'disconnect');
    await app!.close();
    app = undefined;
    await caiu;
  });
});
