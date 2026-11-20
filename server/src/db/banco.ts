import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRACOES } from './migracoes.js';

export type Banco = Database.Database;

export const EM_MEMORIA = ':memory:';

/** Abre o SQLite, liga WAL e chaves estrangeiras e aplica as migrations pendentes. */
export function abrirBanco(caminho: string): Banco {
  if (caminho !== EM_MEMORIA) mkdirSync(dirname(caminho), { recursive: true });
  const banco = new Database(caminho);
  banco.pragma('journal_mode = WAL');
  banco.pragma('foreign_keys = ON');
  banco.pragma('busy_timeout = 5000');
  migrar(banco, caminho);
  return banco;
}

export function versaoBanco(banco: Banco): number {
  return banco.pragma('user_version', { simple: true }) as number;
}

/** Aplica as migrations pendentes; antes, copia o banco existente para data/backup (rollback). */
export function migrar(banco: Banco, caminho: string, migracoes: readonly string[] = MIGRACOES): void {
  const atual = versaoBanco(banco);
  if (atual >= migracoes.length) return;
  if (caminho !== EM_MEMORIA && atual > 0) {
    const pasta = join(dirname(caminho), 'backup');
    mkdirSync(pasta, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = join(pasta, `tofalando-v${atual}-${carimbo}.db`).replaceAll("'", "''");
    banco.exec(`VACUUM INTO '${destino}'`);
  }
  for (let i = atual; i < migracoes.length; i++) {
    banco.transaction(() => {
      banco.exec(migracoes[i]!);
      banco.pragma(`user_version = ${i + 1}`);
    })();
  }
}
