import type { FastifyInstance } from 'fastify';
import { APP_ID, type SaudeInfo, type ServidorInfo } from '@tofalando/shared';
import type { Config } from '../config.js';
import type { Banco } from '../db/banco.js';
import { contarContasAtivas } from '../dominio/usuarios.js';

export function registrarRotasServidor(app: FastifyInstance, banco: Banco, config: Config): void {
  app.get('/api/servidor', async (): Promise<ServidorInfo> => ({
    app: APP_ID,
    nome: config.nomeServidor,
    versao: config.versao,
    contas: contarContasAtivas(banco),
    limiteContas: config.limiteContas,
  }));

  app.get('/api/saude', async (): Promise<SaudeInfo> => {
    banco.prepare('SELECT 1').get();
    return { ok: true };
  });
}
