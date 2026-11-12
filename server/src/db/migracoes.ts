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
  // 006 — mensagens diretas (T12). RN-18: só os dois participantes leem; nada vai para a auditoria (RN-21).
  `
  CREATE TABLE dms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_a INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_b INTEGER NOT NULL REFERENCES usuarios(id),
    criado_em INTEGER NOT NULL,
    CHECK (usuario_a < usuario_b),
    UNIQUE (usuario_a, usuario_b)
  );
  ALTER TABLE mensagens ADD COLUMN dm_id INTEGER REFERENCES dms(id) ON DELETE CASCADE;
  CREATE INDEX mensagens_dm ON mensagens(dm_id, id);
  `,
  // 007 — leituras (T13): até onde cada pessoa leu cada conversa ("c:<id>" / "d:<id>").
  `
  CREATE TABLE leituras (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    ultima_mensagem_id INTEGER NOT NULL,
    PRIMARY KEY (usuario_id, chave)
  );
  `,
  // 008 — soundboard (T18): até 5 sons do servidor todo (RN-11).
  `
  CREATE TABLE sons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    arquivo TEXT NOT NULL,
    duracao_ms INTEGER NOT NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em INTEGER NOT NULL
  );
  `,
  // 009 — redefinição de senha pelo app (backlog v2, item 3): um código por conta, uso único, 24 h.
  `
  CREATE TABLE redefinicoes_senha (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    expira_em INTEGER NOT NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em INTEGER NOT NULL
  );
  `,
  // 010 — cargos personalizados (backlog v2, item 10c), com o Moderador de fábrica.
  `
  CREATE TABLE funcoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cor TEXT NOT NULL,
    permissoes TEXT NOT NULL,
    criado_em INTEGER NOT NULL
  );
  ALTER TABLE usuarios ADD COLUMN funcao_id INTEGER REFERENCES funcoes(id) ON DELETE SET NULL;
  INSERT INTO funcoes (nome, cor, permissoes, criado_em)
    VALUES ('Moderador', '#7c8cff', '["gerenciar_canais","apagar_mensagens","gerenciar_convite"]', CAST(strftime('%s','now') AS INTEGER) * 1000);
  `,
  // 011 — vários servidores na mesma instalação (comunidades). O grupo que já existe vira o servidor 1, com todo
  // mundo dentro e os mesmos cargos; canais, sons, cargos personalizados e o convite passam a ser de um servidor.
  // (ADD COLUMN com REFERENCES não aceita DEFAULT com chaves estrangeiras ligadas: a limpeza ao excluir é no código.)
  `
  CREATE TABLE comunidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    dono_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    convite TEXT UNIQUE,
    criado_em INTEGER NOT NULL
  );
  INSERT INTO comunidades (id, nome, dono_id, convite, criado_em)
    VALUES (1, NULL, NULL, (SELECT valor FROM configuracoes WHERE chave = 'codigo_convite'), CAST(strftime('%s','now') AS INTEGER) * 1000);
  CREATE TABLE membros (
    comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL CHECK (cargo IN ('admin', 'membro')),
    funcao_id INTEGER REFERENCES funcoes(id) ON DELETE SET NULL,
    entrou_em INTEGER NOT NULL,
    PRIMARY KEY (comunidade_id, usuario_id)
  );
  CREATE INDEX membros_usuario ON membros(usuario_id);
  INSERT INTO membros (comunidade_id, usuario_id, cargo, funcao_id, entrou_em)
    SELECT 1, id, cargo, funcao_id, criado_em FROM usuarios WHERE removido_em IS NULL;
  ALTER TABLE canais ADD COLUMN comunidade_id INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX canais_comunidade ON canais(comunidade_id, tipo, posicao);
  ALTER TABLE sons ADD COLUMN comunidade_id INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE funcoes ADD COLUMN comunidade_id INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE auditoria ADD COLUMN comunidade_id INTEGER;
  `,
  // 012 — amigos (como no Discord): pedido, aceite. Vale para a conta, em todos os servidores da instalação.
  `
  CREATE TABLE amizades (
    usuario_a INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    usuario_b INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_por INTEGER NOT NULL,
    aceita INTEGER NOT NULL DEFAULT 0,
    criado_em INTEGER NOT NULL,
    PRIMARY KEY (usuario_a, usuario_b),
    CHECK (usuario_a < usuario_b)
  );
  CREATE INDEX amizades_b ON amizades(usuario_b);
  `,
  // 013 — permissões básicas (marcadas por padrão, dá para desmarcar) e transmissão em 1080p e 2K separadas.
  // Os cargos que já existem ganham todas as básicas: ninguém perde o que já fazia.
  `
  UPDATE funcoes SET permissoes = replace(permissoes, '"transmitir_alta"', '"transmitir_1080p","transmitir_1440p"');
  UPDATE funcoes SET permissoes = CASE
    WHEN permissoes = '[]' THEN '["enviar_mensagens","enviar_anexos","entrar_voz","usar_camera","transmitir_tela","tocar_sons","usar_toouvini"]'
    ELSE replace(permissoes, '[', '["enviar_mensagens","enviar_anexos","entrar_voz","usar_camera","transmitir_tela","tocar_sons","usar_toouvini",')
  END;
  `,
  // 014 — imagem do servidor (arquivo no armazém, como o avatar).
  `
  ALTER TABLE comunidades ADD COLUMN icone_arquivo TEXT;
  `,
  // 015 — moderação: castigo por tempo (no membro) e banimentos por servidor (com motivo).
  `
  ALTER TABLE membros ADD COLUMN castigo_ate INTEGER;
  ALTER TABLE membros ADD COLUMN castigo_motivo TEXT;
  CREATE TABLE banimentos (
    comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    motivo TEXT,
    por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    em INTEGER NOT NULL,
    PRIMARY KEY (comunidade_id, usuario_id)
  );
  `,
  // 016 — menções: quem foi marcado (ids em JSON) e @todos, resolvidos ao enviar (valem para o histórico).
  `
  ALTER TABLE mensagens ADD COLUMN mencoes TEXT;
  ALTER TABLE mensagens ADD COLUMN menciona_todos INTEGER NOT NULL DEFAULT 0;
  `,
  // 017 — pontos e loja: saldo por conta, extrato (ganho por sessão de voz e compras), temas comprados e vales.
  // Nascem vazias: sem pontos retroativos (RN-17).
  `
  CREATE TABLE pontos_saldos (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    atualizado_em INTEGER NOT NULL
  );
  CREATE TABLE pontos_movimentos (
    id INTEGER PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('ganho', 'compra')),
    item TEXT,
    valor INTEGER NOT NULL,
    criado_em INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
  );
  CREATE INDEX pontos_movimentos_usuario ON pontos_movimentos (usuario_id, id DESC);
  CREATE TABLE loja_temas (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tema TEXT NOT NULL,
    comprado_em INTEGER NOT NULL,
    PRIMARY KEY (usuario_id, tema)
  );
  CREATE TABLE loja_vales (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    qualidade TEXT NOT NULL CHECK (qualidade IN ('720p60', '1080p30', '1080p60')),
    expira_em INTEGER NOT NULL,
    PRIMARY KEY (usuario_id, qualidade)
  );
  `,
];

