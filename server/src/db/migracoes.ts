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
  // 003 — canais (T8), com um de texto e um de voz para começar.
  `
  CREATE TABLE canais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'voz')),
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em INTEGER NOT NULL
  );
  CREATE INDEX canais_tipo ON canais(tipo, posicao);
  INSERT INTO canais (tipo, nome, posicao, criado_em) VALUES ('texto', 'geral', 1, CAST(strftime('%s','now') AS INTEGER) * 1000);
  INSERT INTO canais (tipo, nome, posicao, criado_em) VALUES ('voz', 'Sala 1', 1, CAST(strftime('%s','now') AS INTEGER) * 1000);
  `,
  // 004 — mensagens de canal (T9). Remover o canal apaga o histórico (RN-8).
  `
  CREATE TABLE mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canal_id INTEGER REFERENCES canais(id) ON DELETE CASCADE,
    autor_id INTEGER NOT NULL REFERENCES usuarios(id),
    texto TEXT NOT NULL,
    criada_em INTEGER NOT NULL,
    editada_em INTEGER
  );
  CREATE INDEX mensagens_canal ON mensagens(canal_id, id);
  `,
  // 005 — anexos (T11). Anexo sem mensagem por mais de 1 h é órfão e é apagado.
  `
  CREATE TABLE anexos (
    id TEXT PRIMARY KEY,
    mensagem_id INTEGER REFERENCES mensagens(id) ON DELETE CASCADE,
    autor_id INTEGER NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('imagem', 'documento')),
    mime TEXT NOT NULL,
    nome_original TEXT NOT NULL,
    largura INTEGER,
    altura INTEGER,
    bytes INTEGER NOT NULL,
    arquivo TEXT NOT NULL,
    criado_em INTEGER NOT NULL
  );
  CREATE INDEX anexos_mensagem ON anexos(mensagem_id);
  CREATE INDEX anexos_orfaos ON anexos(mensagem_id, criado_em);
  `,
];
