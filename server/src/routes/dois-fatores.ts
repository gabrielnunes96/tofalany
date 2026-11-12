import type { FastifyInstance } from 'fastify';
import type { DoisFatoresDto, InicioDoisFatoresDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { conferirSenha } from '../auth/senha.js';
import { criarLimitador } from '../auth/limitador.js';
import { exigirAdmin, exigirPrincipal, exigirSessao } from '../auth/sessao-http.js';
import { enderecoOtpauth } from '../auth/totp.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { ativarDoisFatores, conferirSegundoFator, desligarDoisFatores, iniciarDoisFatores, situacaoDoisFatores, temDoisFatores } from '../dominio/dois-fatores.js';

const texto = { type: 'string', maxLength: 512 } as const;
const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;

/** Autenticação em dois fatores (opcional): ligar e desligar na própria conta; o administrador desliga a de alguém. */
export function registrarRotasDoisFatores(app: FastifyInstance, banco: Banco, config: Config): void {
  const daConta = exigirSessao(banco, { daConta: true });
  const limite = criarLimitador(config.tentativasPorMinuto, 60_000);
  const limitar = (chave: string) => {
    if (!limite.permitir(chave)) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um minuto.');
  };
  async function conferirMinhaSenha(usuarioId: number, senha: unknown) {
    const linha = buscarPorId(banco, usuarioId);
    if (!linha || typeof senha !== 'string' || !(await conferirSenha(senha, linha.senha_hash))) throw new ErroHttp(401, 'credenciais_invalidas', 'Senha incorreta.');
    return linha;
  }

  app.get('/api/conta/2fa', { preHandler: daConta }, async (req): Promise<DoisFatoresDto> => situacaoDoisFatores(banco, req.usuarioId!));

  app.post(
    '/api/conta/2fa/iniciar',
    { preHandler: daConta, schema: { body: { type: 'object', required: ['senha'], properties: { senha: texto } } } },
    async (req): Promise<InicioDoisFatoresDto> => {
      limitar(`2fa:${req.usuarioId}`);
      const linha = await conferirMinhaSenha(req.usuarioId!, (req.body as { senha: string }).senha);
      const segredo = iniciarDoisFatores(banco, req.usuarioId!);
      return { segredo, otpauth: enderecoOtpauth(segredo, linha.usuario, config.nomeServidor) };
    },
  );

  app.post(
    '/api/conta/2fa/ativar',
    { preHandler: daConta, schema: { body: { type: 'object', required: ['codigo'], properties: { codigo: texto } } } },
    async (req): Promise<{ codigos: string[] }> => {
      limitar(`2fa:${req.usuarioId}`);
      const codigos = ativarDoisFatores(banco, req.usuarioId!, (req.body as { codigo: string }).codigo);
      registrarAuditoria(banco, { tipo: 'dois_fatores_ligado', atorId: req.usuarioId! });
      return { codigos };
    },
  );

  app.post(
    '/api/conta/2fa/desativar',
    { preHandler: daConta, schema: { body: { type: 'object', required: ['senha', 'codigo'], properties: { senha: texto, codigo: texto } } } },
    async (req): Promise<DoisFatoresDto> => {
      limitar(`2fa:${req.usuarioId}`);
      const { senha, codigo } = req.body as { senha: string; codigo: string };
      await conferirMinhaSenha(req.usuarioId!, senha);
      if (!temDoisFatores(banco, req.usuarioId!)) return situacaoDoisFatores(banco, req.usuarioId!);
      if (!conferirSegundoFator(banco, req.usuarioId!, codigo)) throw new ErroHttp(401, 'codigo_2fa_invalido', 'Código incorreto.');
      desligarDoisFatores(banco, req.usuarioId!);
      registrarAuditoria(banco, { tipo: 'dois_fatores_desligado', atorId: req.usuarioId!, alvoUsuarioId: req.usuarioId! });
      return situacaoDoisFatores(banco, req.usuarioId!);
    },
  );

  // Perdeu o celular e os códigos: o administrador da instalação desliga (a pessoa liga de novo depois de entrar).
  app.post('/api/admin/usuarios/:id/2fa/desligar', { preHandler: [exigirSessao(banco), exigirAdmin(banco), exigirPrincipal()], schema: { params: paramId } }, async (req) => {
    const { id } = req.params as { id: number };
    if (!buscarPorId(banco, id)) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
    if (desligarDoisFatores(banco, id)) registrarAuditoria(banco, { tipo: 'dois_fatores_desligado', atorId: req.usuarioId!, alvoUsuarioId: id });
    return { ok: true };
  });
}
