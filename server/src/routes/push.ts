import type { FastifyInstance } from 'fastify';
import type { PreferenciasAvisoDto, ResumoPushDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { hashToken } from '../auth/tokens.js';
import { criarLimitador } from '../auth/limitador.js';
import { ErroHttp } from '../erros.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { gravarPreferenciasAviso, preferenciasAviso, registrarAparelho, removerAparelho, tomarPendentes } from '../dominio/push.js';

const corpoAparelho = {
  type: 'object',
  additionalProperties: false,
  required: ['fcmToken', 'k'],
  properties: { fcmToken: { type: 'string', maxLength: 4096 }, k: { type: 'string', maxLength: 32 } },
} as const;
const corpoPreferencias = {
  type: 'object',
  additionalProperties: false,
  required: ['mensagens', 'chamados', 'silenciadas'],
  properties: { mensagens: { type: 'boolean' }, chamados: { type: 'boolean' }, silenciadas: { type: 'array', maxItems: 500, items: { type: 'string', maxLength: 16 } } },
} as const;
const consultaPendentes = { type: 'object', additionalProperties: false, required: ['k'], properties: { k: { type: 'string', maxLength: 32 } } } as const;

/**
 * celular (RF-6, RN-3 a RN-5): registro do aparelho para o aviso sem conteúdo, os resumos pendentes que o app busca ao
 * acordar e as preferências de aviso da conta. Tudo da conta (vale pelo endereço de qualquer servidor).
 */
export function registrarRotasPush(app: FastifyInstance, banco: Banco): void {
  const daConta = exigirSessao(banco, { daConta: true });
  const limiteRegistro = criarLimitador(10, 60_000);

  // A4: sempre 204, sem dizer se o token já existia; o token nunca vai para o log nem para a auditoria.
  app.post('/api/push/aparelho', { preHandler: daConta, schema: { body: corpoAparelho } }, async (req, reply) => {
    if (!limiteRegistro.permitir(hashToken(req.tokenSessao!))) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: muitos registros seguidos.');
    const { fcmToken, k } = req.body as { fcmToken: string; k: string };
    if (registrarAparelho(banco, hashToken(req.tokenSessao!), fcmToken, k)) registrarAuditoria(banco, { tipo: 'aparelho_registrado', atorId: req.usuarioId! });
    reply.code(204);
  });

  app.delete('/api/push/aparelho', { preHandler: daConta }, async (req, reply) => {
    if (removerAparelho(banco, hashToken(req.tokenSessao!))) registrarAuditoria(banco, { tipo: 'aparelho_removido', atorId: req.usuarioId! });
    reply.code(204);
  });

  app.get('/api/push/pendentes', { preHandler: daConta, schema: { querystring: consultaPendentes } }, async (req): Promise<ResumoPushDto[]> => {
    const { k } = req.query as { k: string };
    return tomarPendentes(banco, hashToken(req.tokenSessao!), k);
  });

  app.get('/api/conta/preferencias-aviso', { preHandler: daConta }, async (req): Promise<PreferenciasAvisoDto> => preferenciasAviso(banco, req.usuarioId!));

  app.put('/api/conta/preferencias-aviso', { preHandler: daConta, schema: { body: corpoPreferencias } }, async (req): Promise<PreferenciasAvisoDto> =>
    gravarPreferenciasAviso(banco, req.usuarioId!, req.body as PreferenciasAvisoDto),
  );
}
