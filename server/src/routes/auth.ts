import type { FastifyInstance, FastifyRequest } from 'fastify';
import { validarSenha, validarUsuario, type CadastroRequest, type LoginRequest, type RedefinirSenhaRequest, type SessaoResponse, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { conferirSenha, gerarHashSenha } from '../auth/senha.js';
import { criarLimitador, type Limitador } from '../auth/limitador.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, buscarPorLogin, cadastrarUsuario, conferirConvite, paraDto } from '../dominio/usuarios.js';
import { criarSessao, revogarSessao, revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { usarRedefinicao } from '../dominio/redefinicoes.js';
import { hashToken } from '../auth/tokens.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import { registrarAuditoria } from '../dominio/auditoria.js';

const texto = { type: 'string', maxLength: 512 } as const;
const corpoCadastro = {
  type: 'object',
  required: ['convite', 'usuario', 'senha'],
  properties: { convite: texto, usuario: texto, senha: texto },
} as const;
const corpoLogin = {
  type: 'object',
  required: ['usuario', 'senha'],
  properties: { usuario: texto, senha: texto },
} as const;

const corpoRedefinir = {
  type: 'object',
  required: ['usuario', 'codigo', 'senha'],
  properties: { usuario: texto, codigo: texto, senha: texto },
} as const;

/** Hash fixo para gastar o mesmo tempo quando o login não existe (não revela quais usuários existem). */
let hashFicticio: Promise<string> | undefined;

export function registrarRotasAuth(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal): void {
  const limiteCadastro = criarLimitador(config.tentativasPorMinuto, 60_000);
  const limiteLogin = criarLimitador(config.tentativasPorMinuto, 60_000);
  const limiteRedefinir = criarLimitador(config.tentativasPorMinuto, 60_000);
  const limitar = (limitador: Limitador, req: FastifyRequest) => {
    if (!limitador.permitir(req.ip)) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um minuto.');
  };

  app.post('/api/auth/cadastro', { schema: { body: corpoCadastro } }, async (req, reply): Promise<SessaoResponse> => {
    limitar(limiteCadastro, req);
    const corpo = req.body as CadastroRequest;
    // Convite primeiro: sem ele não há validação nem hash (CA-2 e custo do scrypt).
    conferirConvite(banco, corpo.convite);
    const usuario = validarUsuario(corpo.usuario);
    if (!usuario.ok) throw new ErroHttp(400, 'dados_invalidos', usuario.erro);
    const senha = validarSenha(corpo.senha);
    if (!senha.ok) throw new ErroHttp(400, 'dados_invalidos', senha.erro);
    const senhaHash = await gerarHashSenha(senha.valor);
    const linha = cadastrarUsuario(banco, { convite: corpo.convite, usuario: usuario.valor, senhaHash, limiteContas: config.limiteContas });
    const token = criarSessao(banco, linha.id);
    // Só depois de a conta (e o registro conta_criada, na mesma transação) estar gravada.
    tempoReal.io.emit('usuario:criado', paraDto(linha));
    reply.code(201);
    return { token, usuario: paraDto(linha) };
  });

  app.post('/api/auth/login', { schema: { body: corpoLogin } }, async (req): Promise<SessaoResponse> => {
    limitar(limiteLogin, req);
    const corpo = req.body as LoginRequest;
    const linha = buscarPorLogin(banco, corpo.usuario);
    hashFicticio ??= gerarHashSenha('senha-que-nao-existe');
    const confere = await conferirSenha(corpo.senha, linha?.senha_hash ?? (await hashFicticio));
    if (!linha || !confere) throw new ErroHttp(401, 'credenciais_invalidas', 'Usuário ou senha incorretos.');
    const token = banco.transaction(() => {
      const novo = criarSessao(banco, linha.id);
      registrarAuditoria(banco, { tipo: 'login', atorId: linha.id });
      return novo;
    })();
    return { token, usuario: paraDto(linha) };
  });

  // Backlog v2, item 3: troca a senha com o código que o administrador gerou; encerra as sessões da conta.
  app.post('/api/auth/redefinir', { schema: { body: corpoRedefinir } }, async (req, reply) => {
    limitar(limiteRedefinir, req);
    const corpo = req.body as RedefinirSenhaRequest;
    const senha = validarSenha(corpo.senha);
    if (!senha.ok) throw new ErroHttp(400, 'dados_invalidos', senha.erro);
    const hash = await gerarHashSenha(senha.valor);
    const id = banco.transaction(() => {
      const linha = buscarPorLogin(banco, corpo.usuario);
      if (!linha || !usarRedefinicao(banco, linha.id, corpo.codigo)) return undefined;
      banco.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, linha.id);
      revogarSessoesDoUsuario(banco, linha.id);
      registrarAuditoria(banco, { tipo: 'senha_redefinida', atorId: linha.id, alvoUsuarioId: linha.id });
      return linha.id;
    })();
    // A mesma resposta para usuário inexistente e código errado (não revela quais contas existem).
    if (id === undefined) throw new ErroHttp(400, 'codigo_invalido', 'Usuário ou código de redefinição incorretos (ou o código expirou).');
    tempoReal.revogarUsuario(id, 'sessao_invalida');
    reply.code(204);
  });

  app.post('/api/auth/sair', { preHandler: exigirSessao(banco) }, async (req, reply) => {
    revogarSessao(banco, req.tokenSessao!);
    registrarAuditoria(banco, { tipo: 'saiu', atorId: req.usuarioId! });
    tempoReal.revogarToken(hashToken(req.tokenSessao!), 'saiu');
    reply.code(204);
  });

  app.get('/api/eu', { preHandler: exigirSessao(banco) }, async (req): Promise<UsuarioDto> => {
    const linha = buscarPorId(banco, req.usuarioId!);
    if (!linha) throw new ErroHttp(401, 'nao_autenticado', 'Sessão inválida ou encerrada. Entre de novo.');
    return paraDto(linha);
  });
}
