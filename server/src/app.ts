import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Config } from './config.js';
import { registrarRotasServidor } from './routes/servidor.js';

export async function construirApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.log });
  // O app Electron chama de file:// (origem "null") ou do dev server; a autenticação é por token, não por cookie.
  await app.register(cors, { origin: true });
  registrarRotasServidor(app, config);
  return app;
}
