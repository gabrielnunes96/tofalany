import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { PaginaAuditoria, TipoAuditoria } from '@tofalando/shared';
import { construirApp } from '../src/app.js';
import { lerConfig } from '../src/config.js';
import { abrirBanco } from '../src/db/banco.js';
import { limparAuditoria, listarAuditoria, registrarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar, CONVITE } from './apoio.js';

let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
const pastas: string[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function subir(extra: Record<string, string> = {}) {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '150', ...extra });
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

function abrir(url: string, token: string): Promise<Socket> {
  const s = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  return new Promise((r) => s.once('ola', () => r(s)));
}

async function consultar(a: FastifyInstance, token: string, query = ''): Promise<PaginaAuditoria> {
  const r = await a.inject({ method: 'GET', url: `/api/admin/auditoria${query}`, headers: { authorization: `Bearer ${token}` } });
  expect(r.statusCode).toBe(200);
  return r.json();
}

const tipos = (p: PaginaAuditoria) => p.registros.map((r) => `${r.ator?.nome ?? 'host'}:${r.tipo}`);

describe('auditoria — entrada e saída (CA-48)', () => {
  it('registra cadastro, login, online, offline e saída, do mais recente para o mais antigo', async () => {
    const url = await subir();
    const admin = (await cadastrar(app!, 'dono')).json().token;
    const { token: tokenAna } = (await cadastrar(app!, 'ana')).json();
    const login = (await app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } })).json();
    const s = await abrir(url, login.token);
    s.close();
    await esperar(400);
    await app!.inject({ method: 'POST', url: '/api/auth/sair', headers: { authorization: `Bearer ${tokenAna}` } });

    const pagina = await consultar(app!, admin, `?pessoa=${login.usuario.id}`);
    expect(tipos(pagina)).toEqual(['ana:saiu', 'ana:offline', 'ana:online', 'ana:login', 'ana:conta_criada']);
    expect(pagina.registros[0]!.quando).toBeGreaterThan(Date.now() - 10_000);
  });
});

describe('auditoria — quedas curtas (CA-55, RN-24)', () => {
  it('reconexão dentro da carência não registra offline/online; ficar fora registra', async () => {
    const url = await subir({ CARENCIA_OFFLINE_MS: '300' });
    const { token, usuario } = (await cadastrar(app!, 'ana')).json();
    const primeira = await abrir(url, token);
    primeira.close();
    await esperar(100);
    const segunda = await abrir(url, token);
    await esperar(400);
    expect(tipos(listarAuditoria(app!.banco, { pessoa: usuario.id }))).toEqual(['ana:online', 'ana:conta_criada']);

    segunda.close();
    await esperar(500);
    expect(tipos(listarAuditoria(app!.banco, { pessoa: usuario.id }))[0]).toBe('ana:offline');
  });

  it('duas conexões da mesma pessoa: offline só quando a última cai', async () => {
    const url = await subir();
    const { token, usuario } = (await cadastrar(app!, 'ana')).json();
    const a = await abrir(url, token);
    const b = await abrir(url, token);
    a.close();
    await esperar(300);
    expect(tipos(listarAuditoria(app!.banco, { pessoa: usuario.id }))[0]).toBe('ana:online');
    b.close();
    await esperar(300);
    expect(tipos(listarAuditoria(app!.banco, { pessoa: usuario.id }))[0]).toBe('ana:offline');
  });

  it('servidor parando registra offline de quem estava conectado; parada brusca é fechada ao subir', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalando-aud-'));
    pastas.push(pasta);
    const banco = join(pasta, 't.db');
    const config = lerConfig({ LOG: 'false', BANCO: banco, CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' });
    app = await construirApp(config);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const { token } = (await cadastrar(app, 'ana')).json();
    await abrir(url, token);
    await app.close();
    app = undefined;
    let b = abrirBanco(banco);
    const parou = listarAuditoria(b).registros[0]!;
    expect(parou).toMatchObject({ tipo: 'offline', detalhes: { motivo: 'servidor_parou' } });

    // Simula queda brusca: um "online" sem "offline".
    registrarAuditoria(b, { tipo: 'online', atorId: parou.ator!.id });
    b.close();
    app = await construirApp(config);
    expect(listarAuditoria(app.banco).registros[0]).toMatchObject({ tipo: 'offline', detalhes: { motivo: 'servidor_reiniciado' } });
    await app.close();
    app = undefined;
    b = abrirBanco(banco);
    b.close();
  });
});

describe('auditoria — permissão (CA-52, RN-22)', () => {
  it('membro e sem sessão são recusados', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const membro = (await cadastrar(app, 'ana')).json().token;
    const r = await app.inject({ method: 'GET', url: '/api/admin/auditoria', headers: { authorization: `Bearer ${membro}` } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'sem_permissao', mensagem: 'Seu cargo não permite fazer isso.' });
    expect((await app.inject({ method: 'GET', url: '/api/admin/auditoria' })).statusCode).toBe(401);
  });

  it('filtro inválido dá 400', async () => {
    app = await appTeste();
    const admin = (await cadastrar(app, 'dono')).json().token;
    const r = await app.inject({ method: 'GET', url: '/api/admin/auditoria?tipo=inventado', headers: { authorization: `Bearer ${admin}` } });
    expect(r.statusCode).toBe(400);
  });
});

describe('auditoria — retenção (CA-53, RN-23)', () => {
  it('ao subir, o servidor já apaga o que passou do prazo', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalando-aud-'));
    pastas.push(pasta);
    const arquivo = join(pasta, 't.db');
    const b = abrirBanco(arquivo);
    const dia = 86_400_000;
    registrarAuditoria(b, { tipo: 'login', atorId: null }, Date.now() - 31 * dia);
    registrarAuditoria(b, { tipo: 'saiu', atorId: null }, Date.now() - 29 * dia);
    b.close();
    app = await construirApp(lerConfig({ LOG: 'false', BANCO: arquivo, CODIGO_CONVITE: CONVITE, AUDITORIA_DIAS: '30' }));
    expect(listarAuditoria(app.banco).registros.map((r) => r.tipo)).toEqual(['saiu']);
  });

  it('apaga só o que passou do prazo', async () => {
    app = await appTeste({ AUDITORIA_DIAS: '30' });
    const agora = Date.now();
    const dia = 86_400_000;
    registrarAuditoria(app.banco, { tipo: 'login', atorId: null }, agora - 31 * dia);
    registrarAuditoria(app.banco, { tipo: 'login', atorId: null }, agora - 29 * dia);
    expect(limparAuditoria(app.banco, 30, agora)).toBe(1);
    const restantes = listarAuditoria(app.banco).registros;
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.quando).toBe(agora - 29 * dia);
  });
});

describe('auditoria — filtros e paginação (CA-54)', () => {
  it('combina pessoa, tipo e período e pagina por "antes"', async () => {
    app = await appTeste();
    const admin = (await cadastrar(app, 'dono')).json();
    const ana = (await cadastrar(app, 'ana')).json().usuario.id as number;
    const bia = (await cadastrar(app, 'bia')).json().usuario.id as number;
    const base = Date.UTC(2026, 10, 1);
    const tiposUsados: TipoAuditoria[] = ['login', 'online', 'offline'];
    const inserir = app.banco.transaction(() => {
      for (let i = 0; i < 300; i++) {
        registrarAuditoria(app!.banco, { tipo: tiposUsados[i % 3]!, atorId: i % 2 ? ana : bia }, base + i * 60_000);
      }
    });
    inserir();

    const de = base + 50 * 60_000;
    const ate = base + 149 * 60_000;
    const pagina = await consultar(app, admin.token, `?pessoa=${ana}&tipo=login&de=${de}&ate=${ate}`);
    expect(pagina.registros.every((r) => r.ator?.id === ana && r.tipo === 'login' && r.quando >= de && r.quando <= ate)).toBe(true);
    // i ímpar (ana) e i % 3 == 0 (login) entre 50 e 149: i = 51, 57, …, 147 → 17 registros.
    expect(pagina.registros).toHaveLength(17);

    const todas: number[] = [];
    let antes: number | undefined;
    for (;;) {
      const p = await consultar(app, admin.token, `?limite=100${antes ? `&antes=${antes}` : ''}`);
      todas.push(...p.registros.map((r) => r.id));
      if (p.fim) break;
      antes = p.registros.at(-1)!.id;
    }
    expect(todas.length).toBeGreaterThanOrEqual(300);
    expect(new Set(todas).size).toBe(todas.length);
    expect([...todas].sort((a, b) => b - a)).toEqual(todas);
  });

  it('"pessoa" também casa quando ela é o alvo da ação', async () => {
    app = await appTeste();
    const admin = (await cadastrar(app, 'dono')).json();
    const ana = (await cadastrar(app, 'ana')).json().usuario.id as number;
    registrarAuditoria(app.banco, { tipo: 'cargo_alterado', atorId: admin.usuario.id, alvoUsuarioId: ana, detalhes: { cargo: 'admin' } });
    const pagina = await consultar(app, admin.token, `?pessoa=${ana}`);
    expect(pagina.registros.map((r) => `${r.ator?.nome}:${r.tipo}:${r.alvo?.nome ?? ''}`)).toEqual([
      'dono:cargo_alterado:ana',
      'ana:conta_criada:',
    ]);
    expect(pagina.registros[0]!.detalhes).toEqual({ cargo: 'admin' });
  });

  it('guarda o nome do momento: renomear depois não muda o registro antigo', async () => {
    app = await appTeste();
    const { usuario } = (await cadastrar(app, 'ana')).json();
    app.banco.prepare("UPDATE usuarios SET nome_exibicao = 'Ana Nova' WHERE id = ?").run(usuario.id);
    expect(listarAuditoria(app.banco).registros[0]!.ator).toEqual({ id: usuario.id, nome: 'ana' });
  });
});
