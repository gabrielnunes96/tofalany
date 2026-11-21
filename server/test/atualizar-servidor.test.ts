import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appTeste, cadastrar } from './apoio.js';
import { criarCanal } from '../src/dominio/canais.js';

let app: FastifyInstance | undefined;
let pasta: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (pasta) rmSync(pasta, { recursive: true, force: true });
  pasta = undefined;
});

const LIVEKIT = { LIVEKIT_URL: 'wss://tofalany.duckdns.org', LIVEKIT_API_KEY: 'chave-teste', LIVEKIT_API_SECRET: 'segredo-de-teste-com-tamanho-suficiente' };

describe('"Atualizar o servidor agora" (infra-e-atualizacao, RF-5, T-7)', () => {
  it('CA-5/CA-6: só o administrador da instalação; cria o pedido vazio; espera de 5 min; auditoria', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'tofalando-pedidos-'));
    app = await appTeste({ PEDIDOS: pasta });
    const dono = (await cadastrar(app, 'dono')).json() as { token: string };
    const ana = (await cadastrar(app, 'ana')).json() as { token: string };
    const pedir = (token: string, url = '/api/admin/servidor/atualizar') => app!.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` } });

    expect((await pedir(ana.token)).statusCode).toBe(403);
    expect(existsSync(join(pasta, 'atualizar'))).toBe(false);

    const r = await pedir(dono.token);
    expect(r.statusCode).toBe(202);
    const pedido = join(pasta, 'atualizar');
    expect(readFileSync(pedido, 'utf8')).toBe('');
    expect(statSync(pedido).isFile()).toBe(true);

    // Dentro de 5 minutos: 429, sem regravar.
    const de_novo = await pedir(dono.token);
    expect(de_novo.statusCode).toBe(429);

    const auditoria = app.banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo = 'atualizacao_pedida'").get() as { n: number };
    expect(auditoria.n).toBe(1);
  });

  it('CA-6: o administrador de outro servidor (não do principal) é recusado', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'tofalando-pedidos-'));
    app = await appTeste({ PEDIDOS: pasta });
    const dono = (await cadastrar(app, 'dono')).json() as { token: string };
    const auth = { authorization: `Bearer ${dono.token}` };
    await app.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
    expect((await app.inject({ method: 'POST', url: '/c/2/api/admin/servidor/atualizar', headers: auth })).statusCode).toBe(403);
  });

  it('sem a pasta de pedidos configurada (desenvolvimento, Tailscale): 503', async () => {
    app = await appTeste();
    const dono = (await cadastrar(app, 'dono')).json() as { token: string };
    const r = await app.inject({ method: 'POST', url: '/api/admin/servidor/atualizar', headers: { authorization: `Bearer ${dono.token}` } });
    expect(r.statusCode).toBe(503);
  });
});

describe('voz pelo nome por onde a pessoa chegou (infra-e-atualizacao, T-5)', () => {
  const token = async (host: string) => {
    const dono = (await cadastrar(app!, 'dono')).json() as { token: string; usuario: { id: number } };
    const voz = criarCanal(app!.banco, 'voz', 'Papo', dono.usuario.id);
    return app!.inject({ method: 'POST', url: '/api/livekit/token', headers: { authorization: `Bearer ${dono.token}`, host }, payload: { canalVozId: voz.id } });
  };

  it('host na lista DOMINIOS: o endereço da voz é o mesmo host', async () => {
    app = await appTeste({ ...LIVEKIT, DOMINIOS: 'tofalany.duckdns.org, 168-138-133-232.sslip.io' });
    const r = await token('168-138-133-232.sslip.io');
    expect(r.json().url).toBe('wss://168-138-133-232.sslip.io');
  });

  it('host fora da lista: continua LIVEKIT_URL (o cabeçalho não escolhe para onde a voz vai)', async () => {
    app = await appTeste({ ...LIVEKIT, DOMINIOS: 'tofalany.duckdns.org' });
    const r = await token('malicioso.exemplo');
    expect(r.json().url).toBe('wss://tofalany.duckdns.org');
  });
});

describe('trustProxy restrito à rede do Caddy (infra-e-atualizacao, T-12)', () => {
  const tentativas = async (ips: string[]) => {
    const codigos: number[] = [];
    for (const ip of ips)
      codigos.push((await app!.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-for': ip }, payload: { usuario: 'ninguem', senha: 'Senha-forte-1' } })).statusCode);
    return codigos;
  };

  it('quem não está na rede confiável não troca o próprio IP pelo X-Forwarded-For (o limite vale)', async () => {
    app = await appTeste({ ATRAS_DE_PROXY: 'true', TRUST_PROXY: '10.9.9.0/24', TENTATIVAS_POR_MINUTO: '2' });
    expect((await tentativas(['1.1.1.1', '2.2.2.2', '3.3.3.3'])).at(-1)).toBe(429);
  });

  it('sem TRUST_PROXY, continua como antes (redes locais confiáveis)', async () => {
    app = await appTeste({ ATRAS_DE_PROXY: 'true', TENTATIVAS_POR_MINUTO: '2' });
    expect(await tentativas(['1.1.1.1', '2.2.2.2', '3.3.3.3'])).not.toContain(429);
  });
});

