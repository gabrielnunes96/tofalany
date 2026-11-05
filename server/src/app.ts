import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { criarArmazem, type Armazem } from './arquivos/armazem.js';
import { registrarRotasArquivos } from './routes/arquivos.js';
import { registrarRotasPerfil } from './routes/perfil.js';
import { registrarRotasAdmin } from './routes/admin.js';
import { registrarRotasConvite } from './routes/convite.js';
import { registrarRotasMensagens } from './routes/mensagens.js';
import { registrarRotasAnexos } from './routes/anexos.js';
import { registrarRotasSons } from './routes/sons.js';
import { registrarRotasLivekit } from './routes/livekit.js';
import { limparOrfaos } from './dominio/anexos.js';
import type { ErroApi } from '@tofalando/shared';
import type { Config } from './config.js';
import { abrirBanco, EM_MEMORIA, type Banco } from './db/banco.js';
import { ErroHttp } from './erros.js';
import { garantirCodigoConvite } from './dominio/configuracoes.js';
import { registrarRotasServidor } from './routes/servidor.js';
import { registrarRotasAuth } from './routes/auth.js';
import { criarTempoReal, type TempoReal } from './realtime/tempo-real.js';
import { registrarRotasAuditoria } from './routes/auditoria.js';
import { fecharOnlinesPendentes, limparAuditoria } from './dominio/auditoria.js';

const LIMPEZA_AUDITORIA_MS = 6 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyInstance {
    banco: Banco;
    tempoReal: TempoReal;
    armazem: Armazem;
  }
}

export async function construirApp(config: Config): Promise<FastifyInstance> {
  const banco = abrirBanco(config.caminhoBanco);
  try {
    garantirCodigoConvite(banco, config.codigoConvite);
    // Quem ficou online quando o servidor parou de repente; e o que passou do prazo (RN-23).
    fecharOnlinesPendentes(banco);
    limparAuditoria(banco, config.prazoAuditoriaDias);
  } catch (erro) {
    banco.close();
    throw erro;
  }

  const app = Fastify({ logger: config.log ? { redact: ['req.headers.authorization'] } : false, trustProxy: config.atrasDeProxy });
  app.decorate('banco', banco);
  const limpeza = setInterval(() => {
    try {
      limparAuditoria(banco, config.prazoAuditoriaDias);
    } catch (erro) {
      app.log.error(erro);
    }
  }, LIMPEZA_AUDITORIA_MS);
  limpeza.unref();
  app.addHook('onClose', async () => {
    clearInterval(limpeza);
    banco.close();
  });

  app.setErrorHandler((erro: FastifyError, req, reply) => {
    if (erro instanceof ErroHttp) return reply.code(erro.status).send(erro.corpo());
    if (erro.validation) {
      const corpo: ErroApi = { erro: 'dados_invalidos', mensagem: 'Dados inválidos.' };
      return reply.code(400).send(corpo);
    }
    // Erros de cliente do próprio Fastify (JSON malformado, corpo grande, tipo de conteúdo).
    if (erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500) {
      const corpo: ErroApi = { erro: 'dados_invalidos', mensagem: 'Requisição inválida.' };
      return reply.code(erro.statusCode).send(corpo);
    }
    req.log.error(erro);
    const corpo: ErroApi = { erro: 'erro_interno', mensagem: 'Erro interno no servidor.' };
    return reply.code(500).send(corpo);
  });

  app.setNotFoundHandler((_req, reply) => {
    const corpo: ErroApi = { erro: 'nao_encontrado', mensagem: 'Recurso não encontrado.' };
    return reply.code(404).send(corpo);
  });

  // O app Electron chama de file:// (origem "null") ou do dev server; a autenticação é por token, não por cookie.
  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  // Limite geral alto; cada rota define o seu (avatar 8 MB, anexo 25 MB).
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5 } });
  const temporaria = !config.pastaArquivos && config.caminhoBanco === EM_MEMORIA;
  const pasta = config.pastaArquivos ?? (temporaria ? mkdtempSync(join(tmpdir(), 'tofalando-arquivos-')) : join(dirname(config.caminhoBanco), 'arquivos'));
  const armazem = criarArmazem(pasta);
  app.decorate('armazem', armazem);
  if (temporaria) app.addHook('onClose', async () => rmSync(pasta, { recursive: true, force: true }));
  const tempoReal = criarTempoReal(app, banco, config, armazem);
  // Anexos enviados e não usados em 1 h: apagados ao subir e a cada 30 min.
  const ORFAO_MS = 60 * 60 * 1000;
  limparOrfaos(banco, armazem, ORFAO_MS);
  const limpezaOrfaos = setInterval(() => {
    try {
      limparOrfaos(banco, armazem, ORFAO_MS);
    } catch (erro) {
      app.log.error(erro);
    }
  }, 30 * 60 * 1000);
  limpezaOrfaos.unref();
  app.addHook('onClose', async () => clearInterval(limpezaOrfaos));
  app.decorate('tempoReal', tempoReal);
  registrarRotasServidor(app, banco, config);
  registrarRotasAuth(app, banco, config, tempoReal);
  registrarRotasAuditoria(app, banco);
  registrarRotasArquivos(app, armazem);
  registrarRotasPerfil(app, banco, armazem, tempoReal);
  registrarRotasAdmin(app, banco, config, tempoReal, armazem);
  registrarRotasMensagens(app, banco);
  registrarRotasAnexos(app, banco, armazem);
  registrarRotasSons(app, banco, armazem, tempoReal);
  await registrarRotasLivekit(app, banco, config, tempoReal.voz);
  registrarRotasConvite(
    app,
    banco,
    config,
    config.pastaDownloads ?? (config.caminhoBanco === EM_MEMORIA ? undefined : join(dirname(config.caminhoBanco), 'downloads')),
  );
  if (!config.urlPublica) {
    app.log.warn('URL_PUBLICA não definida: o link de convite usa o endereço por onde o administrador acessou. Defina em produção.');
  }
  return app;
}
