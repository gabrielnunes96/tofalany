import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { lerConfig, type Config } from '../src/config.js';

export const CONVITE = 'convite-de-teste';

export function configTeste(extra: Record<string, string> = {}): Config {
  return lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000', ...extra });
}

export function appTeste(extra: Record<string, string> = {}): Promise<FastifyInstance> {
  return construirApp(configTeste(extra));
}

export async function cadastrar(app: FastifyInstance, usuario: string, senha = 'Senha-forte-1', convite = CONVITE) {
  return app.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite, usuario, senha } });
}
