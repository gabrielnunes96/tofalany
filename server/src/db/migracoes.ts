/** Migrations em ordem; o índice + 1 é o PRAGMA user_version depois de aplicada. Só avançam (rollback = backup). */
export const MIGRACOES: readonly string[] = [
  // 001 — contas, sessões e configurações do servidor (T2)
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL,
    usuario_norm TEXT UNIQUE,
    senha_hash TEXT NOT NULL,
    nome_exibicao TEXT NOT NULL,
    cor TEXT NOT NULL,
    avatar_arquivo TEXT,
    cargo TEXT NOT NULL CHECK (cargo IN ('admin', 'membro')),
    criado_em INTEGER NOT NULL,
    removido_em INTEGER
  );
  CREATE TABLE sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em INTEGER NOT NULL,
    visto_em INTEGER NOT NULL
  );
  CREATE INDEX sessoes_usuario ON sessoes(usuario_id);
  CREATE TABLE configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `,
  // 002 — auditoria (T27). Sem texto de mensagem e nada de DM (RN-20, RN-21).
  `
  CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quando INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    ator_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    alvo_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    canal_id INTEGER,
    detalhes TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX auditoria_quando ON auditoria(quando);
  CREATE INDEX auditoria_ator ON auditoria(ator_id, id);
  CREATE INDEX auditoria_alvo ON auditoria(alvo_usuario_id, id);
  CREATE INDEX auditoria_tipo ON auditoria(tipo, id);
  CREATE INDEX auditoria_canal ON auditoria(canal_id, id);
  `,
];
