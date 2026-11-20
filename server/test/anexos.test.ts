import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { io as conectar, type Socket } from 'socket.io-client';
import type { AnexoDto, EventosCliente, EventosServidor, MensagemDto, OlaPayload } from '@tofalando/shared';
import { limparOrfaos } from '../src/dominio/anexos.js';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function multipart(dados: Buffer, nome: string, tipo = 'application/octet-stream', campo = 'arquivo') {
  const limite = '----tofalany' + randomBytes(6).toString('hex');
  return {
    payload: Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nome}"\r\nContent-Type: ${tipo}\r\n\r\n`),
      dados,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

async function enviarAnexo(a: FastifyInstance, token: string, dados: Buffer, nome: string, tipo?: string) {
  const { payload, headers } = multipart(dados, nome, tipo);
  return a.inject({ method: 'POST', url: '/api/anexos', payload, headers: { ...headers, authorization: `Bearer ${token}` } });
}

/** PNG de ruído (não comprime): ~2 MB. */
async function pngGrande(): Promise<Buffer> {
  const w = 840;
  const h = 800;
  return sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

async function preparar() {
  app = await appTeste();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const abrir = async (nome: string) => {
    const { token, usuario } = (await cadastrar(app!, nome)).json();
    const s: Cliente = conectar(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    return { s, ola, token: token as string, id: usuario.id as number };
  };
  const dono = await abrir('dono');
  const ana = await abrir('ana');
  return { dono, ana, canal: dono.ola.canais.find((c) => c.tipo === 'texto')!.id };
}

type Resposta = { ok: boolean; valor?: MensagemDto; erro?: string };
const enviar = (s: Cliente, canalId: number, texto: string, anexos: string[]) =>
  new Promise<Resposta>((r) => s.emit('mensagem:enviar', { destino: { canalId }, texto, anexos }, r as never));

describe('anexos (RF-9, RN-19)', () => {
  it('CA-16: PNG de 2 MB vira anexo de imagem com dimensões; servido como imagem', async () => {
    const { ana } = await preparar();
    const png = await pngGrande();
    expect(png.length).toBeGreaterThan(1.9 * 1024 * 1024);
    const r = await enviarAnexo(app!, ana.token, png, 'foto.png', 'image/png');
    expect(r.statusCode).toBe(201);
    const anexo = r.json() as AnexoDto;
    expect(anexo).toMatchObject({ tipo: 'imagem', nome: 'foto.png', largura: 840, altura: 800 });
    const arquivo = await app!.inject({ method: 'GET', url: anexo.url });
    expect(arquivo.headers['content-type']).toBe('image/png');
    expect(arquivo.headers['content-disposition']).toBeUndefined();
  });

  it('imagem regravada sem EXIF (localização some); GIF animado continua animado', async () => {
    const { ana } = await preparar();
    const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ff0000' } })
      .jpeg()
      .withExifMerge({ IFD0: { Copyright: 'segredo-exif', Make: 'Celular' } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const anexo = (await enviarAnexo(app!, ana.token, jpeg, 'f.jpg')).json() as AnexoDto;
    const servido = (await app!.inject({ method: 'GET', url: anexo.url })).rawPayload;
    expect((await sharp(servido).metadata()).exif).toBeUndefined();
    expect(servido.toString('latin1')).not.toContain('segredo-exif');

    const quadro = (cor: string) => sharp({ create: { width: 20, height: 20, channels: 3, background: cor } }).png().toBuffer();
    const gif = await sharp([await quadro('#ff0000'), await quadro('#00ff00')], { join: { animated: true } }).gif().toBuffer();
    const anexoGif = (await enviarAnexo(app!, ana.token, gif, 'anim.gif')).json() as AnexoDto;
    const servidoGif = (await app!.inject({ method: 'GET', url: anexoGif.url })).rawPayload;
    expect((await sharp(servidoGif).metadata()).pages).toBe(2);
  });

  it('CA-16a: PDF de 5 MB e ZIP de 20 MB viram documento; o download é idêntico e como anexo', async () => {
    const { ana } = await preparar();
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(5 * 1024 * 1024)]);
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(20 * 1024 * 1024)]);
    for (const [dados, nome] of [
      [pdf, 'relatório final.pdf'],
      [zip, 'fotos.zip'],
    ] as const) {
      const r = await enviarAnexo(app!, ana.token, dados, nome);
      expect(r.statusCode).toBe(201);
      const anexo = r.json() as AnexoDto;
      expect(anexo).toMatchObject({ tipo: 'documento', nome, bytes: dados.length, largura: null });
      const baixado = await app!.inject({ method: 'GET', url: anexo.url });
      expect(baixado.headers['content-disposition']).toBe('attachment');
      expect(hash(baixado.rawPayload)).toBe(hash(dados));
    }
  });

  it('CA-16b: 30 MB é recusado (413); .exe renomeado para .pdf é recusado (415)', async () => {
    const { ana } = await preparar();
    const grande = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(30 * 1024 * 1024)]);
    const r1 = await enviarAnexo(app!, ana.token, grande, 'grande.pdf');
    expect(r1.statusCode).toBe(413);
    expect(r1.json()).toMatchObject({ erro: 'arquivo_grande' });
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00'), randomBytes(2000)]);
    const r2 = await enviarAnexo(app!, ana.token, exe, 'documento.pdf', 'application/pdf');
    expect(r2.statusCode).toBe(415);
    expect(r2.json()).toMatchObject({ erro: 'formato_invalido' });
    expect((app!.banco.prepare('SELECT COUNT(*) AS n FROM anexos').get() as { n: number }).n).toBe(0);
  });

  it('a extensão do nome é sempre a do formato conferido (script disfarçado nunca fica .bat)', async () => {
    const { ana } = await preparar();
    const disfarce = Buffer.from('%PDF-1.7\r\ncalc.exe\r\n');
    const nome = async (dados: Buffer, n: string) => ((await enviarAnexo(app!, ana.token, dados, n)).json() as AnexoDto).nome;
    expect(await nome(disfarce, 'x.bat')).toBe('x.pdf');
    expect(await nome(disfarce, 'semextensao')).toBe('semextensao.pdf');
    expect(await nome(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'parece.pdf')).toBe('parece.zip');
    const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000000' } }).jpeg().toBuffer();
    expect(await nome(jpeg, 'foto.jpeg')).toBe('foto.jpeg');
    expect(await nome(jpeg, 'foto.png')).toBe('foto.jpg');
    const anexo = (await enviarAnexo(app!, ana.token, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'parece.pdf')).json() as AnexoDto;
    expect(anexo.url).toMatch(/\.zip$/);
  });

  it('animação com quadros demais é recusada', async () => {
    const { ana } = await preparar();
    // Quadros alternados: o codificador junta quadros iguais.
    const q = (cor: string) => sharp({ create: { width: 2, height: 2, channels: 3, background: cor } }).png().toBuffer();
    const [a, b] = [await q('#ff0000'), await q('#00ff00')];
    const gif = await sharp(Array.from({ length: 600 }, (_, i) => (i % 2 ? a : b)), { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif).metadata()).pages).toBe(600);
    const r = await enviarAnexo(app!, ana.token, gif, 'longo.gif');
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ erro: 'arquivo_grande', mensagem: 'A animação é grande demais.' });
  });

  it('nome do arquivo é saneado; exige sessão e o campo certo', async () => {
    const { ana } = await preparar();
    const pdf = Buffer.from('%PDF-1.7\nx');
    expect(((await enviarAnexo(app!, ana.token, pdf, '../../etc/<x>.pdf')).json() as AnexoDto).nome).toBe('x.pdf');
    const { payload, headers } = multipart(pdf, 'a.pdf');
    expect((await app!.inject({ method: 'POST', url: '/api/anexos', payload, headers })).statusCode).toBe(401);
    const errado = multipart(pdf, 'a.pdf', 'application/pdf', 'outro');
    expect(
      (await app!.inject({ method: 'POST', url: '/api/anexos', payload: errado.payload, headers: { ...errado.headers, authorization: `Bearer ${ana.token}` } }))
        .statusCode,
    ).toBe(400);
  });
});

describe('mensagem com anexos', () => {
  it('envia com anexos (texto pode ser vazio); todos recebem; histórico traz os anexos', async () => {
    const { dono, ana, canal } = await preparar();
    const anexo = (await enviarAnexo(app!, ana.token, Buffer.from('%PDF-1.7\nx'), 'a.pdf')).json() as AnexoDto;
    const noDono = new Promise<MensagemDto>((r) => dono.s.once('mensagem:nova', r));
    const r = await enviar(ana.s, canal, '   ', [anexo.id]);
    expect(r).toMatchObject({ ok: true, valor: { texto: '', anexos: [anexo] } });
    expect((await noDono).anexos).toEqual([anexo]);
    const historico = await app!.inject({ method: 'GET', url: `/api/canais/${canal}/mensagens`, headers: { authorization: `Bearer ${dono.token}` } });
    expect(historico.json().mensagens[0].anexos).toEqual([anexo]);
  });

  it('não usa anexo de outra pessoa nem reaproveita; sem texto e sem anexo continua recusado', async () => {
    const { dono, ana, canal } = await preparar();
    const anexo = (await enviarAnexo(app!, ana.token, Buffer.from('%PDF-1.7\nx'), 'a.pdf')).json() as AnexoDto;
    expect(await enviar(dono.s, canal, 'roubando', [anexo.id])).toEqual({ ok: false, erro: 'Anexo inválido ou já usado.' });
    expect((await enviar(ana.s, canal, 'primeira', [anexo.id])).ok).toBe(true);
    expect(await enviar(ana.s, canal, 'de novo', [anexo.id])).toEqual({ ok: false, erro: 'Anexo inválido ou já usado.' });
    expect(await enviar(ana.s, canal, '', [])).toEqual({ ok: false, erro: 'A mensagem está vazia.' });
    expect(await enviar(ana.s, canal, 'x', ['nao-e-id'])).toMatchObject({ ok: false });
    // A mensagem recusada não ficou criada pela metade.
    expect((app!.banco.prepare("SELECT COUNT(*) AS n FROM mensagens WHERE texto = 'roubando'").get() as { n: number }).n).toBe(0);
  });

  it('apagar a mensagem e remover o canal apagam os arquivos do disco', async () => {
    const { dono, ana, canal } = await preparar();
    const arquivo = (a: AnexoDto) => join(app!.armazem.pasta, a.url.replace('/files/', ''));
    const a1 = (await enviarAnexo(app!, ana.token, Buffer.from('%PDF-1.7\n1'), '1.pdf')).json() as AnexoDto;
    const m1 = (await enviar(ana.s, canal, 'um', [a1.id])).valor!;
    expect(existsSync(arquivo(a1))).toBe(true);
    await new Promise((r) => ana.s.emit('mensagem:apagar', { id: m1.id }, r as never));
    expect(existsSync(arquivo(a1))).toBe(false);

    const a2 = (await enviarAnexo(app!, ana.token, Buffer.from('%PDF-1.7\n2'), '2.pdf')).json() as AnexoDto;
    await enviar(ana.s, canal, 'dois', [a2.id]);
    await new Promise((r) => dono.s.emit('canal:remover', { id: canal }, r as never));
    expect(existsSync(arquivo(a2))).toBe(false);
    expect((app!.banco.prepare('SELECT COUNT(*) AS n FROM anexos').get() as { n: number }).n).toBe(0);
  });

  it('anexo nunca usado há mais de 1 h é apagado (banco e disco)', async () => {
    const { ana } = await preparar();
    const a = (await enviarAnexo(app!, ana.token, Buffer.from('%PDF-1.7\nx'), 'a.pdf')).json() as AnexoDto;
    const caminho = join(app!.armazem.pasta, a.url.replace('/files/', ''));
    expect(limparOrfaos(app!.banco, app!.armazem, 60 * 60 * 1000)).toBe(0);
    expect(limparOrfaos(app!.banco, app!.armazem, 60 * 60 * 1000, Date.now() + 61 * 60 * 1000)).toBe(1);
    expect(existsSync(caminho)).toBe(false);
  });
});
