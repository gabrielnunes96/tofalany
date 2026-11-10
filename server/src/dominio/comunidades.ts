import { randomBytes } from 'node:crypto';
import { COMUNIDADE_PRINCIPAL, LIMITE_SERVIDORES_POR_PESSOA, caminhoComunidade, type Cargo, type ComunidadeDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { iguaisSeguro } from '../auth/tokens.js';

/**
 * Vários servidores na mesma instalação (comunidades), como no Discord: a conta é uma só e a pessoa participa de
 * vários. O principal (id 1) é o grupo que já existia; os outros são criados pelo app.
 */
interface LinhaComunidade {
  id: number;
  nome: string | null;
  dono_id: number | null;
  convite: string | null;
}

export interface Membro {
  cargo: Cargo;
  funcao_id: number | null;
  castigo_ate?: number | null;
}

/** O nome do principal vem da configuração (NOME_SERVIDOR); os outros, do banco. */
export function nomeComunidade(banco: Banco, id: number, nomePrincipal: string): string | undefined {
  const c = banco.prepare('SELECT nome FROM comunidades WHERE id = ?').get(id) as { nome: string | null } | undefined;
  if (!c) return undefined;
  // O principal vem da configuração (NOME_SERVIDOR) até o administrador renomear pelo app.
  return c.nome ?? (id === COMUNIDADE_PRINCIPAL ? nomePrincipal : `Servidor ${id}`);
}

/** Imagem do servidor (/files/<id>) ou null. */
export function iconeComunidade(banco: Banco, id: number): string | null {
  const c = banco.prepare('SELECT icone_arquivo FROM comunidades WHERE id = ?').get(id) as { icone_arquivo: string | null } | undefined;
  return c?.icone_arquivo ? `/files/${c.icone_arquivo}` : null;
}

export function existeComunidade(banco: Banco, id: number): boolean {
  return !!banco.prepare('SELECT 1 FROM comunidades WHERE id = ?').get(id);
}

export function donoDa(banco: Banco, id: number): number | null {
  return (banco.prepare('SELECT dono_id FROM comunidades WHERE id = ?').get(id) as { dono_id: number | null } | undefined)?.dono_id ?? null;
}

export function membroDe(banco: Banco, comunidadeId: number, usuarioId: number): Membro | undefined {
  return banco.prepare('SELECT cargo, funcao_id, castigo_ate FROM membros WHERE comunidade_id = ? AND usuario_id = ?').get(comunidadeId, usuarioId) as Membro | undefined;
}

export function idsDosMembros(banco: Banco, comunidadeId: number): number[] {
  return (banco.prepare('SELECT usuario_id FROM membros WHERE comunidade_id = ?').all(comunidadeId) as { usuario_id: number }[]).map((m) => m.usuario_id);
}

export function comunidadesDe(banco: Banco, usuarioId: number): number[] {
  return (banco.prepare('SELECT comunidade_id FROM membros WHERE usuario_id = ? ORDER BY entrou_em, comunidade_id').all(usuarioId) as { comunidade_id: number }[]).map(
    (m) => m.comunidade_id,
  );
}

/** Administrador do servidor principal: administra a instalação, vê e entra em todos os servidores. */
export function ehAdminDaInstalacao(banco: Banco, usuarioId: number): boolean {
  return membroDe(banco, COMUNIDADE_PRINCIPAL, usuarioId)?.cargo === 'admin';
}

/**
 * Participação no servidor; o administrador da instalação que ainda não estava lá (servidor criado antes de ele
 * virar administrador) entra como administrador na hora.
 */
export function membroNaComunidade(banco: Banco, comunidadeId: number, usuarioId: number): Membro | undefined {
  const m = membroDe(banco, comunidadeId, usuarioId);
  if (m || comunidadeId === COMUNIDADE_PRINCIPAL || !ehAdminDaInstalacao(banco, usuarioId)) return m;
  garantirAdminsDaInstalacao(banco);
  return membroDe(banco, comunidadeId, usuarioId);
}

/** Coloca os administradores da instalação como administradores de todos os servidores (que ainda não estejam). */
export function garantirAdminsDaInstalacao(banco: Banco, agora: number = Date.now()): void {
  banco
    .prepare(
      `INSERT INTO membros (comunidade_id, usuario_id, cargo, funcao_id, entrou_em)
       SELECT c.id, m.usuario_id, 'admin', NULL, ? FROM comunidades c
       JOIN membros m ON m.comunidade_id = 1 AND m.cargo = 'admin'
       JOIN usuarios u ON u.id = m.usuario_id AND u.removido_em IS NULL
       WHERE c.id <> 1
       ON CONFLICT (comunidade_id, usuario_id) DO UPDATE SET cargo = 'admin'`,
    )
    .run(agora);
}

/**
 * Servidores da pessoa, com o endereço de cada um a partir da base pública da instalação. O administrador da
 * instalação vê todos; os outros, só aqueles em que entraram por convite.
 */
export function listarComunidadesDe(banco: Banco, usuarioId: number, base: string, nomePrincipal: string): ComunidadeDto[] {
  if (ehAdminDaInstalacao(banco, usuarioId)) garantirAdminsDaInstalacao(banco);
  return comunidadesDe(banco, usuarioId).map((id) => ({
    id,
    nome: nomeComunidade(banco, id, nomePrincipal) ?? '',
    url: `${base}${caminhoComunidade(id)}`,
    iconeUrl: iconeComunidade(banco, id),
  }));
}

export function adicionarMembro(banco: Banco, comunidadeId: number, usuarioId: number, cargo: Cargo, agora: number = Date.now()): void {
  banco
    .prepare('INSERT INTO membros (comunidade_id, usuario_id, cargo, funcao_id, entrou_em) VALUES (?, ?, ?, NULL, ?) ON CONFLICT DO NOTHING')
    .run(comunidadeId, usuarioId, cargo, agora);
}

export function contarAdmins(banco: Banco, comunidadeId: number): number {
  return (
    banco
      .prepare("SELECT COUNT(*) AS n FROM membros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.comunidade_id = ? AND m.cargo = 'admin' AND u.removido_em IS NULL")
      .get(comunidadeId) as { n: number }
  ).n;
}

const novoCodigo = () => randomBytes(6).toString('hex');

export function conviteDa(banco: Banco, comunidadeId: number): string | undefined {
  return (banco.prepare('SELECT convite FROM comunidades WHERE id = ?').get(comunidadeId) as { convite: string | null } | undefined)?.convite ?? undefined;
}

export function trocarConvite(banco: Banco, comunidadeId: number, codigo: string): void {
  banco.prepare('UPDATE comunidades SET convite = ? WHERE id = ?').run(codigo, comunidadeId);
}

/** RN-1: o servidor de um código de convite (comparação em tempo constante); undefined se nenhum. */
export function comunidadeDoConvite(banco: Banco, codigo: string): number | undefined {
  const limpo = codigo.trim();
  if (!limpo) return undefined;
  const linhas = banco.prepare('SELECT id, convite FROM comunidades WHERE convite IS NOT NULL').all() as { id: number; convite: string }[];
  let achado: number | undefined;
  for (const l of linhas) if (iguaisSeguro(limpo, l.convite)) achado = l.id;
  return achado;
}

/** Servidor novo: quem cria vira administrador; já vem com #geral e Sala 1 e um convite. */
export function criarComunidade(banco: Banco, nome: string, donoId: number, agora: number = Date.now()): number {
  return banco.transaction(() => {
    const criados = (banco.prepare('SELECT COUNT(*) AS n FROM comunidades WHERE dono_id = ?').get(donoId) as { n: number }).n;
    if (criados >= LIMITE_SERVIDORES_POR_PESSOA) {
      throw new ErroHttp(409, 'limite_servidores', `Cada pessoa cria até ${LIMITE_SERVIDORES_POR_PESSOA} servidores.`);
    }
    const id = Number(banco.prepare('INSERT INTO comunidades (nome, dono_id, convite, criado_em) VALUES (?, ?, ?, ?)').run(nome, donoId, novoCodigo(), agora).lastInsertRowid);
    adicionarMembro(banco, id, donoId, 'admin', agora);
    // Os administradores da instalação veem e administram todos os servidores.
    garantirAdminsDaInstalacao(banco, agora);
    const canal = banco.prepare('INSERT INTO canais (tipo, nome, posicao, criado_por, criado_em, comunidade_id) VALUES (?, ?, 1, ?, ?, ?)');
    canal.run('texto', 'geral', donoId, agora, id);
    canal.run('voz', 'Sala 1', donoId, agora, id);
    return id;
  })();
}

/** Nome de servidor: 1 a 40 caracteres visíveis. */
export function validarNomeComunidade(texto: unknown): string {
  const nome = typeof texto === 'string' ? texto.trim().replace(/\s+/g, ' ') : '';
  // eslint-disable-next-line no-control-regex
  if (!nome || [...nome].length > 40 || /[\u0000-\u001f\u007f]/.test(nome)) throw new ErroHttp(400, 'dados_invalidos', 'O nome do servidor deve ter de 1 a 40 caracteres.');
  return nome;
}

/** Sair de um servidor (o principal não; quem criou exclui em vez de sair). */
export function sairDaComunidade(banco: Banco, comunidadeId: number, usuarioId: number): void {
  if (comunidadeId === COMUNIDADE_PRINCIPAL) throw new ErroHttp(400, 'dados_invalidos', 'Não dá para sair do servidor principal.');
  if (donoDa(banco, comunidadeId) === usuarioId) throw new ErroHttp(400, 'dados_invalidos', 'Você criou este servidor: para sair, exclua o servidor.');
  banco.prepare('DELETE FROM membros WHERE comunidade_id = ? AND usuario_id = ?').run(comunidadeId, usuarioId);
}

/** Exclui o servidor (só quem criou; o principal não): canais e mensagens, sons, cargos e membros. Devolve os arquivos a apagar. */
export function excluirComunidade(banco: Banco, comunidadeId: number, usuarioId: number): string[] {
  if (comunidadeId === COMUNIDADE_PRINCIPAL) throw new ErroHttp(400, 'dados_invalidos', 'O servidor principal não pode ser excluído.');
  if (donoDa(banco, comunidadeId) !== usuarioId) throw new ErroHttp(403, 'sem_permissao', 'Só quem criou o servidor pode excluí-lo.');
  return banco.transaction(() => {
    const arquivos = (banco.prepare('SELECT arquivo FROM sons WHERE comunidade_id = ?').all(comunidadeId) as { arquivo: string }[]).map((s) => s.arquivo);
    const icone = (banco.prepare('SELECT icone_arquivo FROM comunidades WHERE id = ?').get(comunidadeId) as { icone_arquivo: string | null } | undefined)?.icone_arquivo;
    if (icone) arquivos.push(icone);
    const canais = (banco.prepare('SELECT id FROM canais WHERE comunidade_id = ?').all(comunidadeId) as { id: number }[]).map((c) => c.id);
    for (const id of canais) banco.prepare('DELETE FROM leituras WHERE chave = ?').run(`c:${id}`);
    banco.prepare('DELETE FROM canais WHERE comunidade_id = ?').run(comunidadeId);
    banco.prepare('DELETE FROM sons WHERE comunidade_id = ?').run(comunidadeId);
    banco.prepare('DELETE FROM membros WHERE comunidade_id = ?').run(comunidadeId);
    banco.prepare('DELETE FROM funcoes WHERE comunidade_id = ?').run(comunidadeId);
    banco.prepare('DELETE FROM auditoria WHERE comunidade_id = ?').run(comunidadeId);
    banco.prepare('DELETE FROM comunidades WHERE id = ?').run(comunidadeId);
    return arquivos;
  })();
}

export type { LinhaComunidade };
