import type { FastifyInstance, FastifyRequest } from 'fastify';
import { validarCodigoConvite, type Cargo, type ConviteDto, type FuncaoDto, type RedefinicaoDto, type UsuarioAdminDto, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirPermissao, exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, contarAdminsAtivos, listarParaAdmin, paraDto } from '../dominio/usuarios.js';
import { revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { CHAVE_CONVITE, gravarConfiguracao, lerConfiguracao } from '../dominio/configuracoes.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import type { Armazem } from '../arquivos/armazem.js';
import { baseServidor } from './convite.js';
import { montarLinkConvite } from '../dominio/convite.js';
import { gerarRedefinicao } from '../dominio/redefinicoes.js';
import { buscarFuncao, criarFuncao, editarFuncao, listarFuncoes, removerFuncao, validarFuncao } from '../dominio/funcoes.js';

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

  // Backlog v2, item 3: código de uso único (24 h) para a pessoa trocar a senha pelo app, sem terminal.
  app.post('/api/admin/usuarios/:id/redefinicao', { preHandler: soAdmin, schema: { params: paramId } }, async (req): Promise<RedefinicaoDto> => {
    const { id } = req.params as { id: number };
    return banco.transaction(() => {
      if (!buscarPorId(banco, id)) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
      registrarAuditoria(banco, { tipo: 'redefinicao_gerada', atorId: req.usuarioId!, alvoUsuarioId: id });
      return gerarRedefinicao(banco, id, req.usuarioId!);
    })();
  });

  // Backlog v2, item 10c: cargos personalizados (só administrador cria, edita, remove e atribui).
  const avisarFuncoes = (afetados: number[] = []) => {
    tempoReal.io.emit('funcoes:atualizadas', listarFuncoes(banco));
    for (const id of afetados) {
      const u = buscarPorId(banco, id);
      if (u) tempoReal.io.emit('usuario:atualizado', paraDto(u));
      tempoReal.cargoMudou(id);
    }
  };
  const usuariosDaFuncao = (id: number) => (banco.prepare('SELECT id FROM usuarios WHERE funcao_id = ? AND removido_em IS NULL').all(id) as { id: number }[]).map((u) => u.id);

  app.post('/api/admin/funcoes', { preHandler: soAdmin }, async (req, reply): Promise<FuncaoDto> => {
    const dados = validarFuncao(req.body);
    if ('erro' in dados) throw new ErroHttp(400, 'dados_invalidos', dados.erro);
    if (listarFuncoes(banco).length >= 20) throw new ErroHttp(409, 'limite_cargos', 'O servidor já tem 20 cargos.');
    const funcao = criarFuncao(banco, dados);
    avisarFuncoes();
    reply.code(201);
    return funcao;
  });

  app.put('/api/admin/funcoes/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req): Promise<FuncaoDto> => {
    const { id } = req.params as { id: number };
    const dados = validarFuncao(req.body);
    if ('erro' in dados) throw new ErroHttp(400, 'dados_invalidos', dados.erro);
    const funcao = editarFuncao(banco, id, dados);
    if (!funcao) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
    // Quem tinha o cargo pode ter perdido permissões (ex.: transmitir em alta): a regra vale na hora.
    avisarFuncoes(usuariosDaFuncao(id));
    return funcao;
  });

  app.delete('/api/admin/funcoes/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const afetados = banco.transaction(() => removerFuncao(banco, id))();
    if (!afetados) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
    avisarFuncoes(afetados);
    reply.code(204);
  });

  app.patch(
    '/api/admin/usuarios/:id/funcao',
    {
      preHandler: soAdmin,
      schema: { params: paramId, body: { type: 'object', required: ['funcaoId'], additionalProperties: false, properties: { funcaoId: { type: ['integer', 'null'] } } } },
    },
    async (req): Promise<UsuarioDto> => {
      const { id } = req.params as { id: number };
      const { funcaoId } = req.body as { funcaoId: number | null };
      const dto = banco.transaction(() => {
        if (!buscarPorId(banco, id)) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
        if (funcaoId !== null && !buscarFuncao(banco, funcaoId)) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
        banco.prepare('UPDATE usuarios SET funcao_id = ? WHERE id = ?').run(funcaoId, id);
        registrarAuditoria(banco, { tipo: 'cargo_alterado', atorId: req.usuarioId!, alvoUsuarioId: id, detalhes: { cargo: funcaoId === null ? 'sem cargo' : buscarFuncao(banco, funcaoId)!.nome } });
        return paraDto(buscarPorId(banco, id)!);
      })();
      tempoReal.io.emit('usuario:atualizado', dto);
      tempoReal.cargoMudou(id);
      return dto;
    },
  );

  // Backlog v2, item 10c: o convite fica com quem tem "Gerenciar convite".
  const podeConvite = [exigirSessao(banco), exigirPermissao(banco, 'gerenciar_convite')];
  app.get('/api/admin/convite', { preHandler: podeConvite }, async (req): Promise<ConviteDto> => {
    const codigo = lerConfiguracao(banco, CHAVE_CONVITE) ?? '';
    return { codigo, link: linkConvite(config, req, codigo) };
  });

  app.put(
    '/api/admin/convite',
    {
      preHandler: podeConvite,
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
