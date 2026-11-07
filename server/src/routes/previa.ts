import type { FastifyInstance } from 'fastify';
import type { PreviaLink } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { criarLimitador } from '../auth/limitador.js';
import { criarCachePrevias } from '../previa/previa.js';

/** Backlog v2, item 10b: GET /api/previa?url=… — título, descrição e miniatura de um link do chat. */
export function registrarRotasPrevia(app: FastifyInstance, banco: Banco, buscar = criarCachePrevias()): void {
  const limite = criarLimitador(60, 60_000);
  app.get(
    '/api/previa',
    { preHandler: exigirSessao(banco), schema: { querystring: { type: 'object', required: ['url'], properties: { url: { type: 'string', maxLength: 2048 } } } } },
    async (req, reply): Promise<PreviaLink | undefined> => {
      if (!limite.permitir(String(req.usuarioId))) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas prévias de uma vez. Aguarde um minuto.');
      const { url } = req.query as { url: string };
      const previa = await buscar(url);
      // Prévias mudam pouco: o app pode guardar por 1 h.
      reply.header('cache-control', 'private, max-age=3600');
      if (!previa) {
        reply.code(204);
        return undefined;
      }
      return previa;
    },
  );
}
