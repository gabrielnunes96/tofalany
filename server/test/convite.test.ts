import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import { lerLinkConvite, type OlaPayload } from '@tofalando/shared';
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

function pastaDownloads(arquivos: string[]): string {
  const p = mkdtempSync(join(tmpdir(), 'tofalando-dl-'));
  pastas.push(p);
  for (const a of arquivos) writeFileSync(join(p, a), `conteudo de ${a}`);
  return p;
}

describe('página do convite (RF-1a, CA-1a)', () => {
  it('mostra os downloads, o botão que abre o app e os dados para digitar', async () => {
    const pasta = pastaDownloads(['ToFalany-0.1.0.exe', 'ToFalany-0.1.0.AppImage', 'tofalany_0.1.0_amd64.deb', 'leiame.txt']);
    app = await appTeste({ NOME_SERVIDOR: 'Turma', URL_PUBLICA: 'https://fala.exemplo.com', DOWNLOADS: pasta });
    const r = await app.inject({ method: 'GET', url: `/convite/${CONVITE}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    const html = r.body;
    expect(html).toContain('Você foi convidado para Turma');
    expect(html).toContain('href="/downloads/ToFalany-0.1.0.exe"');
    expect(html).toContain('href="/downloads/ToFalany-0.1.0.AppImage"');
    expect(html).toContain('href="/downloads/tofalany_0.1.0_amd64.deb"');
    expect(html).not.toContain('leiame.txt');
    const href = /href="(tofalany:[^"]+)"/.exec(html)![1]!.replaceAll('&amp;', '&');
    expect(lerLinkConvite(href)).toEqual({ servidor: 'https://fala.exemplo.com', codigo: CONVITE });
    expect(html).toContain('<code>https://fala.exemplo.com</code>');
  });

  it('sem instaladores, orienta a pedir para quem convidou; código errado dá 404', async () => {
    app = await appTeste();
    expect((await app.inject({ method: 'GET', url: `/convite/${CONVITE}` })).body).toContain('Peça o instalador');
    const errado = await app.inject({ method: 'GET', url: '/convite/outro-codigo' });
    expect(errado.statusCode).toBe(404);
    expect(errado.body).toContain('Convite inválido');
    expect(errado.body).not.toContain('tofalany:');
  });

  it('nome do servidor é escapado na página', async () => {
    app = await appTeste({ NOME_SERVIDOR: '<script>x</script>' });
    const html = (await app.inject({ method: 'GET', url: `/convite/${CONVITE}` })).body;
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('página do convite — força bruta', () => {
  it('limita tentativas por IP como o cadastro', async () => {
    app = await appTeste({ TENTATIVAS_POR_MINUTO: '3' });
    for (let i = 0; i < 3; i++) expect((await app.inject({ method: 'GET', url: `/convite/chute-${i}xx` })).statusCode).toBe(404);
    const bloqueado = await app.inject({ method: 'GET', url: `/convite/${CONVITE}` });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.body).toContain('Muitas tentativas');
    expect(bloqueado.body).not.toContain('tofalany:');
  });
});

describe('/downloads', () => {
  it('serve só instaladores da pasta, como anexo', async () => {
    const pasta = pastaDownloads(['ToFalany-0.1.0.exe', 'segredo.db']);
    app = await appTeste({ DOWNLOADS: pasta });
    const ok = await app.inject({ method: 'GET', url: '/downloads/ToFalany-0.1.0.exe' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-disposition']).toBe('attachment; filename="ToFalany-0.1.0.exe"');
    expect(ok.body).toBe('conteudo de ToFalany-0.1.0.exe');
    expect((await app.inject({ method: 'GET', url: '/downloads/segredo.db' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/downloads/..%2Fsegredo.exe' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/downloads/nao-existe.exe' })).statusCode).toBe(404);
    mkdirSync(join(pasta, 'pasta.exe'));
    expect((await app.inject({ method: 'GET', url: '/downloads/pasta.exe' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/convite/${CONVITE}` })).body).not.toContain('pasta.exe');
  });
});

describe('link de convite no tempo real', () => {
  it('com URL_PUBLICA (produção), o link usa ela, não o host da conexão', async () => {
    app = await appTeste({ URL_PUBLICA: 'https://fala.exemplo.com' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const porta = (app.server.address() as AddressInfo).port;
    const membro = (await cadastrar(app, 'ana')).json().token;
    const s = conectar(`http://127.0.0.1:${porta}`, { auth: { token: membro }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    expect(ola.convite.link).toBe(`https://fala.exemplo.com/convite/${CONVITE}`);
  });

  it('ola traz o link para qualquer membro; troca do código avisa todos', async () => {
    app = await appTeste();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const porta = (app.server.address() as AddressInfo).port;
    const dono = (await cadastrar(app, 'dono')).json().token;
    const membro = (await cadastrar(app, 'ana')).json().token;
    const s = conectar(`http://127.0.0.1:${porta}`, { auth: { token: membro }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    expect(ola.convite).toEqual({ link: `http://127.0.0.1:${porta}/convite/${CONVITE}` });
    const atualizado = new Promise<{ link: string }>((r) => s.once('convite:atualizado', r));
    await app.inject({ method: 'PUT', url: '/api/admin/convite', headers: { authorization: `Bearer ${dono}` }, payload: { codigo: 'novo-codigo' } });
    expect(await atualizado).toEqual({ link: `http://127.0.0.1:${porta}/convite/novo-codigo` });
  });
});
