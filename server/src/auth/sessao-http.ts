import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { usuarioDaSessao } from '../dominio/sessoes.js';
import { buscarPorId } from '../dominio/usuarios.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuarioId?: number;
    tokenSessao?: string;
  }
}

export function lerBearer(cabecalho: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(cabecalho ?? '');
  return m?.[1];
}

/** preHandler: exige Authorization: Bearer <token> de uma sessão válida de usuário ativo. */
export function exigirSessao(banco: Banco) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = lerBearer(req.headers.authorization);
    const usuarioId = token ? usuarioDaSessao(banco, token) : undefined;
    if (!token || usuarioId === undefined) throw new ErroHttp(401, 'nao_autenticado', 'Sessão inválida ou encerrada. Entre de novo.');
    req.usuarioId = usuarioId;
    req.tokenSessao = token;
  };
}

/** preHandler (depois de exigirSessao): só administrador. A regra fica no servidor, não na tela. */
export function exigirAdmin(banco: Banco) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const usuario = req.usuarioId === undefined ? undefined : buscarPorId(banco, req.usuarioId);
    if (usuario?.cargo !== 'admin') throw new ErroHttp(403, 'sem_permissao', 'Só administradores podem fazer isso.');
  };
}
