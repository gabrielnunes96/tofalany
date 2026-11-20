import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { OlaPayload, UsuarioDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

/** Mini perfil (T1): "sobre mim", cores do fundo, "membro desde", aviso ao vivo e remoção. */
let app: (FastifyInstance & { banco: { prepare(s: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown } } }) | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
type Conta = { token: string; usuario: { id: number } };
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function abrir(token: string, comunidade?: number) {
  if (!app!.server.listening) await app!.listen({ port: 0, host: '127.0.0.1' });
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token, ...(comunidade ? { comunidade } : {}) }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}

async function preparar() {
  app = (await appTeste()) as typeof app;
  const dono = (await cadastrar(app!, 'dono')).json() as Conta;
  const ana = (await cadastrar(app!, 'ana')).json() as Conta;
  const beto = (await cadastrar(app!, 'beto')).json() as Conta;
  return { dono, ana, beto };
}
const patch = (token: string, payload: object) => app!.inject({ method: 'PATCH', url: '/api/eu', headers: auth(token), payload });

describe('mini perfil no servidor (T1)', () => {
  it('CA-3: sobre mim e degradê vão no DTO e chegam ao vivo; "membro desde" é só a data', async () => {
    const { ana, beto } = await preparar();
    const b = await abrir(beto.token);
    const chegou = new Promise<UsuarioDto>((r) => b.s.on('usuario:atualizado', (u: UsuarioDto) => u.id === ana.usuario.id && r(u)));
    const r = await patch(ana.token, { sobreMim: '  joga de suporte\r\nfala pouco  ', fundoCores: ['#FF0000', '#0000ff'] });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ sobreMim: 'joga de suporte\nfala pouco', fundo: { cores: ['#ff0000', '#0000ff'] } });
    const u = await chegou;
    expect(u.sobreMim).toBe('joga de suporte\nfala pouco');
    expect(u.fundo).toEqual({ cores: ['#ff0000', '#0000ff'] });
    expect(u.membroDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No "ola", a lista de membros traz o "membro desde" e o fundo (null quando não há).
    const doOla = b.ola.usuarios.find((x) => x.id === beto.usuario.id)!;
    expect(doOla.fundo).toBeNull();
    expect(doOla.membroDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('tirar: sobre mim vazio e fundoCores null', async () => {
    const { ana } = await preparar();
    await patch(ana.token, { sobreMim: 'oi', fundoCores: ['#112233'] });
    const r = (await patch(ana.token, { sobreMim: '', fundoCores: null })).json() as UsuarioDto;
    expect(r.sobreMim).toBeUndefined();
    expect(r.fundo).toBeNull();
  });

  it('CA-9 e segurança: limites e caracteres proibidos dão 400; cores inválidas também', async () => {
    const { ana } = await preparar();
    for (const sobreMim of ['a'.repeat(191), 'a\nb\nc\nd', 'link \u202Eevil', 'zero\u200Bwidth', 'x\u2028y', 'x\u061Cy'])
      expect((await patch(ana.token, { sobreMim })).statusCode, JSON.stringify(sobreMim)).toBe(400);
    expect((await patch(ana.token, { sobreMim: 'a'.repeat(190) })).statusCode).toBe(200);
    expect((await patch(ana.token, { sobreMim: 'família 👨‍👩‍👧' })).statusCode).toBe(200);
    for (const fundoCores of [['red'], ['#fff'], ['#000000;background:url(x)'], ['#000000', '#111111', '#222222'], []])
      expect((await patch(ana.token, { fundoCores })).statusCode, JSON.stringify(fundoCores)).toBe(400);
  });

  it('CA-13: o PATCH antigo (só nome e cor) continua igual', async () => {
    const { ana } = await preparar();
    const r = await patch(ana.token, { nomeExibicao: 'Ana B', cor: '#00ff00' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ nomeExibicao: 'Ana B', cor: '#00ff00', fundo: null });
    expect((await patch(ana.token, { cargo: 'admin' })).statusCode).toBe(400);
  });

  it('T-8: amigo de fora do servidor recebe a mudança sem cargo nem "membro desde"', async () => {
    const { dono, ana } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const carlos = (await cadastrar(app!, 'carlos')).json() as Conta;
    // O carlos só está no servidor 2 e é amigo da ana.
    app!.banco.prepare('DELETE FROM membros WHERE usuario_id = ?').run(carlos.usuario.id);
    app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (2, ?, 'membro', ?)").run(carlos.usuario.id, Date.now());
    const [a, b] = [ana.usuario.id, carlos.usuario.id].sort((x, y) => x - y);
    app!.banco.prepare('INSERT INTO amizades (usuario_a, usuario_b, pedido_por, aceita, criado_em) VALUES (?, ?, ?, 1, ?)').run(a, b, a, Date.now());
    const c = await abrir(carlos.token, 2);
    let usuarioAtualizado = 0;
    c.s.on('usuario:atualizado', () => usuarioAtualizado++);
    const chegou = new Promise<UsuarioDto>((r) => c.s.on('conhecido:atualizado', (u: UsuarioDto) => u.id === ana.usuario.id && r(u)));
    await patch(ana.token, { sobreMim: 'oi, carlos' });
    const u = await chegou;
    expect(u).toMatchObject({ sobreMim: 'oi, carlos', cargo: 'membro', funcaoId: null });
    expect(u.membroDesde).toBeUndefined();
    // Fora do servidor, o evento dos membros não chega (apps 0.16 não põem a ana na lista de membros).
    expect(usuarioAtualizado).toBe(0);
  });

  it('CA-13: amigo no mesmo servidor recebe só o evento do servidor, com o cargo real (não vira "membro")', async () => {
    const { dono, beto } = await preparar();
    const [a, b] = [dono.usuario.id, beto.usuario.id].sort((x, y) => x - y);
    app!.banco.prepare('INSERT INTO amizades (usuario_a, usuario_b, pedido_por, aceita, criado_em) VALUES (?, ?, ?, 1, ?)').run(a, b, a, Date.now());
    const bt = await abrir(beto.token);
    const eventos: string[] = [];
    bt.s.on('conhecido:atualizado', () => eventos.push('conhecido'));
    const chegou = new Promise<UsuarioDto>((r) => bt.s.on('usuario:atualizado', (u: UsuarioDto) => u.id === dono.usuario.id && r(u)));
    await patch(dono.token, { sobreMim: 'sou o dono' });
    expect(await chegou).toMatchObject({ cargo: 'admin', sobreMim: 'sou o dono' });
    await new Promise((r) => setTimeout(r, 100));
    expect(eventos).toEqual([]);
    // O "ola" continua com os campos de antes (os novos são opcionais).
    expect(bt.ola.usuarios.find((u) => u.id === dono.usuario.id)).toMatchObject({ cargo: 'admin', funcaoId: null, usuario: 'dono' });
  });

  it('auditoria registra a mudança de perfil sem o conteúdo', async () => {
    const { ana } = await preparar();
    await patch(ana.token, { sobreMim: 'segredo nenhum' });
    const linha = app!.banco.prepare("SELECT detalhes FROM auditoria WHERE tipo = 'perfil_alterado'").get() as { detalhes: string } | undefined;
    expect(linha).toBeTruthy();
    expect(linha!.detalhes).not.toContain('segredo');
  });

  it('remover a conta zera o mini perfil e apaga o fundo do armazém', async () => {
    const { dono, ana } = await preparar();
    await patch(ana.token, { sobreMim: 'oi', fundoCores: ['#112233'] });
    const armazem = (app as unknown as { armazem: { gravar(d: Buffer, e: string): string } }).armazem;
    const fundo = armazem.gravar(Buffer.from('x'), 'webp');
    const mini = armazem.gravar(Buffer.from('y'), 'webp');
    app!.banco.prepare('UPDATE usuarios SET fundo_arquivo = ?, fundo_mini = ? WHERE id = ?').run(fundo, mini, ana.usuario.id);
    expect((await app!.inject({ method: 'GET', url: `/files/${fundo}` })).statusCode).toBe(200);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/usuarios/${ana.usuario.id}`, headers: auth(dono.token) })).statusCode).toBe(204);
    expect(app!.banco.prepare('SELECT sobre_mim, fundo_cores, fundo_arquivo, fundo_mini FROM usuarios WHERE id = ?').get(ana.usuario.id)).toEqual({ sobre_mim: null, fundo_cores: null, fundo_arquivo: null, fundo_mini: null });
    expect((await app!.inject({ method: 'GET', url: `/files/${fundo}` })).statusCode).toBe(404);
    expect((await app!.inject({ method: 'GET', url: `/files/${mini}` })).statusCode).toBe(404);
  });
});

describe('soData', () => {
  it('é o dia no horário de Brasília (22:30 de 12/10 em -03:00 continua 12/10)', async () => {
    const { soData } = await import('../src/dominio/usuarios.js');
    expect(soData(Date.parse('2026-10-12T22:30:00-03:00'))).toBe('2026-10-12');
    expect(soData(Date.parse('2026-10-13T00:30:00-03:00'))).toBe('2026-10-13');
  });
});
