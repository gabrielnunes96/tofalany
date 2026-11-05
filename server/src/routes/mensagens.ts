import type { FastifyInstance } from 'fastify';
import type { PaginaMensagens } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarCanal } from '../dominio/canais.js';
import { listarMensagensCanal } from '../dominio/mensagens.js';

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
      return listarMensagensCanal(banco, id, antes, limite);
    },
  );
}
