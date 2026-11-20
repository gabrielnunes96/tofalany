import { readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { io as conectar } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { UsuarioDto } from '@tofalando/shared';
import { emFila, processarFundo } from '../src/dominio/fundo.js';
import { appTeste, cadastrar } from './apoio.js';

/** Mini perfil (T2): processamento do fundo enviado e as rotas PUT/DELETE /api/eu/fundo. */
const imagem = (w: number, h: number, formato: 'png' | 'jpeg' = 'png') => {
  const base = sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } });
  return (formato === 'png' ? base.png() : base.jpeg()).toBuffer();
};
/** GIF animado: `quadros` quadros de w×h, juntados como animação. */
const gifAnimado = async (w: number, h: number, quadros: number) => {
  // Quadros alternando de cor: iguais seriam juntados pelo codificador.
  const a = await sharp({ create: { width: w, height: h, channels: 3, background: '#aa3300' } }).png().toBuffer();
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: '#0033aa' } }).png().toBuffer();
  return sharp(Array.from({ length: quadros }, (_, i) => (i % 2 ? a : b)), { join: { animated: true } }).gif({ loop: 0 }).toBuffer();
};

/** PNG com só a assinatura e o IHDR (largura e altura declaradas) e um IDAT truncado. */
function pngSoCabecalho(largura: number, altura: number): Buffer {
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([tam, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(Buffer.alloc(16)))]);
}

function multipartCorpo(dados: Buffer, campo = 'arquivo') {
  const limite = '----fundo' + Math.random().toString(16).slice(2);
  return {
    payload: Buffer.concat([Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="f.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), dados, Buffer.from(`\r\n--${limite}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

describe('processarFundo (T2, T-3, T-4)', () => {
  it('CA-6: 3000×2000 vira até 600×240 webp, sem EXIF; miniatura 300×40', async () => {
    const comExif = await sharp(await imagem(3000, 2000, 'jpeg')).withExif({ IFD0: { Copyright: 'segredo' } }).jpeg().toBuffer();
    const { imagem: saida, miniatura, animado } = await processarFundo(comExif);
    const m = await sharp(saida).metadata();
    expect([m.format, m.width, m.height, animado]).toEqual(['webp', 600, 240, false]);
    expect(m.exif).toBeUndefined();
    const mm = await sharp(miniatura).metadata();
    expect([mm.format, mm.width, mm.height]).toEqual(['webp', 300, 40]);
  });

  it('CA-8: GIF de 2 quadros 500×200 continua animado e não é ampliado', async () => {
    const { imagem: saida, animado } = await processarFundo(await gifAnimado(500, 200, 2));
    const m = await sharp(saida, { animated: true }).metadata();
    expect(animado).toBe(true);
    expect(m.pages).toBe(2);
    expect([m.width, m.pageHeight]).toEqual([500, 200]);
  });

  it('CA-7 e segurança: texto renomeado 415; resolução e animação grandes 413 pelo cabeçalho, antes de decodificar', async () => {
    await expect(processarFundo(Buffer.from('não é imagem'))).rejects.toMatchObject({ status: 415 });
    // PNG que só declara 30000×30000 no cabeçalho (dados truncados): se decodificasse antes de conferir, daria 415.
    await expect(processarFundo(pngSoCabecalho(30000, 30000))).rejects.toMatchObject({ status: 413 });
    await expect(processarFundo(await gifAnimado(100, 100, 151))).rejects.toMatchObject({ status: 413 });
    await expect(processarFundo(await gifAnimado(1000, 1000, 61))).rejects.toMatchObject({ status: 413 });
  }, 60_000);

  it('saída acima do limite dá 413', async () => {
    await expect(processarFundo(await imagem(800, 400), 10)).rejects.toMatchObject({ status: 413 });
  });

  it('a fila roda um processamento por vez', async () => {
    let ativos = 0;
    let maximo = 0;
    const tarefa = () =>
      emFila(async () => {
        ativos++;
        maximo = Math.max(maximo, ativos);
        await new Promise((r) => setTimeout(r, 20));
        ativos--;
      });
    await Promise.all([tarefa(), tarefa(), tarefa()]);
    expect(maximo).toBe(1);
    // Uma tarefa que falha não trava as próximas.
    await expect(emFila(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(emFila(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('rotas do fundo (T2)', () => {
  it('CA-6/CA-7: evento ao vivo com o fundo; envio recusado mantém o anterior; auditoria; tirar leva as cores; campo errado 400', async () => {
    const app = await appTeste();
    try {
      type C = { token: string; usuario: { id: number } };
      const ana = (await cadastrar(app, 'ana')).json() as C;
      const beto = (await cadastrar(app, 'beto')).json() as C;
      await app.listen({ port: 0, host: '127.0.0.1' });
      const s = conectar(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, { auth: { token: beto.token }, transports: ['websocket'], reconnection: false, forceNew: true });
      await new Promise((r) => s.once('ola', r));
      const enviar = async (dados: Buffer, campo?: string) => {
        const { payload, headers } = multipartCorpo(dados, campo);
        return app.inject({ method: 'PUT', url: '/api/eu/fundo', payload, headers: { ...headers, authorization: `Bearer ${ana.token}` } });
      };
      const chegou = new Promise<UsuarioDto>((r) => s.on('usuario:atualizado', (u: UsuarioDto) => u.id === ana.usuario.id && u.fundo?.url && r(u)));
      const u = (await enviar(await imagem(800, 400))).json() as UsuarioDto;
      expect((await chegou).fundo?.url).toBe(u.fundo?.url);
      const banco = (app as unknown as { banco: { prepare(q: string): { get(): unknown } } }).banco;
      expect(banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo = 'perfil_alterado'").get()).toEqual({ n: 1 });
      // Recusados: o fundo anterior continua, servido.
      expect((await enviar(Buffer.from('texto'))).statusCode).toBe(415);
      expect((await enviar(Buffer.alloc(8 * 1024 * 1024 + 1))).statusCode).toBe(413);
      expect((await enviar(await imagem(10, 10), 'outro')).statusCode).toBe(400);
      const eu = (await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${ana.token}` } })).json() as UsuarioDto;
      expect(eu.fundo?.url).toBe(u.fundo?.url);
      expect((await app.inject({ method: 'GET', url: u.fundo!.url! })).statusCode).toBe(200);
      // Tirar leva também as cores.
      await app.inject({ method: 'PATCH', url: '/api/eu', headers: { authorization: `Bearer ${ana.token}` }, payload: { fundoCores: ['#112233'] } });
      const tirado = (await app.inject({ method: 'DELETE', url: '/api/eu/fundo', headers: { authorization: `Bearer ${ana.token}` } })).json() as UsuarioDto;
      expect(tirado.fundo).toBeNull();
      s.close();
    } finally {
      await app.close();
    }
  });

  type Conta = { token: string; usuario: { id: number } };
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it('envia, troca (apaga o anterior), tira; 8 MB + 1 dá 413; o 7º envio em 10 min dá 429', async () => {
    const app = await appTeste();
    try {
      const ana = (await cadastrar(app, 'ana')).json() as Conta;
      const enviar = async (dados: Buffer) => {
        const { payload, headers } = multipartCorpo(dados);
        return app.inject({ method: 'PUT', url: '/api/eu/fundo', payload, headers: { ...headers, ...auth(ana.token) } });
      };
      const pasta = (app as unknown as { armazem: { pasta: string } }).armazem.pasta;
      const contar = () => readdirSync(pasta).length;
      const antes = contar();
      const r1 = await enviar(await imagem(800, 400));
      expect(r1.statusCode).toBe(200);
      const u1 = r1.json() as UsuarioDto;
      expect(u1.fundo?.url).toMatch(/^\/files\/[0-9a-f]{32}\.webp$/);
      expect(u1.fundo?.miniUrl).toMatch(/^\/files\/[0-9a-f]{32}\.webp$/);
      await enviar(await imagem(800, 400));
      await enviar(await imagem(800, 400));
      // Trocar 3 vezes deixa só o fundo e a miniatura atuais.
      expect(contar() - antes).toBe(2);
      expect((await app.inject({ method: 'GET', url: u1.fundo!.url! })).statusCode).toBe(404);
      const tirado = await app.inject({ method: 'DELETE', url: '/api/eu/fundo', headers: auth(ana.token) });
      expect(tirado.json()).toMatchObject({ fundo: null });
      expect(contar()).toBe(antes);
      expect((await enviar(Buffer.alloc(8 * 1024 * 1024 + 1))).statusCode).toBe(413);
      // Já foram 4 envios: o 5º e o 6º passam, o 7º em 10 min é recusado.
      expect((await enviar(await imagem(10, 10))).statusCode).toBe(200);
      expect((await enviar(await imagem(10, 10))).statusCode).toBe(200);
      expect((await enviar(await imagem(10, 10))).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

