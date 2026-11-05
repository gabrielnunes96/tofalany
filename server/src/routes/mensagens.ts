import type { FastifyInstance } from 'fastify';
import type { PaginaMensagens } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarCanal } from '../dominio/canais.js';
import { listarMensagens } from '../dominio/mensagens.js';
import { exigirParticipante } from '../dominio/dms.js';

/** RF-8: histórico do canal de texto, em páginas (rolagem para cima). */
export function registrarRotasMensagens(app: FastifyInstance, banco: Banco): void {
  app.get(
    '/api/canais/:id/mensagens',
    {
      preHandler: exigirSessao(banco),
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { antes: { type: 'integer', minimum: 1 }, limite: { type: 'integer', minimum: 1, maximum: 100 } },
        },
      },
    },
    async (req): Promise<PaginaMensagens> => {
      const { id } = req.params as { id: number };
      const { antes, limite } = req.query as { antes?: number; limite?: number };
      const canal = buscarCanal(banco, id);
      if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
      return listarMensagens(banco, { canalId: id }, antes, limite);
    },
  );

  /** RF-12a / RN-18: histórico da DM, só para os dois participantes (administrador também recebe 403). */
  app.get(
    '/api/dms/:id/mensagens',
    {
      preHandler: exigirSessao(banco),
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { antes: { type: 'integer', minimum: 1 }, limite: { type: 'integer', minimum: 1, maximum: 100 } },
        },
      },
    },
    async (req): Promise<PaginaMensagens> => {
      const { id } = req.params as { id: number };
      const { antes, limite } = req.query as { antes?: number; limite?: number };
      exigirParticipante(banco, id, req.usuarioId!);
      return listarMensagens(banco, { dmId: id }, antes, limite);
    },
  );
}
