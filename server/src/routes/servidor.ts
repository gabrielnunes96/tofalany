import type { FastifyInstance } from 'fastify';
import { APP_ID, type SaudeInfo, type ServidorInfo } from '@tofalando/shared';
import type { Config } from '../config.js';

export function registrarRotasServidor(app: FastifyInstance, config: Config): void {
  app.get('/api/servidor', async (): Promise<ServidorInfo> => ({
    app: APP_ID,
    nome: config.nomeServidor,
    versao: config.versao,
    limiteContas: config.limiteContas,
  }));

  app.get('/api/saude', async (): Promise<SaudeInfo> => ({ ok: true }));
}
