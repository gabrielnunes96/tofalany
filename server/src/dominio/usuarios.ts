import { CORES_PERFIL, normalizarUsuario, type Cargo, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { iguaisSeguro } from '../auth/tokens.js';
import { CHAVE_CONVITE, lerConfiguracao } from './configuracoes.js';
import { registrarAuditoria } from './auditoria.js';

export interface LinhaUsuario {
  id: number;
  usuario: string;
  senha_hash: string;
  nome_exibicao: string;
  cor: string;
  avatar_arquivo: string | null;
  cargo: Cargo;
}

export function paraDto(u: LinhaUsuario): UsuarioDto {
  return {
    id: u.id,
    usuario: u.usuario,
    nomeExibicao: u.nome_exibicao,
    cor: u.cor,
    avatarUrl: u.avatar_arquivo ? `/files/${u.avatar_arquivo}` : null,
    cargo: u.cargo,
  };
}

export function listarAtivos(banco: Banco): LinhaUsuario[] {
  return banco.prepare('SELECT * FROM usuarios WHERE removido_em IS NULL ORDER BY nome_exibicao COLLATE NOCASE, id').all() as LinhaUsuario[];
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
  usuario: string;
  senhaHash: string;
  limiteContas: number;
}

/** RN-1: compara com o código vigente; sem código configurado, nada passa. */
export function conferirConvite(banco: Banco, convite: string): void {
  const vigente = lerConfiguracao(banco, CHAVE_CONVITE);
  if (!vigente || !iguaisSeguro(convite.trim(), vigente)) {
    throw new ErroHttp(403, 'convite_invalido', 'Código de convite inválido.');
  }
}

/** RN-1 a RN-4, numa transação para o limite e a unicidade não correrem entre dois cadastros. */
export function cadastrarUsuario(banco: Banco, novo: NovoUsuario, agora: number = Date.now()): LinhaUsuario {
  return banco.transaction(() => {
    // De novo dentro da transação: o administrador pode ter trocado o código no meio (T6).
    conferirConvite(banco, novo.convite);
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
    registrarAuditoria(banco, { tipo: 'conta_criada', atorId: id }, agora);
    return buscarPorId(banco, id)!;
  })();
}
