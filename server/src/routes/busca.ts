import type { FastifyInstance } from 'fastify';
import type { PedidoBusca, RespostaBusca } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { criarLimitador } from '../auth/limitador.js';
import { buscarMensagens } from '../dominio/busca.js';

/**
 * chat-fixar-e-buscar: POST /api/busca. POST para o termo não ir para o log na URL (A15); corpo fechado (A18);
 * até 10 buscas a cada 10 s por pessoa (A7: a consulta roda na thread do servidor).
 */
export function registrarRotasBusca(app: FastifyInstance, banco: Banco): void {
  const limitador = criarLimitador(10, 10_000);
  const id = { type: 'integer', minimum: 1 } as const;
  app.post(
    '/api/busca',
    {
      preHandler: exigirSessao(banco),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['onde'],
          properties: {
            q: { type: 'string', maxLength: 100 },
            onde: { type: 'string', enum: ['conversa', 'servidor', 'dms'] },
            canalId: id,
            dmId: id,
            autorId: id,
            comAnexo: { type: 'boolean' },
            comGif: { type: 'boolean' },
            antes: id,
          },
        },
      },
    },
    async (req): Promise<RespostaBusca> => {
      if (!limitador.permitir(String(req.usuarioId))) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas buscas seguidas. Espere alguns segundos.');
      return buscarMensagens(banco, req.body as PedidoBusca, req.usuarioId!, req.comunidadeId);
    },
  );
}
