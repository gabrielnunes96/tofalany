import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appTeste, cadastrar } from './apoio.js';
import { usarRedefinicao, VALIDADE_REDEFINICAO_MS, gerarRedefinicao } from '../src/dominio/redefinicoes.js';
import type { Banco } from '../src/db/banco.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('redefinir senha pelo app (backlog v2, item 3)', () => {
  it('admin gera o código; a pessoa troca a senha com ele (uso único); as sessões antigas caem', async () => {
    app = await appTeste();
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const anaCadastro = (await cadastrar(app, 'ana')).json();
    const anaId = anaCadastro.usuario.id as number;

    // Só administrador gera.
    const negado = await app.inject({ method: 'POST', url: `/api/admin/usuarios/${anaId}/redefinicao`, headers: auth(anaCadastro.token) });
    expect(negado.statusCode).toBe(403);

    const gerado = await app.inject({ method: 'POST', url: `/api/admin/usuarios/${anaId}/redefinicao`, headers: auth(dono) });
    expect(gerado.statusCode).toBe(200);
    const { codigo, expiraEm } = gerado.json() as { codigo: string; expiraEm: number };
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(expiraEm).toBeGreaterThan(Date.now() + VALIDADE_REDEFINICAO_MS - 60_000);

    // Código errado ou usuário errado: a mesma resposta.
    const errado = await app.inject({ method: 'POST', url: '/api/auth/redefinir', payload: { usuario: 'ana', codigo: 'AAAA-AAAA', senha: 'Senha-nova-123' } });
    expect(errado.statusCode).toBe(400);
    expect(errado.json().erro).toBe('codigo_invalido');
    const outro = await app.inject({ method: 'POST', url: '/api/auth/redefinir', payload: { usuario: 'ninguem', codigo, senha: 'Senha-nova-123' } });
    expect(outro.json().erro).toBe('codigo_invalido');

    // Digitado em minúsculas e sem hífen também vale.
    const ok = await app.inject({ method: 'POST', url: '/api/auth/redefinir', payload: { usuario: 'Ana', codigo: codigo.replace('-', '').toLowerCase(), senha: 'Senha-nova-123' } });
    expect(ok.statusCode).toBe(204);

    // A sessão antiga caiu; a senha nova entra; a antiga não.
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: auth(anaCadastro.token) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-nova-123' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } })).statusCode).toBe(401);

    // Uso único.
    const repetido = await app.inject({ method: 'POST', url: '/api/auth/redefinir', payload: { usuario: 'ana', codigo, senha: 'Outra-senha-456' } });
    expect(repetido.statusCode).toBe(400);
  });

  it('código expirado não vale (e é apagado); senha fraca é recusada antes de gastar o código', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const ana = (await cadastrar(app, 'ana')).json();
    const banco = (app as unknown as { banco: Banco }).banco;
    const { codigo } = gerarRedefinicao(banco, ana.usuario.id, 1, Date.now() - VALIDADE_REDEFINICAO_MS - 1);
    expect(usarRedefinicao(banco, ana.usuario.id, codigo)).toBe(false);
    expect(banco.prepare('SELECT COUNT(*) AS n FROM redefinicoes_senha').get()).toEqual({ n: 0 });

    const novo = gerarRedefinicao(banco, ana.usuario.id, 1);
    const fraca = await app.inject({ method: 'POST', url: '/api/auth/redefinir', payload: { usuario: 'ana', codigo: novo.codigo, senha: '123' } });
    expect(fraca.statusCode).toBe(400);
    expect(fraca.json().erro).toBe('dados_invalidos');
    expect(usarRedefinicao(banco, ana.usuario.id, novo.codigo)).toBe(true);
  });
});
