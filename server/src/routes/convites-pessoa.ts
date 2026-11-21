import type { FastifyInstance, FastifyRequest } from 'fastify';
import { caminhoComunidade, type ComunidadeDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { criarLimitador } from '../auth/limitador.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { dividemServidor } from '../dominio/conhecer.js';
import { saoAmigos } from '../dominio/amizades.js';
import { comunidadeDto, comunidadesDe, conviteDa, membroDe, nomeComunidade } from '../dominio/comunidades.js';
import { estaBanido } from '../dominio/moderacao.js';
import { temPermissao } from '../dominio/funcoes.js';
import { montarLinkConvite } from '../dominio/convite.js';
import { abrirDm } from '../dominio/dms.js';
import { buscarMensagem, inserirMensagem } from '../dominio/mensagens.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import { baseServidor } from './convite.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;

/**
 * qualidade-de-vida, RF-2 e RF-3: convidar alguém para um servidor pelo cartão ou pelo menu da pessoa.
 * - GET /api/usuarios/:id/convites: os servidores para onde eu posso convidar a pessoa.
 * - POST /api/usuarios/:id/convites { comunidadeId }: manda o convite como mensagem direta minha.
 * Os dois exigem que as duas pessoas dividam um servidor ou sejam amigas (T-2): só "conhecer por DM" não basta, porque
 * a DM não chega a quem não divide servidor nem é amigo. Quem não atende recebe o mesmo 404 de uma conta inexistente.
 */
export function registrarRotasConvitesPessoa(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal): void {
  // T-4: a rota cria DM e mensagem a pedido.
  const limite = criarLimitador(10, 10 * 60_000);

  const alvoDe = (req: FastifyRequest) => {
    const eu = req.usuarioId!;
    const { id } = req.params as { id: number };
    if (id === eu || !buscarPorId(banco, id) || !(dividemServidor(banco, eu, id) || saoAmigos(banco, eu, id))) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
    return { eu, alvo: id };
  };

  /** Por que não dá para convidar `alvo` para `c` (RN-2, RN-3), ou null se dá. */
  const impedimento = (eu: number, alvo: number, c: number): ErroHttp | null => {
    if (!membroDe(banco, c, eu) || !temPermissao(banco, eu, 'gerenciar_convite', c)) return new ErroHttp(403, 'sem_permissao', 'Você não pode convidar para esse servidor.');
    if (membroDe(banco, c, alvo)) return new ErroHttp(409, 'ja_membro', 'Essa pessoa já está nesse servidor.');
    if (estaBanido(banco, c, alvo)) return new ErroHttp(409, 'banido', 'Essa pessoa foi banida desse servidor.');
    if (!conviteDa(banco, c)) return new ErroHttp(409, 'sem_convite', 'Esse servidor está sem código de convite.');
    return null;
  };

  app.get(
    '/api/usuarios/:id/convites',
    { preHandler: exigirSessao(banco, { daConta: true }), schema: { params: paramId } },
    async (req, reply): Promise<ComunidadeDto[]> => {
      const { eu, alvo } = alvoDe(req);
      reply.header('cache-control', 'no-store');
      const base = baseServidor(config, req);
      return comunidadesDe(banco, eu)
        .filter((c) => !impedimento(eu, alvo, c))
        .map((c) => comunidadeDto(banco, c, base, config.nomeServidor));
    },
  );

  app.post(
    '/api/usuarios/:id/convites',
    {
      preHandler: exigirSessao(banco, { daConta: true }),
      schema: {
        params: paramId,
        body: { type: 'object', required: ['comunidadeId'], additionalProperties: false, properties: { comunidadeId: { type: 'integer', minimum: 1 } } },
      },
    },
    async (req): Promise<{ ok: true }> => {
      const { eu, alvo } = alvoDe(req);
      const { comunidadeId } = req.body as { comunidadeId: number };
      const erro = impedimento(eu, alvo, comunidadeId);
      if (erro) throw erro;
      if (!limite.permitir(String(eu))) throw new ErroHttp(429, 'muitas_tentativas', 'Muitos convites seguidos. Tente de novo daqui a pouco.');
      const nome = nomeComunidade(banco, comunidadeId, config.nomeServidor) ?? 'servidor';
      // O link é montado aqui, nunca vem do app.
      const link = montarLinkConvite(baseServidor(config, req) + caminhoComunidade(comunidadeId), conviteDa(banco, comunidadeId)!);
      const mensagem = banco.transaction(() => {
        const dmId = abrirDm(banco, eu, alvo);
        const id = inserirMensagem(banco, { dmId }, eu, `Convite para o servidor ${nome}: ${link}`, Date.now());
        return buscarMensagem(banco, id)!;
      })();
      registrarAuditoria(banco, { tipo: 'convite_enviado', atorId: eu, alvoUsuarioId: alvo, comunidadeId });
      tempoReal.entregarMensagemDm(mensagem);
      return { ok: true };
    },
  );
}
