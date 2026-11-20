import type { FastifyInstance } from 'fastify';
import type { PerfilDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, soData } from '../dominio/usuarios.js';
import { amigosEmComum, seConhecem, servidoresEmComum, temDm } from '../dominio/conhecer.js';
import { comunidadeDto } from '../dominio/comunidades.js';
import { baseServidor } from './convite.js';

/**
 * Mini perfil: GET /api/usuarios/:id/perfil — amigos e servidores em comum (só o que as duas pessoas já dividem, RN-7)
 * e a data da conta (só com conversa direta). Quem não conhece a pessoa (T-5) recebe o mesmo 404 de uma conta que
 * não existe ou foi removida.
 */
export function registrarRotasUsuariosPerfil(app: FastifyInstance, banco: Banco, config: Config): void {
  app.get(
    '/api/usuarios/:id/perfil',
    { preHandler: exigirSessao(banco, { daConta: true }), schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } } },
    async (req, reply): Promise<PerfilDto> => {
      const eu = req.usuarioId!;
      const { id } = req.params as { id: number };
      const alvo = buscarPorId(banco, id);
      if (!alvo || !seConhecem(banco, eu, id)) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
      reply.header('cache-control', 'no-store');
      const base = baseServidor(config, req);
      const servidores = servidoresEmComum(banco, eu, id).map((c) => comunidadeDto(banco, c, base, config.nomeServidor));
      const criado = alvo.criado_em;
      return {
        emComum: { amigos: id === eu ? [] : amigosEmComum(banco, eu, id), servidores: id === eu ? [] : servidores },
        ...(id !== eu && criado && temDm(banco, eu, id) ? { contaDesde: soData(criado) } : {}),
      };
    },
  );
}
