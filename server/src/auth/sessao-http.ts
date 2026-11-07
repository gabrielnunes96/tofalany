import { COMUNIDADE_PRINCIPAL, type Permissao } from '@tofalando/shared';
import { temPermissao } from '../dominio/funcoes.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { usuarioDaSessao } from '../dominio/sessoes.js';
import { membroNaComunidade } from '../dominio/comunidades.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuarioId?: number;
    tokenSessao?: string;
    /** Servidor do pedido: /c/<id>/... no endereço; sem prefixo, o principal. */
    comunidadeId: number;
  }
}

/** "/c/7/api/eu" → { comunidadeId: 7, url: "/api/eu" }; sem prefixo, o principal e a URL como veio. */
export function separarComunidadeDaUrl(url: string): { comunidadeId: number; url: string } {
  const m = /^\/c\/(\d{1,9})(\/.*)?$/.exec(url);
  if (!m) return { comunidadeId: COMUNIDADE_PRINCIPAL, url };
  return { comunidadeId: Number(m[1]), url: m[2] || '/' };
}

export function lerBearer(cabecalho: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(cabecalho ?? '');
  return m?.[1];
}

/**
 * preHandler: exige Authorization: Bearer <token> de uma sessão válida de usuário ativo e que a pessoa participe
 * do servidor do pedido. `daConta`: rotas da conta (perfil, criar ou entrar em servidor), que valem em qualquer um.
 */
export function exigirSessao(banco: Banco, opcoes: { daConta?: boolean } = {}) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = lerBearer(req.headers.authorization);
    const usuarioId = token ? usuarioDaSessao(banco, token) : undefined;
    if (!token || usuarioId === undefined) throw new ErroHttp(401, 'nao_autenticado', 'Sessão inválida ou encerrada. Entre de novo.');
    req.usuarioId = usuarioId;
    req.tokenSessao = token;
    if (!opcoes.daConta && !membroNaComunidade(banco, req.comunidadeId, usuarioId)) throw new ErroHttp(403, 'nao_membro', 'Você não participa deste servidor.');
  };
}

/** Backlog v2, item 10c: preHandler (depois de exigirSessao) por permissão (administrador sempre pode). */
export function exigirPermissao(banco: Banco, permissao: Permissao, mensagem = 'Seu cargo não permite fazer isso.') {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (req.usuarioId === undefined || !temPermissao(banco, req.usuarioId, permissao, req.comunidadeId)) throw new ErroHttp(403, 'sem_permissao', mensagem);
  };
}

/** preHandler (depois de exigirSessao): só administrador do servidor do pedido. A regra fica no servidor, não na tela. */
export function exigirAdmin(banco: Banco) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const membro = req.usuarioId === undefined ? undefined : membroNaComunidade(banco, req.comunidadeId, req.usuarioId);
    if (membro?.cargo !== 'admin') throw new ErroHttp(403, 'sem_permissao', 'Só administradores podem fazer isso.');
  };
}

/** preHandler (depois de exigirAdmin): o que é da conta (remover, trocar senha) fica com o administrador do principal. */
export function exigirPrincipal() {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (req.comunidadeId !== COMUNIDADE_PRINCIPAL) throw new ErroHttp(403, 'sem_permissao', 'Isso só o administrador do servidor principal faz.');
  };
}
