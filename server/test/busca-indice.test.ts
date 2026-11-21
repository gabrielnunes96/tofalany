import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { permissoesDe, PERMISSOES_BASICAS } from '@tofalando/shared';
import { migrar, versaoBanco, type Banco } from '../src/db/banco.js';
import { MIGRACOES } from '../src/db/migracoes.js';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

/** Banco na versão 21 (antes desta demanda) com um canal (geral, id 1), uma DM e mensagens com anexo. */
function bancoAntigo(): Banco {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalando-busca-'));
  pastas.push(pasta);
  const arquivo = join(pasta, 'tofalando.db');
  const banco = new Database(arquivo);
  banco.pragma('foreign_keys = ON');
  migrar(banco, arquivo, MIGRACOES.slice(0, 21));
  const agora = Date.now();
  const usuario = banco.prepare(
    "INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (?, ?, 'x', ?, '#fff', 'membro', ?)",
  );
  usuario.run('ana', 'ana', 'Ana', agora);
  usuario.run('bia', 'bia', 'Bia', agora);
  banco.prepare('INSERT INTO dms (usuario_a, usuario_b, criado_em) VALUES (1, 2, ?)').run(agora);
  const msg = banco.prepare('INSERT INTO mensagens (canal_id, dm_id, autor_id, texto, criada_em) VALUES (?, ?, 1, ?, ?)');
  msg.run(1, null, 'Você vai jogar hoje?', agora);
  msg.run(1, null, 'segue o arquivo', agora);
  msg.run(null, 1, 'churrasco no sábado', agora);
  banco
    .prepare(
      "INSERT INTO anexos (id, mensagem_id, autor_id, tipo, mime, nome_original, bytes, arquivo, criado_em) VALUES ('a1', 2, 1, 'documento', 'application/octet-stream', 'planilha.xlsx', 1, 'a1', ?)",
    )
    .run(agora);
  return banco;
}

const achar = (banco: Banco, termos: string) =>
  (banco.prepare('SELECT rowid AS id FROM busca_mensagens WHERE busca_mensagens MATCH ? ORDER BY rowid').all(termos) as { id: number }[]).map((r) => r.id);

describe('índice de busca (chat-fixar-e-buscar, migração 022)', () => {
  it('CA-14: mensagens de antes da versão (canal, DM e nome de anexo) entram no índice; sem acento e por prefixo', () => {
    const banco = bancoAntigo();
    migrar(banco, ':memory:');
    expect(versaoBanco(banco)).toBe(MIGRACOES.length);
    expect(achar(banco, '"voce"* "jog"*')).toEqual([1]);
    expect(achar(banco, '"planilha"*')).toEqual([2]);
    expect(achar(banco, '"churras"*')).toEqual([3]);
    banco.exec("INSERT INTO busca_mensagens (busca_mensagens) VALUES ('integrity-check')");
  });

  it('o índice acompanha editar, vincular e apagar anexo, apagar e a cascata de canal e de DM; linha de sistema fica fora', () => {
    const banco = bancoAntigo();
    migrar(banco, ':memory:');
    const agora = Date.now();
    banco.prepare("UPDATE mensagens SET texto = 'senha123' WHERE id = 1").run();
    expect(achar(banco, '"jog"*')).toEqual([]);
    expect(achar(banco, '"senha"*')).toEqual([1]);
    // Anexo enviado antes e vinculado depois (como o envio faz).
    banco
      .prepare(
        "INSERT INTO anexos (id, mensagem_id, autor_id, tipo, mime, nome_original, bytes, arquivo, criado_em) VALUES ('a2', NULL, 1, 'documento', 'text/plain', 'orcamento.txt', 1, 'a2', ?)",
      )
      .run(agora);
    expect(achar(banco, '"orcamento"*')).toEqual([]);
    banco.prepare("UPDATE anexos SET mensagem_id = 1 WHERE id = 'a2'").run();
    expect(achar(banco, '"orcamento"*')).toEqual([1]);
    banco.prepare("DELETE FROM anexos WHERE id = 'a2'").run();
    expect(achar(banco, '"orcamento"*')).toEqual([]);
    expect(achar(banco, '"senha"*')).toEqual([1]);
    banco
      .prepare("INSERT INTO mensagens (canal_id, autor_id, texto, criada_em, tipo, ref_mensagem_id) VALUES (1, 1, 'fixou uma mensagem.', ?, 'fixou', 1)")
      .run(agora);
    expect(achar(banco, '"fixou"*')).toEqual([]);
    banco.prepare('DELETE FROM mensagens WHERE id = 1').run();
    expect(achar(banco, '"senha"*')).toEqual([]);
    banco.prepare('DELETE FROM dms WHERE id = 1').run();
    expect(achar(banco, '"churras"*')).toEqual([]);
    banco.prepare('DELETE FROM canais WHERE id = 1').run();
    expect(achar(banco, '"planilha"*')).toEqual([]);
    expect(achar(banco, '"segue"*')).toEqual([]);
    banco.exec("INSERT INTO busca_mensagens (busca_mensagens) VALUES ('integrity-check')");
  });

  it('a fixada sai junto com a mensagem apagada', () => {
    const banco = bancoAntigo();
    migrar(banco, ':memory:');
    banco.prepare('INSERT INTO mensagens_fixadas (mensagem_id, fixada_por, fixada_em) VALUES (2, 1, ?)').run(Date.now());
    banco.prepare('DELETE FROM mensagens WHERE id = 2').run();
    expect(banco.prepare('SELECT COUNT(*) AS n FROM mensagens_fixadas').get()).toEqual({ n: 0 });
  });
});

describe('permissão "Fixar mensagens" (RN-1, RF-4)', () => {
  it('não é básica; o administrador tem; de castigo não fixa', () => {
    expect(PERMISSOES_BASICAS).not.toContain('fixar_mensagens');
    expect(permissoesDe({ cargo: 'membro', funcaoId: null, castigoAte: null }, []).has('fixar_mensagens')).toBe(false);
    expect(permissoesDe({ cargo: 'admin', funcaoId: null, castigoAte: null }, []).has('fixar_mensagens')).toBe(true);
    const cargo = { id: 7, nome: 'Moderação', cor: null, posicao: 1, permissoes: ['fixar_mensagens' as const] };
    expect(permissoesDe({ cargo: 'membro', funcaoId: 7, castigoAte: null }, [cargo]).has('fixar_mensagens')).toBe(true);
    expect(permissoesDe({ cargo: 'membro', funcaoId: 7, castigoAte: Date.now() + 60_000 }, [cargo]).has('fixar_mensagens')).toBe(false);
  });
});
