import { CASTIGO_MAX_MINUTOS, MOTIVO_MODERACAO_MAX, type BanimentoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { donoDa, membroDe } from './comunidades.js';
import { temPermissao } from './funcoes.js';

/** Motivo opcional (a pessoa vê): sem espaços nas pontas, até MOTIVO_MODERACAO_MAX caracteres; vazio = null. */
export function validarMotivo(texto: unknown): string | null {
  if (texto === undefined || texto === null) return null;
  if (typeof texto !== 'string') throw new ErroHttp(400, 'dados_invalidos', 'Motivo inválido.');
  const limpo = texto.trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if ([...limpo].length > MOTIVO_MODERACAO_MAX || /[\u0000-\u001f\u007f]/.test(limpo)) {
    throw new ErroHttp(400, 'dados_invalidos', `O motivo deve ter até ${MOTIVO_MODERACAO_MAX} caracteres.`);
  }
  return limpo || null;
}

export function validarMinutos(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > CASTIGO_MAX_MINUTOS) {
    throw new ErroHttp(400, 'dados_invalidos', 'O castigo vai de 1 minuto a 28 dias.');
  }
  return valor;
}

/**
 * Quem modera quem: precisa de "Moderar membros" (administrador tem); ninguém modera a si mesmo, um administrador
 * ou quem criou o servidor; e quem não é administrador não modera outro moderador.
 */
export function conferirModeracao(banco: Banco, comunidadeId: number, atorId: number, alvoId: number): void {
  if (!temPermissao(banco, atorId, 'moderar_membros', comunidadeId)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite moderar membros.');
  if (atorId === alvoId) throw new ErroHttp(400, 'dados_invalidos', 'Você não pode moderar a si mesmo.');
  const alvo = membroDe(banco, comunidadeId, alvoId);
  if (!alvo) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada neste servidor.');
  if (alvo.cargo === 'admin' || donoDa(banco, comunidadeId) === alvoId) throw new ErroHttp(403, 'sem_permissao', 'Administradores não podem ser moderados.');
  const ator = membroDe(banco, comunidadeId, atorId);
  if (ator?.cargo !== 'admin' && temPermissao(banco, alvoId, 'moderar_membros', comunidadeId)) {
    throw new ErroHttp(403, 'sem_permissao', 'Só um administrador modera outro moderador.');
  }
}

/** O castigo valendo agora (com motivo), ou null. */
export function meuCastigo(banco: Banco, comunidadeId: number, usuarioId: number, agora: number = Date.now()): { ate: number; motivo: string | null } | null {
  const m = banco.prepare('SELECT castigo_ate, castigo_motivo FROM membros WHERE comunidade_id = ? AND usuario_id = ?').get(comunidadeId, usuarioId) as
    | { castigo_ate: number | null; castigo_motivo: string | null }
    | undefined;
  return m?.castigo_ate && m.castigo_ate > agora ? { ate: m.castigo_ate, motivo: m.castigo_motivo } : null;
}

export function estaBanido(banco: Banco, comunidadeId: number, usuarioId: number): boolean {
  return !!banco.prepare('SELECT 1 FROM banimentos WHERE comunidade_id = ? AND usuario_id = ?').get(comunidadeId, usuarioId);
}

export function listarBanidos(banco: Banco, comunidadeId: number): BanimentoDto[] {
  const linhas = banco
    .prepare(
      `SELECT b.motivo, b.em, u.id, u.usuario, u.nome_exibicao, u.cor, u.avatar_arquivo, p.nome_exibicao AS por_nome
       FROM banimentos b JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN usuarios p ON p.id = b.por_id
       WHERE b.comunidade_id = ? ORDER BY b.em DESC`,
    )
    .all(comunidadeId) as { motivo: string | null; em: number; id: number; usuario: string; nome_exibicao: string; cor: string; avatar_arquivo: string | null; por_nome: string | null }[];
  return linhas.map((l) => ({
    usuario: { id: l.id, usuario: l.usuario, nomeExibicao: l.nome_exibicao, cor: l.cor, avatarUrl: l.avatar_arquivo ? `/files/${l.avatar_arquivo}` : null },
    motivo: l.motivo,
    em: l.em,
    porNome: l.por_nome,
  }));
}
