import type { FastifyInstance } from 'fastify';
import { TIPOS_AUDITORIA, type FiltroAuditoria, type PaginaAuditoria } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { exigirPermissao, exigirSessao } from '../auth/sessao-http.js';
import { listarAuditoria } from '../dominio/auditoria.js';

const inteiro = { type: 'integer', minimum: 0 } as const;
const consulta = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pessoa: inteiro,
    tipo: { type: 'string', enum: [...TIPOS_AUDITORIA] },
    canal: inteiro,
    de: inteiro,
    ate: inteiro,
    antes: inteiro,
    limite: { type: 'integer', minimum: 1, maximum: 200 },
  },
} as const;

/** RF-35 / RN-22: consulta da auditoria, só para administrador. */
export function registrarRotasAuditoria(app: FastifyInstance, banco: Banco): void {
  app.get(
    '/api/admin/auditoria',
    { schema: { querystring: consulta }, preHandler: [exigirSessao(banco), exigirPermissao(banco, 'ver_auditoria')] },
    async (req): Promise<PaginaAuditoria> => listarAuditoria(banco, req.query as FiltroAuditoria, req.comunidadeId),
  );
}
