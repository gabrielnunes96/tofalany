import type { FastifyInstance, FastifyRequest } from 'fastify';
import { caminhoComunidade, COMUNIDADE_PRINCIPAL, validarCodigoConvite, type Cargo, type ConviteDto, type FuncaoDto, type RedefinicaoDto, type UsuarioAdminDto, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirPermissao, exigirPrincipal, exigirSessao } from '../auth/sessao-http.js';
import { buscarNa, buscarPorId, listarMembros, listarParaAdmin, paraDto } from '../dominio/usuarios.js';
import { contarAdmins, conviteDa, donoDa, trocarConvite } from '../dominio/comunidades.js';
import { salaComunidade } from '../realtime/salas.js';
import { revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import type { Armazem } from '../arquivos/armazem.js';
import { baseServidor } from './convite.js';
import { montarLinkConvite } from '../dominio/convite.js';
import { gerarRedefinicao } from '../dominio/redefinicoes.js';
import { buscarFuncao, criarFuncao, editarFuncao, listarFuncoes, removerFuncao, validarFuncao } from '../dominio/funcoes.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;

/** Link público do convite (página da T7): URL_PUBLICA ou o endereço por onde a pessoa chamou. */
export function linkConvite(config: Config, req: FastifyRequest, codigo: string): string {
  return montarLinkConvite(baseServidor(config, req) + caminhoComunidade(req.comunidadeId), codigo);
}

/** RF-6, RF-6a: cargos, remoção de conta e código de convite (RN-1, RN-5, RN-6, RN-16). */
export function registrarRotasAdmin(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal, armazem: Armazem): void {
  const soAdmin = [exigirSessao(banco), exigirAdmin(banco)];
  /** O que é da conta (remover a conta, código de senha) fica com o administrador do servidor principal. */
  const soAdminPrincipal = [...soAdmin, exigirPrincipal()];
  /** Membro do servidor do pedido, com o cargo de lá (o alvo precisa participar). */
  const alvoNa = (id: number, comunidadeId: number) => {
    const alvo = buscarNa(banco, id, comunidadeId);
    if (!alvo) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada neste servidor.');
    return alvo;
  };
  /** O perfil visto de cada servidor: quem está em cada um recebe com o cargo de lá. */
  const avisarMembro = (id: number, comunidadeId: number) => {
    const linha = buscarNa(banco, id, comunidadeId);
    if (linha) tempoReal.io.to(salaComunidade(comunidadeId)).emit('usuario:atualizado', paraDto(linha));
  };

  app.get('/api/admin/usuarios', { preHandler: soAdmin }, async (req): Promise<UsuarioAdminDto[]> => {
    // Principal: todas as contas (e as removidas com registro no prazo). Os outros: só os membros de lá.
    if (req.comunidadeId !== COMUNIDADE_PRINCIPAL) return listarMembros(banco, req.comunidadeId).map((u) => ({ ...paraDto(u), removido: false }));
    return listarParaAdmin(banco, Date.now() - config.prazoAuditoriaDias * 86_400_000).map((u) => {
      const daqui = u.removido_em === null ? buscarNa(banco, u.id, COMUNIDADE_PRINCIPAL) : undefined;
      return { ...paraDto(daqui ?? u), removido: u.removido_em !== null };
    });
  });

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
      const c = req.comunidadeId;
      const dto = banco.transaction(() => {
        const alvo = alvoNa(id, c);
        if (alvo.cargo === cargo) return paraDto(alvo);
        if (alvo.cargo === 'admin' && contarAdmins(banco, c) <= 1) {
          throw new ErroHttp(409, 'ultimo_admin', 'O servidor precisa de pelo menos um administrador.');
        }
        if (donoDa(banco, c) === id) throw new ErroHttp(409, 'ultimo_admin', 'Quem criou o servidor continua administrador.');
        banco.prepare('UPDATE membros SET cargo = ? WHERE comunidade_id = ? AND usuario_id = ?').run(cargo, c, id);
        // No principal, o cargo da conta acompanha (é ele que administra as contas da instalação).
        if (c === COMUNIDADE_PRINCIPAL) banco.prepare('UPDATE usuarios SET cargo = ? WHERE id = ?').run(cargo, id);
        registrarAuditoria(banco, { tipo: 'cargo_alterado', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c, detalhes: { cargo } });
        return paraDto(alvoNa(id, c));
      })();
      avisarMembro(dto.id, c);
      tempoReal.cargoMudou(dto.id);
      return dto;
    },
  );

  app.delete('/api/admin/usuarios/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const c = req.comunidadeId;
    // Fora do principal, "remover" é tirar do servidor (a conta continua nos outros).
    if (c !== COMUNIDADE_PRINCIPAL) {
      banco.transaction(() => {
        const alvo = alvoNa(id, c);
        if (donoDa(banco, c) === id) throw new ErroHttp(409, 'ultimo_admin', 'Quem criou o servidor não pode ser tirado dele.');
        if (alvo.cargo === 'admin' && contarAdmins(banco, c) <= 1) throw new ErroHttp(409, 'ultimo_admin', 'O servidor precisa de pelo menos um administrador.');
        banco.prepare('DELETE FROM membros WHERE comunidade_id = ? AND usuario_id = ?').run(c, id);
        registrarAuditoria(banco, { tipo: 'tirado_do_servidor', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c });
      })();
      tempoReal.tirarDaComunidade(id, c);
      tempoReal.io.to(salaComunidade(c)).emit('usuario:removido', { id });
      return reply.code(204).send();
    }
    const avatar = banco.transaction(() => {
      const alvo = buscarNa(banco, id, COMUNIDADE_PRINCIPAL) ?? buscarPorId(banco, id);
      if (!alvo) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
      if (alvo.cargo === 'admin' && contarAdmins(banco, COMUNIDADE_PRINCIPAL) <= 1) {
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
  app.post('/api/admin/usuarios/:id/redefinicao', { preHandler: soAdminPrincipal, schema: { params: paramId } }, async (req): Promise<RedefinicaoDto> => {
    const { id } = req.params as { id: number };
    return banco.transaction(() => {
      if (!buscarPorId(banco, id)) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
      registrarAuditoria(banco, { tipo: 'redefinicao_gerada', atorId: req.usuarioId!, alvoUsuarioId: id });
      return gerarRedefinicao(banco, id, req.usuarioId!);
    })();
  });

  // Backlog v2, item 10c: cargos personalizados (só administrador cria, edita, remove e atribui).
  const avisarFuncoes = (c: number, afetados: number[] = []) => {
    tempoReal.io.to(salaComunidade(c)).emit('funcoes:atualizadas', listarFuncoes(banco, c));
    for (const id of afetados) {
      avisarMembro(id, c);
      tempoReal.cargoMudou(id);
    }
  };
  const usuariosDaFuncao = (id: number) => (banco.prepare('SELECT usuario_id FROM membros WHERE funcao_id = ?').all(id) as { usuario_id: number }[]).map((u) => u.usuario_id);

  app.post('/api/admin/funcoes', { preHandler: soAdmin }, async (req, reply): Promise<FuncaoDto> => {
    const dados = validarFuncao(req.body);
    if ('erro' in dados) throw new ErroHttp(400, 'dados_invalidos', dados.erro);
    if (listarFuncoes(banco, req.comunidadeId).length >= 20) throw new ErroHttp(409, 'limite_cargos', 'O servidor já tem 20 cargos.');
    const funcao = criarFuncao(banco, dados, req.comunidadeId);
    avisarFuncoes(req.comunidadeId);
    reply.code(201);
    return funcao;
  });

  app.put('/api/admin/funcoes/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req): Promise<FuncaoDto> => {
    const { id } = req.params as { id: number };
    const dados = validarFuncao(req.body);
    if ('erro' in dados) throw new ErroHttp(400, 'dados_invalidos', dados.erro);
    const funcao = editarFuncao(banco, id, dados, req.comunidadeId);
    if (!funcao) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
    // Quem tinha o cargo pode ter perdido permissões (ex.: transmitir em alta): a regra vale na hora.
    avisarFuncoes(req.comunidadeId, usuariosDaFuncao(id));
    return funcao;
  });

  app.delete('/api/admin/funcoes/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const afetados = banco.transaction(() => removerFuncao(banco, id, req.comunidadeId))();
    if (!afetados) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
    avisarFuncoes(req.comunidadeId, afetados);
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
      const c = req.comunidadeId;
      const dto = banco.transaction(() => {
        alvoNa(id, c);
        if (funcaoId !== null && !buscarFuncao(banco, funcaoId, c)) throw new ErroHttp(404, 'nao_encontrado', 'Cargo não encontrado.');
        banco.prepare('UPDATE membros SET funcao_id = ? WHERE comunidade_id = ? AND usuario_id = ?').run(funcaoId, c, id);
        if (c === COMUNIDADE_PRINCIPAL) banco.prepare('UPDATE usuarios SET funcao_id = ? WHERE id = ?').run(funcaoId, id);
        registrarAuditoria(banco, { tipo: 'cargo_alterado', atorId: req.usuarioId!, alvoUsuarioId: id, comunidadeId: c, detalhes: { cargo: funcaoId === null ? 'sem cargo' : buscarFuncao(banco, funcaoId, c)!.nome } });
        return paraDto(alvoNa(id, c));
      })();
      avisarMembro(id, c);
      tempoReal.cargoMudou(id);
      return dto;
    },
  );

  // Backlog v2, item 10c: o convite fica com quem tem "Gerenciar convite".
  const podeConvite = [exigirSessao(banco), exigirPermissao(banco, 'gerenciar_convite')];
  app.get('/api/admin/convite', { preHandler: podeConvite }, async (req): Promise<ConviteDto> => {
    const codigo = conviteDa(banco, req.comunidadeId) ?? '';
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
      const c = req.comunidadeId;
      if (codigo.valor === conviteDa(banco, c)) return { codigo: codigo.valor, link: linkConvite(config, req, codigo.valor) };
      banco.transaction(() => {
        // Dois servidores com o mesmo código não dá (o convite diz em qual a pessoa entra).
        const outro = banco.prepare('SELECT id FROM comunidades WHERE convite = ? AND id <> ?').get(codigo.valor, c);
        if (outro) throw new ErroHttp(409, 'dados_invalidos', 'Esse código já é usado por outro servidor. Escolha outro.');
        trocarConvite(banco, c, codigo.valor);
        registrarAuditoria(banco, { tipo: 'convite_trocado', atorId: req.usuarioId!, comunidadeId: c });
      })();
      // Cada um (deste servidor) recebe o link montado com o endereço por onde está conectado.
      for (const s of tempoReal.io.of('/').sockets.values()) {
        if (s.data.comunidadeId === c) s.emit('convite:atualizado', { link: montarLinkConvite(s.data.baseServidor, codigo.valor) });
      }
      return { codigo: codigo.valor, link: linkConvite(config, req, codigo.valor) };
    },
  );
}
