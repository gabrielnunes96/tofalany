import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { lerConfig } from '../src/config.js';
import { abrirBanco } from '../src/db/banco.js';
import { Cancelado, executar, redefinirSenha, SAIDA, type Io } from '../src/cli/redefinir-senha.js';
import { CONVITE } from './apoio.js';

const pastas: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function bancoTemp(): string {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalando-cli-'));
  pastas.push(pasta);
  return join(pasta, 'tofalando.db');
}

async function servidor(banco: string) {
  const app = await construirApp(lerConfig({ LOG: 'false', BANCO: banco, CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }));
  apps.push(app);
  return app;
}

const login = (app: FastifyInstance, senha: string) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha } });

function ioFalso(respostas: (string | Error)[]): Io & { saida: string[]; erros: string[] } {
  const saida: string[] = [];
  const erros: string[] = [];
  const lerSenha = async () => {
    const r = respostas.shift() ?? '';
    if (r instanceof Error) throw r;
    return r;
  };
  return { saida, erros, lerSenha, escrever: (t) => saida.push(t), erro: (t) => erros.push(t) };
}

describe('redefinir-senha (RF-4)', () => {
  it('CA-7: depois do comando, a senha nova entra, a antiga é recusada e as sessões abertas caem', async () => {
    const banco = bancoTemp();
    let app = await servidor(banco);
    const { token } = (
      await app.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'Ana', senha: 'senha-antiga-1' } })
    ).json();
    await app.close();
    apps.pop();

    // O comando real, em outro processo, com a senha pela entrada padrão (como num docker compose exec com pipe).
    const cli = fileURLToPath(new URL('../src/cli/redefinir-senha.ts', import.meta.url));
    const saida = execFileSync(process.execPath, ['--import', 'tsx', cli, 'ana'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      input: 'senha-nova-123\nsenha-nova-123\n',
      env: { ...process.env, BANCO: banco },
      encoding: 'utf8',
    });
    expect(saida).toContain('Senha de ana redefinida');

    app = await servidor(banco);
    expect((await login(app, 'senha-nova-123')).statusCode).toBe(200);
    expect((await login(app, 'senha-antiga-1')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    // CA-50 (parte do host): a redefinição fica na auditoria, feita pelo host, com a conta como alvo.
    const registro = (app.banco.prepare("SELECT ator_id, alvo_usuario_id FROM auditoria WHERE tipo = 'senha_redefinida'").get()) as {
      ator_id: number | null;
      alvo_usuario_id: number;
    };
    expect(registro).toEqual({ ator_id: null, alvo_usuario_id: 1 });
  });

  it('recusa uso errado, usuário inexistente, senha curta e confirmação diferente', async () => {
    const banco = abrirBanco(':memory:');
    banco
      .prepare(
        "INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES ('ana', 'ana', 'x', 'ana', '#fff', 'admin', 0)",
      )
      .run();
    expect(await executar([], banco, ioFalso([]))).toBe(SAIDA.uso);
    expect(await executar(['ana', 'extra'], banco, ioFalso([]))).toBe(SAIDA.uso);
    const inexistente = ioFalso([]);
    expect(await executar(['bia'], banco, inexistente)).toBe(SAIDA.naoEncontrado);
    expect(inexistente.erros[0]).toContain('não encontrado');
    const curta = ioFalso(['123']);
    expect(await executar(['ana'], banco, curta)).toBe(SAIDA.uso);
    expect(curta.erros[0]).toContain('pelo menos 8');
    const diferente = ioFalso(['senha-nova-123', 'outra-senha-1']);
    expect(await executar(['ana'], banco, diferente)).toBe(SAIDA.uso);
    expect(diferente.erros[0]).toBe('As senhas não conferem.');
    expect((banco.prepare('SELECT senha_hash FROM usuarios').get() as { senha_hash: string }).senha_hash).toBe('x');
    banco.close();
  });

  it('cancelar (Ctrl+C / fim da entrada) sai com 130 sem alterar a senha', async () => {
    const banco = abrirBanco(':memory:');
    banco
      .prepare(
        "INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES ('ana', 'ana', 'x', 'ana', '#fff', 'admin', 0)",
      )
      .run();
    const io = ioFalso([new Cancelado()]);
    expect(await executar(['ana'], banco, io)).toBe(SAIDA.cancelado);
    expect(io.erros[0]).toContain('Cancelado');
    expect((banco.prepare('SELECT senha_hash FROM usuarios').get() as { senha_hash: string }).senha_hash).toBe('x');
    banco.close();
  });

  it('conta removida no meio da operação não é dada como redefinida', async () => {
    const banco = abrirBanco(':memory:');
    expect(await redefinirSenha(banco, 'ninguem', 'senha-nova-123')).toBeUndefined();
    banco.close();
  });
});
