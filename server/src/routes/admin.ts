import type { FastifyInstance, FastifyRequest } from 'fastify';
import { validarCodigoConvite, type Cargo, type ConviteDto, type UsuarioAdminDto, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, contarAdminsAtivos, listarParaAdmin, paraDto } from '../dominio/usuarios.js';
import { revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { CHAVE_CONVITE, gravarConfiguracao, lerConfiguracao } from '../dominio/configuracoes.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import type { Armazem } from '../arquivos/armazem.js';
import { baseServidor } from './convite.js';
import { montarLinkConvite } from '../dominio/convite.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;

/** Link público do convite (página da T7): URL_PUBLICA ou o endereço por onde a pessoa chamou. */
export function linkConvite(config: Config, req: FastifyRequest, codigo: string): string {
  return montarLinkConvite(baseServidor(config, req), codigo);
}

/** RF-6, RF-6a: cargos, remoção de conta e código de convite (RN-1, RN-5, RN-6, RN-16). */
export function registrarRotasAdmin(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal, armazem: Armazem): void {
  const soAdmin = [exigirSessao(banco), exigirAdmin(banco)];

  app.get('/api/admin/usuarios', { preHandler: soAdmin }, async (): Promise<UsuarioAdminDto[]> =>
    listarParaAdmin(banco, Date.now() - config.prazoAuditoriaDias * 86_400_000).map((u) => ({ ...paraDto(u), removido: u.removido_em !== null })),
  );

  app.patch(
    '/api/admin/usuarios/:id/cargo',
    {
      preHandler: soAdmin,
      schema: {
        params: paramId,
        body: { type: 'object', required: ['cargo'], additionalProperties: false, properties: { cargo: { type: 'string', enum: ['admin', 'membro'] } } },
      },
    },
    async (req): Promise<UsuarioDto> => {
      const { id } = req.params as { id: number };
      const { cargo } = req.body as { cargo: Cargo };
      const dto = banco.transaction(() => {
        const alvo = buscarPorId(banco, id);
        if (!alvo) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
        if (alvo.cargo === cargo) return paraDto(alvo);
        if (alvo.cargo === 'admin' && contarAdminsAtivos(banco) <= 1) {
          throw new ErroHttp(409, 'ultimo_admin', 'O servidor precisa de pelo menos um administrador.');
        }
        banco.prepare('UPDATE usuarios SET cargo = ? WHERE id = ?').run(cargo, id);
        registrarAuditoria(banco, { tipo: 'cargo_alterado', atorId: req.usuarioId!, alvoUsuarioId: id, detalhes: { cargo } });
        return paraDto(buscarPorId(banco, id)!);
      })();
      tempoReal.io.emit('usuario:atualizado', dto);
      tempoReal.cargoMudou(dto.id);
      return dto;
    },
  );

  app.delete('/api/admin/usuarios/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const avatar = banco.transaction(() => {
      const alvo = buscarPorId(banco, id);
      if (!alvo) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
      if (alvo.cargo === 'admin' && contarAdminsAtivos(banco) <= 1) {
        throw new ErroHttp(409, 'ultimo_admin', 'O servidor precisa de pelo menos um administrador.');
      }
      // A linha fica (autoria "conta removida"); o login é liberado e a vaga do limite também (RN-16).
      registrarAuditoria(banco, { tipo: 'conta_removida', atorId: req.usuarioId!, alvoUsuarioId: id });
      banco.prepare('UPDATE usuarios SET removido_em = ?, usuario_norm = NULL, avatar_arquivo = NULL WHERE id = ?').run(Date.now(), id);
      revogarSessoesDoUsuario(banco, id);
      return alvo.avatar_arquivo;
    })();
    armazem.apagar(avatar);
    tempoReal.revogarUsuario(id, 'conta_removida');
    tempoReal.io.emit('usuario:removido', { id });
    reply.code(204);
  });

  app.get('/api/admin/convite', { preHandler: soAdmin }, async (req): Promise<ConviteDto> => {
    const codigo = lerConfiguracao(banco, CHAVE_CONVITE) ?? '';
    return { codigo, link: linkConvite(config, req, codigo) };
  });

  app.put(
    '/api/admin/convite',
    {
      preHandler: soAdmin,
      schema: { body: { type: 'object', required: ['codigo'], additionalProperties: false, properties: { codigo: { type: 'string', maxLength: 256 } } } },
    },
    async (req): Promise<ConviteDto> => {
      const codigo = validarCodigoConvite((req.body as { codigo: string }).codigo);
      if (!codigo.ok) throw new ErroHttp(400, 'dados_invalidos', codigo.erro);
      // Mesmo código: nada muda e nada vai para a auditoria.
      if (codigo.valor === lerConfiguracao(banco, CHAVE_CONVITE)) return { codigo: codigo.valor, link: linkConvite(config, req, codigo.valor) };
      banco.transaction(() => {
        gravarConfiguracao(banco, CHAVE_CONVITE, codigo.valor);
        registrarAuditoria(banco, { tipo: 'convite_trocado', atorId: req.usuarioId! });
      })();
      // Cada um recebe o link montado com o endereço por onde está conectado.
      for (const s of tempoReal.io.of('/').sockets.values()) {
        s.emit('convite:atualizado', { link: montarLinkConvite(s.data.baseServidor, codigo.valor) });
      }
      return { codigo: codigo.valor, link: linkConvite(config, req, codigo.valor) };
    },
  );
}
