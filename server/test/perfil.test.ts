import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { io as conectar, type Socket } from 'socket.io-client';
import type { UsuarioDto } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';

let app: FastifyInstance | undefined;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const png = (largura: number, altura: number) =>
  sharp({ create: { width: largura, height: altura, channels: 3, background: '#3366ff' } })
    .png()
    .toBuffer();

/** Corpo multipart/form-data com um arquivo no campo "arquivo". */
function multipart(dados: Buffer, nome = 'imagem.png', tipo = 'image/png') {
  const limite = '----tofalando' + Math.random().toString(16).slice(2);
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    dados,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: corpo, headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

async function enviarAvatar(a: FastifyInstance, token: string, dados: Buffer, nome?: string, tipo?: string) {
  const { payload, headers } = multipart(dados, nome, tipo);
  return a.inject({ method: 'PUT', url: '/api/eu/avatar', payload, headers: { ...headers, authorization: `Bearer ${token}` } });
}

describe('avatar (CA-8, RN-15)', () => {
  it('1000×800 vira 256×256 sem metadados; outro membro recebe usuario:atualizado; o anterior é apagado', async () => {
    app = await appTeste();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const { token, usuario } = (await cadastrar(app, 'ana')).json();
    const outro = (await cadastrar(app, 'bia')).json().token;
    const s = conectar(url, { auth: { token: outro }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise((r) => s.once('ola', r));
    const atualizado = new Promise<UsuarioDto>((r) => s.once('usuario:atualizado', r));

    const r = await enviarAvatar(app, token, await png(1000, 800));
    expect(r.statusCode).toBe(200);
    const { avatarUrl } = r.json();
    expect(avatarUrl).toMatch(/^\/files\/[0-9a-f]{32}\.webp$/);
    expect(await atualizado).toMatchObject({ id: usuario.id, avatarUrl });

    const arquivo = await app.inject({ method: 'GET', url: avatarUrl });
    expect(arquivo.statusCode).toBe(200);
    expect(arquivo.headers['content-type']).toBe('image/webp');
    const meta = await sharp(arquivo.rawPayload).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([256, 256, 'webp']);
    expect(meta.exif).toBeUndefined();

    const segundo = (await enviarAvatar(app, token, await png(300, 300))).json().avatarUrl;
    expect(segundo).not.toBe(avatarUrl);
    expect((await app.inject({ method: 'GET', url: avatarUrl })).statusCode).toBe(404);
  });

  it('acima de 8 MB dá 413; PDF dá 415; nada é gravado', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const grande = await enviarAvatar(app, token, Buffer.alloc(8 * 1024 * 1024 + 10, 1));
    expect(grande.statusCode).toBe(413);
    expect(grande.json()).toMatchObject({ erro: 'arquivo_grande' });
    const pdf = await enviarAvatar(app, token, Buffer.from('%PDF-1.7\n...'), 'x.pdf', 'application/pdf');
    expect(pdf.statusCode).toBe(415);
    expect(pdf.json()).toMatchObject({ erro: 'formato_invalido' });
    // PNG renomeado com tipo falso também é conferido pelo conteúdo (e aceito, por ser imagem de verdade).
    expect((await enviarAvatar(app, token, await png(10, 10), 'x.pdf', 'application/pdf')).statusCode).toBe(200);
    const eu = (await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${token}` } })).json();
    expect(eu.avatarUrl).toMatch(/\.webp$/);
  });

  it('resolução acima de 4096×4096 é recusada antes de decodificar (bomba de descompressão)', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const bomba = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#000000' } }).png().toBuffer();
    expect(bomba.length).toBeLessThan(1024 * 1024);
    const r = await enviarAvatar(app, token, bomba);
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ erro: 'arquivo_grande' });
  });

  it('arquivo em outro campo que não "arquivo" é recusado', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const { payload, headers } = multipart(await png(10, 10));
    const errado = Buffer.from(payload.toString('latin1').replace('name="arquivo"', 'name="foto"'), 'latin1');
    const r = await app.inject({ method: 'PUT', url: '/api/eu/avatar', payload: errado, headers: { ...headers, authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(400);
  });

  it('exige sessão e o campo do arquivo', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const { payload, headers } = multipart(await png(10, 10));
    expect((await app.inject({ method: 'PUT', url: '/api/eu/avatar', payload, headers })).statusCode).toBe(401);
    const vazio = await app.inject({ method: 'PUT', url: '/api/eu/avatar', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, payload: '{}' });
    expect(vazio.statusCode).toBe(400);
  });
});

describe('PATCH /api/eu (RF-5)', () => {
  it('troca nome de exibição e cor; valida', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const auth = { authorization: `Bearer ${token}` };
    const ok = await app.inject({ method: 'PATCH', url: '/api/eu', headers: auth, payload: { nomeExibicao: '  Ana  Paula ', cor: '#FF8800' } });
    expect(ok.json()).toMatchObject({ usuario: 'ana', nomeExibicao: 'Ana Paula', cor: '#ff8800' });
    expect((await app.inject({ method: 'PATCH', url: '/api/eu', headers: auth, payload: { cor: 'azul' } })).json()).toMatchObject({ erro: 'dados_invalidos' });
    expect((await app.inject({ method: 'PATCH', url: '/api/eu', headers: auth, payload: { nomeExibicao: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/eu', headers: auth, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/eu', headers: auth, payload: { cargo: 'admin' } })).statusCode).toBe(400);
  });
});

describe('GET /files/:id', () => {
  it('recusa ids fora do padrão (sem caminhos) e inexistentes', async () => {
    app = await appTeste();
    expect((await app.inject({ method: 'GET', url: '/files/..%2F..%2Fetc%2Fpasswd' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/files/${'a'.repeat(32)}.webp` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/files/${'a'.repeat(32)}.exe` })).statusCode).toBe(404);
  });

  it('banco em memória usa pasta temporária apagada ao fechar', async () => {
    app = await appTeste();
    const pasta = app.armazem.pasta;
    expect(existsSync(pasta)).toBe(true);
    await app.close();
    app = undefined;
    expect(existsSync(pasta)).toBe(false);
  });
});
