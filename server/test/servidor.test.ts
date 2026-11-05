import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { lerConfig } from '../src/config.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/servidor', () => {
  it('identifica o servidor Tô Falando com nome, versão e limite', async () => {
    app = await construirApp(lerConfig({ NOME_SERVIDOR: 'Turma', LOG: 'false' }));
    const resposta = await app.inject({ method: 'GET', url: '/api/servidor' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ app: 'tofalando', nome: 'Turma', versao: '0.1.0', limiteContas: 20 });
  });

  it('libera CORS para o app (origem null do file://)', async () => {
    app = await construirApp(lerConfig({ LOG: 'false' }));
    const resposta = await app.inject({ method: 'GET', url: '/api/servidor', headers: { origin: 'null' } });
    expect(resposta.headers['access-control-allow-origin']).toBe('null');
  });
});

describe('GET /api/saude', () => {
  it('responde ok', async () => {
    app = await construirApp(lerConfig({ LOG: 'false' }));
    const resposta = await app.inject({ method: 'GET', url: '/api/saude' });
    expect(resposta.json()).toEqual({ ok: true });
  });
});

describe('lerConfig', () => {
  it('recusa números inválidos', () => {
    expect(() => lerConfig({ LIMITE_CONTAS: '0' })).toThrow('LIMITE_CONTAS');
    expect(() => lerConfig({ PORTA: 'abc' })).toThrow('PORTA');
    expect(() => lerConfig({ PORTA: '0' })).toThrow('PORTA');
    expect(() => lerConfig({ PORTA: '65536' })).toThrow('PORTA');
  });

  it('usa os padrões', () => {
    expect(lerConfig({})).toMatchObject({ porta: 3000, host: '0.0.0.0', nomeServidor: 'Tô Falando', limiteContas: 20 });
  });
});
