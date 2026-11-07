import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/banco.js';
import { colunaSensivel, executar, LIMITE_LINHAS, SAIDA } from '../src/cli/banco.js';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

/** Banco migrado com uma conta, uma sessão e um código de redefinição. */
function bancoTemp(): { pasta: string; caminho: string } {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalando-banco-'));
  pastas.push(pasta);
  const caminho = join(pasta, 'tofalando.db');
  const banco = abrirBanco(caminho);
  const agora = Date.now();
  banco
    .prepare("INSERT INTO usuarios (id, usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (1, 'ana', 'ana', 'HASH-SECRETO', 'Ana', '#fff', 'admin', ?)")
    .run(agora);
  banco.prepare("INSERT INTO sessoes (token_hash, usuario_id, criado_em, visto_em) VALUES ('TOKEN-SECRETO', 1, ?, ?)").run(agora, agora);
  banco.prepare("INSERT INTO redefinicoes_senha (usuario_id, codigo_hash, expira_em, criado_em) VALUES (1, 'CODIGO', ?, ?)").run(agora, agora);
  banco.close();
  return { pasta, caminho };
}

function capturar() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, saida: { escrever: (t: string) => out.push(t), erro: (t: string) => err.push(t) } };
}

describe('CLI do banco (backlog v2, item 15)', () => {
  it('tabelas: lista as tabelas com a contagem de linhas', async () => {
    const { caminho } = bancoTemp();
    const c = capturar();
    expect(await executar(['tabelas'], caminho, c.saida)).toBe(SAIDA.ok);
    const texto = c.out.join('\n');
    expect(texto).toMatch(/usuarios\s+│ 1/);
    expect(texto).toMatch(/sessoes\s+│ 1/);
    expect(texto).toContain('Versão do banco:');
  });

  it('consulta: mostra o resultado e mascara hash, token e senha', async () => {
    const { caminho } = bancoTemp();
    const c = capturar();
    expect(await executar(['consulta', 'SELECT u.usuario, u.senha_hash, s.token_hash FROM usuarios u JOIN sessoes s ON s.usuario_id = u.id'], caminho, c.saida)).toBe(SAIDA.ok);
    const texto = c.out.join('\n');
    expect(texto).toContain('ana');
    expect(texto).not.toContain('HASH-SECRETO');
    expect(texto).not.toContain('TOKEN-SECRETO');
    expect(texto).toContain('•••');
    expect(colunaSensivel('codigo_hash')).toBe(true);
    expect(colunaSensivel('nome_exibicao')).toBe(false);
  });

  it('consulta: recusa escrita e não altera o banco', async () => {
    const { caminho } = bancoTemp();
    for (const sql of ['DELETE FROM usuarios', "UPDATE usuarios SET cor = '#000'", 'DROP TABLE usuarios']) {
      const c = capturar();
      expect(await executar(['consulta', sql], caminho, c.saida)).toBe(SAIDA.uso);
      expect(c.err.join('')).toMatch(/leitura|inválida|readonly/i);
    }
    const banco = new Database(caminho, { readonly: true });
    expect(banco.prepare('SELECT cor FROM usuarios').pluck().get()).toBe('#fff');
    banco.close();
  });

  it('consulta: SQL inválido e limite de linhas', async () => {
    const { caminho } = bancoTemp();
    const c = capturar();
    expect(await executar(['consulta', 'SELEC nada'], caminho, c.saida)).toBe(SAIDA.uso);
    const d = capturar();
    expect(await executar(['consulta', `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500) SELECT i FROM n`], caminho, d.saida)).toBe(SAIDA.ok);
    expect(d.out.join('\n')).toContain(`mostrando as primeiras ${LIMITE_LINHAS}`);
  });

  it('copia: arquivo novo sem senhas, sessões e códigos; o original fica intacto', async () => {
    const { pasta, caminho } = bancoTemp();
    const destino = join(pasta, 'copia.db');
    const c = capturar();
    expect(await executar(['copia', destino], caminho, c.saida)).toBe(SAIDA.ok);
    const copia = new Database(destino, { readonly: true });
    expect(copia.prepare('SELECT senha_hash FROM usuarios').pluck().get()).toBe('');
    expect(copia.prepare('SELECT COUNT(*) FROM sessoes').pluck().get()).toBe(0);
    expect(copia.prepare('SELECT COUNT(*) FROM redefinicoes_senha').pluck().get()).toBe(0);
    expect(copia.prepare('SELECT usuario FROM usuarios').pluck().get()).toBe('ana');
    copia.close();
    const original = new Database(caminho, { readonly: true });
    expect(original.prepare('SELECT senha_hash FROM usuarios').pluck().get()).toBe('HASH-SECRETO');
    original.close();
    // Não sobrescreve.
    const d = capturar();
    expect(await executar(['copia', destino], caminho, d.saida)).toBe(SAIDA.uso);
  });

  it('uso errado e banco inexistente', async () => {
    const c = capturar();
    expect(await executar([], '/nao/existe.db', c.saida)).toBe(SAIDA.uso);
    expect(await executar(['consulta'], '/nao/existe.db', c.saida)).toBe(SAIDA.uso);
    expect(await executar(['tabelas'], '/nao/existe.db', c.saida)).toBe(SAIDA.semBanco);
  });
});
