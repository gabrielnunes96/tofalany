import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { GifConfig } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { gravarConfiguracao, lerConfiguracao } from '../dominio/configuracoes.js';
import { meuCastigo } from '../dominio/moderacao.js';

/** Segredo só do servidor para o código da pessoa na Klipy (a chave da Klipy é conhecida por todo app). */
function segredoCliente(banco: Banco): string {
  const atual = lerConfiguracao(banco, 'gif_segredo');
  if (atual) return atual;
  const novo = randomBytes(32).toString('hex');
  gravarConfiguracao(banco, 'gif_segredo', novo);
  return novo;
}

/**
 * Busca de GIF: GET /api/gif/config entrega a quem está logado a chave da Klipy e um código estável da pessoa
 * (os termos da Klipy pedem que o app chame a Klipy direto). Sem chave configurada, 204 (busca desligada).
 */
export function registrarRotasGif(app: FastifyInstance, banco: Banco, config: Config): void {
  app.get('/api/gif/config', { preHandler: exigirSessao(banco) }, async (req, reply): Promise<GifConfig | undefined> => {
    reply.header('cache-control', 'no-store');
    // Desligada, ou a pessoa está de castigo (não participa do chat até acabar).
    if (!config.gif || meuCastigo(banco, req.comunidadeId, req.usuarioId!)) {
      reply.code(204);
      return undefined;
    }
    // Identifica a pessoa na Klipy (customer_id) sem revelar o id nem o nome da conta, nem deixar outro membro forjá-lo.
    const cliente = createHmac('sha256', segredoCliente(banco)).update(`${req.comunidadeId}:${req.usuarioId}`).digest('hex').slice(0, 32);
    return { chave: config.gif.chave, base: config.gif.base, cliente };
  });
}
