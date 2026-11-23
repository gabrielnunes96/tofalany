import type { FastifyInstance } from 'fastify';
import type { SessaoAparelhoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { desconectarSessao, sessoesDaConta } from '../dominio/sessoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { TempoReal } from '../realtime/tempo-real.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9a-f]{32}$' } } } as const;

/**
 * celular (RN-12, A2): "Aparelhos conectados". A pessoa vê as sessões da própria conta e desconecta qualquer uma (um
 * celular perdido, por exemplo): a sessão some na hora, o socket cai e o registro de push vai junto (CASCADE).
 */
export function registrarRotasSessoes(app: FastifyInstance, banco: Banco, tempoReal: TempoReal): void {
  const daConta = exigirSessao(banco, { daConta: true });

  app.get('/api/sessoes', { preHandler: daConta }, async (req): Promise<SessaoAparelhoDto[]> => sessoesDaConta(banco, req.usuarioId!, req.tokenSessao!));

  app.delete('/api/sessoes/:id', { preHandler: daConta, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const hash = banco.transaction(() => {
      const h = desconectarSessao(banco, req.usuarioId!, id);
      // A mesma resposta para "não existe" e "é de outra pessoa".
      if (!h) throw new ErroHttp(404, 'nao_encontrado', 'Aparelho não encontrado.');
      registrarAuditoria(banco, { tipo: 'aparelho_desconectado', atorId: req.usuarioId! });
      return h;
    })();
    tempoReal.revogarToken(hash, 'sessao_invalida');
    reply.code(204);
  });
}
