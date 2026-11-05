import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor, OlaPayload, SomDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar } from './apoio.js';

let app: FastifyInstance | undefined;
const sockets: Socket<EventosServidor, EventosCliente>[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

/** WAV PCM 8 kHz mono 16 bits com `segundos` de silêncio. */
export function wav(segundos: number): Buffer {
  const taxa = 8000;
  const dados = taxa * 2 * segundos;
  const b = Buffer.alloc(44 + dados);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + dados, 4);
  b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(dados, 40);
  return b;
}

/** multipart com "nome" e/ou "arquivo". */
function formulario(campos: { nome?: string; arquivo?: Buffer; nomeArquivo?: string }) {
  const limite = '----som' + Math.random().toString(16).slice(2);
  const partes: Buffer[] = [];
  if (campos.nome !== undefined) partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="nome"\r\n\r\n${campos.nome}\r\n`));
  if (campos.arquivo) {
    partes.push(
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${campos.nomeArquivo ?? 'som.wav'}"\r\nContent-Type: audio/wav\r\n\r\n`),
      campos.arquivo,
      Buffer.from('\r\n'),
    );
  }
  partes.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json();
  const ana = (await cadastrar(app, 'ana')).json();
  const enviar = (metodo: 'POST' | 'PUT', url: string, token: string, campos: Parameters<typeof formulario>[0]) => {
    const { payload, headers } = formulario(campos);
    return app!.inject({ method: metodo, url, payload, headers: { ...headers, authorization: `Bearer ${token}` } });
  };
  return { dono: dono.token as string, ana: ana.token as string, enviar };
}

describe('soundboard: cadastro pelo administrador (RF-22, RN-11)', () => {
  it('CA-31: 8 s entra e chega para todos; 15 s é recusado; o sexto é recusado', async () => {
    const { dono, ana, enviar } = await preparar();
    await app!.listen({ port: 0, host: '127.0.0.1' });
    const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, {
      auth: { token: ana },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    }) as Socket<EventosServidor, EventosCliente>;
    sockets.push(s);
    const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
    expect(ola.sons).toEqual([]);
    const aviso = new Promise<SomDto[]>((r) => s.once('sons:atualizados', r));

    const r = await enviar('POST', '/api/admin/sons', dono, { nome: 'Grilo', arquivo: wav(8) });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ nome: 'Grilo', duracaoMs: 8000, url: expect.stringMatching(/^\/files\/[0-9a-f]{32}\.wav$/) });
    expect(await aviso).toEqual([r.json()]);

    const longo = await enviar('POST', '/api/admin/sons', dono, { nome: 'Longo', arquivo: wav(15) });
    expect(longo.statusCode).toBe(422);
    expect(longo.json()).toEqual({ erro: 'som_longo', mensagem: 'O som deve ter no máximo 10 segundos.' });

    for (const nome of ['B', 'C', 'D', 'E']) expect((await enviar('POST', '/api/admin/sons', dono, { nome, arquivo: wav(1) })).statusCode).toBe(201);
    const sexto = await enviar('POST', '/api/admin/sons', dono, { nome: 'F', arquivo: wav(1) });
    expect(sexto.statusCode).toBe(409);
    expect(sexto.json()).toMatchObject({ erro: 'limite_sons' });
    expect(readdirSync(app!.armazem.pasta)).toHaveLength(5);
    expect((await app!.inject({ method: 'GET', url: '/api/sons', headers: { authorization: `Bearer ${ana}` } })).json()).toHaveLength(5);
  });

  it('membro: 403 nas rotas de administração (lê a lista normalmente)', async () => {
    const { dono, ana, enviar } = await preparar();
    const som = (await enviar('POST', '/api/admin/sons', dono, { nome: 'Grilo', arquivo: wav(1) })).json() as SomDto;
    expect((await enviar('POST', '/api/admin/sons', ana, { nome: 'X', arquivo: wav(1) })).statusCode).toBe(403);
    expect((await enviar('PUT', `/api/admin/sons/${som.id}`, ana, { nome: 'Y' })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/sons/${som.id}`, headers: { authorization: `Bearer ${ana}` } })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'GET', url: '/api/sons', headers: { authorization: `Bearer ${ana}` } })).json()).toHaveLength(1);
  });

  it('formato pelo conteúdo, nome obrigatório e tamanho máximo de 2 MB', async () => {
    const { dono, enviar } = await preparar();
    expect((await enviar('POST', '/api/admin/sons', dono, { nome: 'Texto', arquivo: Buffer.from('não sou áudio'), nomeArquivo: 'a.mp3' })).json()).toMatchObject({
      erro: 'formato_invalido',
    });
    expect((await enviar('POST', '/api/admin/sons', dono, { nome: '  ', arquivo: wav(1) })).json()).toMatchObject({ erro: 'dados_invalidos' });
    expect((await enviar('POST', '/api/admin/sons', dono, { nome: 'Sem arquivo' })).statusCode).toBe(400);
    expect((await enviar('POST', '/api/admin/sons', dono, { nome: 'Grande', arquivo: Buffer.alloc(2 * 1024 * 1024 + 10, 1) })).statusCode).toBe(413);
    expect((app!.banco.prepare('SELECT COUNT(*) AS n FROM sons').get() as { n: number }).n).toBe(0);
  });

  it('troca nome e arquivo (o antigo sai do disco); remover apaga o arquivo; tudo vai para a auditoria', async () => {
    const { dono, enviar } = await preparar();
    const disco = (s: SomDto) => join(app!.armazem.pasta, s.url.replace('/files/', ''));
    const som = (await enviar('POST', '/api/admin/sons', dono, { nome: 'Grilo', arquivo: wav(2) })).json() as SomDto;
    const renomeado = (await enviar('PUT', `/api/admin/sons/${som.id}`, dono, { nome: 'Grilo 2' })).json() as SomDto;
    expect(renomeado).toMatchObject({ id: som.id, nome: 'Grilo 2', url: som.url });
    const trocado = (await enviar('PUT', `/api/admin/sons/${som.id}`, dono, { arquivo: wav(3) })).json() as SomDto;
    expect(trocado).toMatchObject({ nome: 'Grilo 2', duracaoMs: 3000 });
    expect(trocado.url).not.toBe(som.url);
    expect(existsSync(disco(som))).toBe(false);
    expect((await enviar('PUT', `/api/admin/sons/${som.id}`, dono, { arquivo: wav(12) })).statusCode).toBe(422);
    expect(existsSync(disco(trocado))).toBe(true);
    const antes = readdirSync(app!.armazem.pasta).length;
    expect((await enviar('PUT', '/api/admin/sons/999', dono, { arquivo: wav(1) })).statusCode).toBe(404);
    expect(readdirSync(app!.armazem.pasta)).toHaveLength(antes);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/sons/${som.id}`, headers: { authorization: `Bearer ${dono}` } })).statusCode).toBe(204);
    expect(existsSync(disco(trocado))).toBe(false);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/sons/${som.id}`, headers: { authorization: `Bearer ${dono}` } })).statusCode).toBe(404);
    const tipos = listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('som_'));
    expect(tipos.map((r) => [r.tipo, r.ator?.nome, r.detalhes])).toEqual([
      ['som_removido', 'dono', { som: 'Grilo 2' }],
      ['som_trocado', 'dono', { som: 'Grilo 2' }],
      ['som_trocado', 'dono', { som: 'Grilo 2' }],
      ['som_cadastrado', 'dono', { som: 'Grilo' }],
    ]);
  });

  it('aceita MP3 e OGG de verdade (RN-11), com a extensão do formato real', async () => {
    const { dono, enviar } = await preparar();
    for (const [arq, ext] of [['1s.mp3', 'mp3'], ['1s.ogg', 'ogg']] as const) {
      const r = await enviar('POST', '/api/admin/sons', dono, { nome: arq, arquivo: readFileSync(join(__dirname, 'fixtures', arq)), nomeArquivo: 'qualquer.wav' });
      expect(r.statusCode).toBe(201);
      const som = r.json() as SomDto;
      expect(som.url.endsWith(`.${ext}`)).toBe(true);
      expect(Math.abs(som.duracaoMs - 1000)).toBeLessThan(150);
    }
  });
});
