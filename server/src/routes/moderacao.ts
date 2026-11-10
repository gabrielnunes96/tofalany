import type { FastifyInstance } from 'fastify';
import type { BanimentoDto, UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirPermissao, exigirSessao } from '../auth/sessao-http.js';
import { buscarNa, paraDto } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { conferirModeracao, listarBanidos, validarMinutos, validarMotivo } from '../dominio/moderacao.js';
import { salaComunidade } from '../realtime/salas.js';
import type { TempoReal } from '../realtime/tempo-real.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;
const corpoMotivo = { type: 'object', additionalProperties: false, properties: { motivo: { type: ['string', 'null'], maxLength: 2000 } } } as const;

/**
 * Moderação por servidor (como no Discord): castigo por tempo (a pessoa continua no servidor, mas não fala, não
 * escreve, não transmite), expulsar (sai; volta com convite) e banir (sai e não volta nem com convite). A pessoa
 * vê o motivo. Quem pode: administrador ou cargo com "Moderar membros"; administradores não são moderados.
 */
export function registrarRotasModeracao(app: FastifyInstance, banco: Banco, tempoReal: TempoReal): void {
  const moderador = [exigirSessao(banco), exigirPermissao(banco, 'moderar_membros', 'Seu cargo não permite moderar membros.')];
  const avisarMembro = (id: number, c: number) => {
    const linha = buscarNa(banco, id, c);
    if (linha) tempoReal.io.to(salaComunidade(c)).emit('usuario:atualizado', paraDto(linha));
  };

  app.post(
    '/api/moderacao/:id/castigo',
    {
      preHandler: moderador,
      schema: {
        params: paramId,
        body: { type: 'object', required: ['minutos'], additionalProperties: false, properties: { minutos: { type: 'integer' }, motivo: { type: ['string', 'null'], maxLength: 2000 } } },
      },
    },
    async (req): Promise<UsuarioDto> => {
      const { id } = req.params as { id: number };
      const corpo = req.body as { minutos: unknown; motivo?: unknown };
      const c = req.comunidadeId;
      const minutos = validarMinutos(corpo.minutos);
      const motivo = validarMotivo(corpo.motivo);
      const ate = Date.now() + minutos * 60_000;
      banco.transaction(() => {
        conferirModeracao(banco, c, req.usuarioId!, id);
        banco.prepare('UPDATE membros SET castigo_ate = ?, castigo_motivo = ? WHERE comunidade_id = ? AND usuario_id = ?').run(ate, motivo, c, id);
        registrarAuditoria(banco, { tipo: 'castigo_aplicado', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c, detalhes: { minutos, ...(motivo ? { motivo } : {}) } });
      })();
      tempoReal.tirarDaVoz(id, c);
      tempoReal.cargoMudou(id);
      tempoReal.avisarCastigo(id, c, { ate, motivo });
      avisarMembro(id, c);
      return paraDto(buscarNa(banco, id, c)!);
    },
  );

  app.delete('/api/moderacao/:id/castigo', { preHandler: moderador, schema: { params: paramId } }, async (req): Promise<UsuarioDto> => {
    const { id } = req.params as { id: number };
    const c = req.comunidadeId;
    banco.transaction(() => {
      conferirModeracao(banco, c, req.usuarioId!, id);
      banco.prepare('UPDATE membros SET castigo_ate = NULL, castigo_motivo = NULL WHERE comunidade_id = ? AND usuario_id = ?').run(c, id);
      registrarAuditoria(banco, { tipo: 'castigo_removido', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c });
    })();
    tempoReal.avisarCastigo(id, c, null);
    avisarMembro(id, c);
    return paraDto(buscarNa(banco, id, c)!);
  });

  /** Expulsar e banir: a pessoa sai do servidor (e das conversas de lá) e vê o motivo. */
  const tirar = (tipo: 'expulso' | 'banido') => async (req: { params: unknown; body: unknown; comunidadeId: number; usuarioId?: number }) => {
    const { id } = req.params as { id: number };
    const motivo = validarMotivo((req.body as { motivo?: unknown } | undefined)?.motivo);
    const c = req.comunidadeId;
    banco.transaction(() => {
      conferirModeracao(banco, c, req.usuarioId!, id);
      banco.prepare('DELETE FROM membros WHERE comunidade_id = ? AND usuario_id = ?').run(c, id);
      if (tipo === 'banido') {
        banco
          .prepare('INSERT INTO banimentos (comunidade_id, usuario_id, motivo, por_id, em) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET motivo = excluded.motivo, por_id = excluded.por_id, em = excluded.em')
          .run(c, id, motivo, req.usuarioId!, Date.now());
      }
      registrarAuditoria(banco, { tipo, atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c, ...(motivo ? { detalhes: { motivo } } : {}) });
    })();
    tempoReal.tirarDaComunidade(id, c, tipo, motivo);
    tempoReal.io.to(salaComunidade(c)).emit('usuario:removido', { id });
  };
  app.post('/api/moderacao/:id/expulsar', { preHandler: moderador, schema: { params: paramId, body: corpoMotivo } }, async (req, reply) => {
    await tirar('expulso')(req);
    return reply.code(204).send();
  });
  app.post('/api/moderacao/:id/banir', { preHandler: moderador, schema: { params: paramId, body: corpoMotivo } }, async (req, reply) => {
    await tirar('banido')(req);
    return reply.code(204).send();
  });

  app.get('/api/moderacao/banidos', { preHandler: moderador }, async (req): Promise<BanimentoDto[]> => listarBanidos(banco, req.comunidadeId));

  app.delete('/api/moderacao/banidos/:id', { preHandler: moderador, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const r = banco.prepare('DELETE FROM banimentos WHERE comunidade_id = ? AND usuario_id = ?').run(req.comunidadeId, id);
    if (!r.changes) throw new ErroHttp(404, 'nao_encontrado', 'Essa pessoa não está banida.');
    registrarAuditoria(banco, { tipo: 'desbanido', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: req.comunidadeId });
    return reply.code(204).send();
  });
}
