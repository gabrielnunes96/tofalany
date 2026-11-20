import { COMUNIDADE_PRINCIPAL, CORES_PERFIL, normalizarUsuario, type Cargo, type FundoPerfil, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { adicionarMembro, comunidadeDoConvite } from './comunidades.js';
import { registrarAuditoria } from './auditoria.js';

export interface LinhaUsuario {
  id: number;
  usuario: string;
  senha_hash: string;
  nome_exibicao: string;
  cor: string;
  avatar_arquivo: string | null;
  cargo: Cargo;
  funcao_id: number | null;
  criado_em?: number;
  /** Moderação: castigo neste servidor (só nas consultas pelo membro). */
  castigo_ate?: number | null;
  /** Mini perfil (migração 021). */
  sobre_mim?: string | null;
  fundo_cores?: string | null;
  fundo_arquivo?: string | null;
  fundo_mini?: string | null;
  /** Quando entrou no servidor (só nas consultas pelo membro). */
  entrou_em?: number | null;
}

/** Fuso das datas mostradas (o grupo é do Brasil; o servidor roda em UTC). */
const FUSO_DATAS = 'America/Sao_Paulo';
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DATAS, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Só o dia (AAAA-MM-DD), no horário de Brasília: a hora não interessa a ninguém. */
export function soData(ms: number): string {
  return formatoDia.format(ms);
}

function lerFundo(u: LinhaUsuario): FundoPerfil | null {
  let cores: FundoPerfil['cores'];
  if (u.fundo_cores) {
    // Gravado já validado pelo PATCH; o try só tolera um banco editado à mão.
    try {
      cores = JSON.parse(u.fundo_cores) as FundoPerfil['cores'];
    } catch {
      cores = undefined;
    }
  }
  if (!cores && !u.fundo_arquivo) return null;
  return {
    ...(cores ? { cores } : {}),
    ...(u.fundo_arquivo ? { url: `/files/${u.fundo_arquivo}` } : {}),
    ...(u.fundo_mini ? { miniUrl: `/files/${u.fundo_mini}` } : {}),
  };
}

export function paraDto(u: LinhaUsuario, agora: number = Date.now()): UsuarioDto {
  return {
    id: u.id,
    usuario: u.usuario,
    nomeExibicao: u.nome_exibicao,
    cor: u.cor,
    avatarUrl: u.avatar_arquivo ? `/files/${u.avatar_arquivo}` : null,
    cargo: u.cargo,
    funcaoId: u.funcao_id ?? null,
    ...(u.castigo_ate && u.castigo_ate > agora ? { castigoAte: u.castigo_ate } : {}),
    ...(u.sobre_mim ? { sobreMim: u.sobre_mim } : {}),
    fundo: lerFundo(u),
    ...(u.entrou_em ? { membroDesde: soData(u.entrou_em) } : {}),
  };
}

export function listarAtivos(banco: Banco): LinhaUsuario[] {
  return banco.prepare('SELECT * FROM usuarios WHERE removido_em IS NULL ORDER BY nome_exibicao COLLATE NOCASE, id').all() as LinhaUsuario[];
}

/** Membros ativos de um servidor, com o cargo e o cargo personalizado de lá (no lugar dos da conta). */
export function listarMembros(banco: Banco, comunidadeId: number): LinhaUsuario[] {
  return banco
    .prepare(
      `SELECT u.*, m.cargo AS cargo, m.funcao_id AS funcao_id, m.castigo_ate AS castigo_ate, m.entrou_em AS entrou_em FROM usuarios u JOIN membros m ON m.usuario_id = u.id
       WHERE m.comunidade_id = ? AND u.removido_em IS NULL ORDER BY u.nome_exibicao COLLATE NOCASE, u.id`,
    )
    .all(comunidadeId) as LinhaUsuario[];
}

/** A conta vista de dentro de um servidor: cargo e cargo personalizado de lá; undefined se não é membro. */
export function buscarNa(banco: Banco, id: number, comunidadeId: number): LinhaUsuario | undefined {
  return banco
    .prepare(
      `SELECT u.*, m.cargo AS cargo, m.funcao_id AS funcao_id, m.castigo_ate AS castigo_ate, m.entrou_em AS entrou_em FROM usuarios u JOIN membros m ON m.usuario_id = u.id
       WHERE u.id = ? AND m.comunidade_id = ? AND u.removido_em IS NULL`,
    )
    .get(id, comunidadeId) as LinhaUsuario | undefined;
}

/**
 * Visão do administrador: contas ativas e as removidas que ainda têm registro na auditoria
 * a partir de `desde` (para o filtro Pessoa; as antigas sem registro no prazo ficam de fora).
 */
export function listarParaAdmin(banco: Banco, desde: number): (LinhaUsuario & { removido_em: number | null })[] {
  return banco
    .prepare(
      `SELECT * FROM usuarios u
       WHERE u.removido_em IS NULL
          OR EXISTS (SELECT 1 FROM auditoria a WHERE (a.ator_id = u.id OR a.alvo_usuario_id = u.id) AND a.quando >= ?)
       ORDER BY u.removido_em IS NOT NULL, u.nome_exibicao COLLATE NOCASE, u.id`,
    )
    .all(desde) as (LinhaUsuario & { removido_em: number | null })[];
}

export function contarAdminsAtivos(banco: Banco): number {
  return (banco.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE cargo = 'admin' AND removido_em IS NULL").get() as { n: number }).n;
}

export function contarContasAtivas(banco: Banco): number {
  return (banco.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE removido_em IS NULL').get() as { n: number }).n;
}

export function buscarPorLogin(banco: Banco, usuario: string): LinhaUsuario | undefined {
  return banco
    .prepare('SELECT * FROM usuarios WHERE usuario_norm = ? AND removido_em IS NULL')
    .get(normalizarUsuario(usuario)) as LinhaUsuario | undefined;
}

export function buscarPorId(banco: Banco, id: number): LinhaUsuario | undefined {
  return banco.prepare('SELECT * FROM usuarios WHERE id = ? AND removido_em IS NULL').get(id) as LinhaUsuario | undefined;
}

interface NovoUsuario {
  convite: string;
  /** Servidor do convite (o principal, se não vier). */
  comunidadeId?: number;
  usuario: string;
  senhaHash: string;
  limiteContas: number;
}

/** RN-1: o código precisa ser o convite vigente do servidor em que a pessoa está entrando. */
export function conferirConvite(banco: Banco, convite: string, comunidadeId: number = COMUNIDADE_PRINCIPAL): void {
  if (comunidadeDoConvite(banco, convite) !== comunidadeId) {
    throw new ErroHttp(403, 'convite_invalido', 'Código de convite inválido.');
  }
}

/** RN-1 a RN-4, numa transação para o limite e a unicidade não correrem entre dois cadastros. */
export function cadastrarUsuario(banco: Banco, novo: NovoUsuario, agora: number = Date.now()): LinhaUsuario {
  return banco.transaction(() => {
    // De novo dentro da transação: o administrador pode ter trocado o código no meio (T6).
    const comunidadeId = novo.comunidadeId ?? COMUNIDADE_PRINCIPAL;
    conferirConvite(banco, novo.convite, comunidadeId);
    if (contarContasAtivas(banco) >= novo.limiteContas) {
      throw new ErroHttp(409, 'limite_contas', 'Limite de contas atingido neste servidor.');
    }
    if (buscarPorLogin(banco, novo.usuario)) {
      throw new ErroHttp(409, 'usuario_em_uso', 'Esse nome de usuário já está em uso.');
    }
    const primeira = (banco.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n === 0;
    const cargo: Cargo = primeira ? 'admin' : 'membro';
    const cor = CORES_PERFIL[Math.floor(Math.random() * CORES_PERFIL.length)]!;
    const resultado = banco
      .prepare(
        `INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(novo.usuario, normalizarUsuario(novo.usuario), novo.senhaHash, novo.usuario, cor, cargo, agora);
    const id = Number(resultado.lastInsertRowid);
    // A primeira conta da instalação administra o principal; as outras entram como membro do servidor do convite.
    adicionarMembro(banco, comunidadeId, id, primeira && comunidadeId === COMUNIDADE_PRINCIPAL ? 'admin' : 'membro', agora);
    registrarAuditoria(banco, { tipo: 'conta_criada', atorId: id, comunidadeId }, agora);
    return buscarPorId(banco, id)!;
  })();
}
