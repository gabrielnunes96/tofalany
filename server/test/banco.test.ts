import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirBanco, migrar, versaoBanco } from '../src/db/banco.js';
import { MIGRACOES } from '../src/db/migracoes.js';
import { construirApp } from '../src/app.js';
import { lerConfig } from '../src/config.js';

const pastas: string[] = [];
function pastaTemp(): string {
  const p = mkdtempSync(join(tmpdir(), 'tofalando-db-'));
  pastas.push(p);
  return p;
}
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('banco e migrations', () => {
  it('aplica todas as migrations e é idempotente ao reabrir', () => {
    const arquivo = join(pastaTemp(), 'data', 'tofalando.db');
    const banco = abrirBanco(arquivo);
    expect(versaoBanco(banco)).toBe(MIGRACOES.length);
    banco.prepare("INSERT INTO configuracoes VALUES ('x', '1')").run();
    banco.close();
    const reaberto = abrirBanco(arquivo);
    expect(reaberto.prepare("SELECT valor FROM configuracoes WHERE chave = 'x'").get()).toEqual({ valor: '1' });
    reaberto.close();
  });

  it('faz backup antes de migrar um banco existente', () => {
    const pasta = pastaTemp();
    const arquivo = join(pasta, 'tofalando.db');
    const banco = abrirBanco(arquivo);
    migrar(banco, arquivo, [...MIGRACOES, 'CREATE TABLE extra (id INTEGER)']);
    expect(versaoBanco(banco)).toBe(MIGRACOES.length + 1);
    banco.close();
    const backups = readdirSync(join(pasta, 'backup'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^tofalando-v${MIGRACOES.length}-.*\\.db$`));
  });

  it('banco novo não gera backup', () => {
    const pasta = pastaTemp();
    abrirBanco(join(pasta, 'tofalando.db')).close();
    expect(existsSync(join(pasta, 'backup'))).toBe(false);
  });
});

describe('código de convite (RN-1)', () => {
  it('depois da primeira subida vale o código do banco, não o da configuração', async () => {
    const banco = join(pastaTemp(), 'tofalando.db');
    const config = (codigo: string) => lerConfig({ LOG: 'false', BANCO: banco, CODIGO_CONVITE: codigo, TENTATIVAS_POR_MINUTO: '1000' });
    const primeira = await construirApp(config('codigo-a'));
    await primeira.close();
    const segunda = await construirApp(config('codigo-b'));
    const cadastrar = (convite: string, usuario: string) =>
      segunda.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite, usuario, senha: 'senha-forte-1' } });
    expect((await cadastrar('codigo-b', 'ana')).statusCode).toBe(403);
    expect((await cadastrar('codigo-a', 'ana')).statusCode).toBe(201);
    await segunda.close();
  });
});

