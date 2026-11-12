import type { FastifyInstance } from 'fastify';
import { lerItemLoja, type CatalogoLojaDto, type LojaEstadoDto, type MovimentoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { comprar, estadoLoja, extrato } from '../dominio/loja.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { TempoReal } from '../realtime/tempo-real.js';

/** Só descarta campos extras (o preço do app, por exemplo); o que vale no item quem decide é lerItemLoja (item_invalido). */
const corpoCompra = {
  type: 'object',
  additionalProperties: false,
  properties: { tipo: {}, tema: {}, qualidade: {} },
} as const;

const consultaExtrato = {
  type: 'object',
  additionalProperties: false,
  properties: { antes: { type: 'integer', minimum: 1 }, limite: { type: 'integer', minimum: 1, maximum: 100 } },
} as const;

/** Pontos e loja: catálogo com preços, compra e extrato. Tudo da conta: vale em qualquer servidor da instalação. */
export function registrarRotasLoja(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal): void {
  const daConta = exigirSessao(banco, { daConta: true });

  app.get('/api/loja', { preHandler: daConta }, async (req): Promise<CatalogoLojaDto> => ({
    precos: config.pontos.precos,
    pontosPorMinuto: config.pontos.porMinuto,
    estado: estadoLoja(banco, req.usuarioId!),
  }));

  app.post('/api/loja/comprar', { preHandler: daConta, schema: { body: corpoCompra } }, async (req): Promise<LojaEstadoDto> => {
    const item = lerItemLoja(req.body);
    if (!item) throw new ErroHttp(400, 'item_invalido', 'Esse item não existe na loja.');
    try {
      const { estado, valor } = comprar(banco, req.usuarioId!, item, config.pontos.precos);
      registrarAuditoria(banco, {
        tipo: 'loja_compra',
        atorId: req.usuarioId!,
        detalhes: { item: item.tipo === 'tema' ? `tema ${item.tema}` : `vale ${item.qualidade}`, pontos: valor },
      });
      req.log.info({ usuarioId: req.usuarioId!, item, valor, saldo: estado.saldo }, 'compra na loja');
      tempoReal.avisarLoja(req.usuarioId!);
      return estado;
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.codigo === 'saldo_insuficiente') req.log.warn({ usuarioId: req.usuarioId!, item }, 'compra recusada: saldo insuficiente');
      throw erro;
    }
  });

  app.get('/api/loja/extrato', { preHandler: daConta, schema: { querystring: consultaExtrato } }, async (req): Promise<{ movimentos: MovimentoDto[] }> => {
    const { antes, limite } = req.query as { antes?: number; limite?: number };
    return { movimentos: extrato(banco, req.usuarioId!, { antes, limite }) };
  });
}
