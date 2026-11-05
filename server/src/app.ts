import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { ErroApi } from '@tofalando/shared';
import type { Config } from './config.js';
import { abrirBanco, type Banco } from './db/banco.js';
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
  await app.register(cors, { origin: true });
  const tempoReal = criarTempoReal(app, banco, config);
  app.decorate('tempoReal', tempoReal);
  registrarRotasServidor(app, banco, config);
  registrarRotasAuth(app, banco, config, tempoReal);
  registrarRotasAuditoria(app, banco);
  return app;
}
