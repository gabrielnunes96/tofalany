import type { FastifyInstance } from 'fastify';
import type { FixadaDto, PaginaMensagens } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { listarMensagens } from '../dominio/mensagens.js';
import { exigirParticipante } from '../dominio/dms.js';
import { listarFixadas } from '../dominio/fixadas.js';

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
          properties: { antes: { type: 'integer', minimum: 1 }, limite: { type: 'integer', minimum: 1, maximum: 100 }, ate: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (req): Promise<PaginaMensagens> => {
      const { id } = req.params as { id: number };
      const { antes, limite, ate } = req.query as { antes?: number; limite?: number; ate?: number };
      const canal = comunidadeDoCanal(banco, id) === req.comunidadeId ? buscarCanal(banco, id) : undefined;
      if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
      return listarMensagens(banco, { canalId: id }, antes, limite, ate);
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
          properties: { antes: { type: 'integer', minimum: 1 }, limite: { type: 'integer', minimum: 1, maximum: 100 }, ate: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (req): Promise<PaginaMensagens> => {
      const { id } = req.params as { id: number };
      const { antes, limite, ate } = req.query as { antes?: number; limite?: number; ate?: number };
      exigirParticipante(banco, id, req.usuarioId!);
      return listarMensagens(banco, { dmId: id }, antes, limite, ate);
    },
  );

  const soId = { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } } as const;

  /** chat-fixar-e-buscar (RF-2): fixadas de um canal do servidor do pedido. */
  app.get('/api/canais/:id/fixadas', { preHandler: exigirSessao(banco), schema: soId }, async (req): Promise<{ fixadas: FixadaDto[] }> => {
    const { id } = req.params as { id: number };
    const canal = comunidadeDoCanal(banco, id) === req.comunidadeId ? buscarCanal(banco, id) : undefined;
    if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
    return { fixadas: listarFixadas(banco, { canalId: id }) };
  });

  /** Fixadas da DM: só os dois participantes (administrador também recebe 403); conta removida continua legível. */
  app.get('/api/dms/:id/fixadas', { preHandler: exigirSessao(banco), schema: soId }, async (req): Promise<{ fixadas: FixadaDto[] }> => {
    const { id } = req.params as { id: number };
    exigirParticipante(banco, id, req.usuarioId!);
    return { fixadas: listarFixadas(banco, { dmId: id }) };
  });
}
