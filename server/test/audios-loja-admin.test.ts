import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AUDIOS_LOJA_MAX, type AudioLojaAdminDto, type AudioLojaDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar } from './apoio.js';
import { wav } from './audio-teste.js';

/** audios-na-loja, T2: cadastro, alteração e retirada pelo administrador da instalação (CA-1, CA-2, CA-12, CA-15; A8, A10–A12). */
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function formulario(campos: { nome?: string; raridade?: string; arquivo?: Buffer; nomeArquivo?: string }) {
  const limite = '----audio' + Math.random().toString(16).slice(2);
  const partes: Buffer[] = [];
  for (const k of ['nome', 'raridade'] as const) {
    if (campos[k] !== undefined) partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${campos[k]}\r\n`));
  }
  if (campos.arquivo) {
    partes.push(
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${campos.nomeArquivo ?? 'a.wav'}"\r\nContent-Type: audio/wav\r\n\r\n`),
      campos.arquivo,
      Buffer.from('\r\n'),
    );
  }
  partes.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const enviar = (token: string, campos: Parameters<typeof formulario>[0], base = '') => {
    const { payload, headers } = formulario(campos);
    return app!.inject({ method: 'POST', url: `${base}/api/admin/loja/audios`, payload, headers: { ...headers, ...auth(token) } });
  };
  return { dono, ana, auth, enviar };
}

describe('áudios da loja: administração', () => {
  it('CA-1/A8: só o administrador da instalação, pelo principal; membro, quem gerencia sons e admin de outro servidor não', async () => {
    const { dono, ana, auth, enviar } = await preparar();
    expect((await enviar(ana.token, { nome: 'X', raridade: 'raro', arquivo: wav(1) })).statusCode).toBe(403);
    // Ana com "Gerenciar sons" no principal continua sem poder.
    const cargo = (await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono.token), payload: { nome: 'Som', cor: '#ff8800', permissoes: ['gerenciar_sons'] } })).json() as { id: number };
    await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${ana.usuario.id}/funcao`, headers: auth(dono.token), payload: { funcaoId: cargo.id } });
    expect((await enviar(ana.token, { nome: 'X', raridade: 'raro', arquivo: wav(1) })).statusCode).toBe(403);
    // Admin de outro servidor (e o próprio dono pedindo por outro servidor) não.
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (2, ?, 'admin', 0)").run(ana.usuario.id);
    expect((await enviar(ana.token, { nome: 'X', raridade: 'raro', arquivo: wav(1) }, '/c/2')).statusCode).toBe(403);
    expect((await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: wav(1) }, '/c/2')).statusCode).toBe(403);
    expect((await app!.inject({ method: 'GET', url: '/api/admin/loja/audios', headers: auth(ana.token) })).statusCode).toBe(403);
    const ok = await enviar(dono.token, { nome: 'Trovão', raridade: 'raro', arquivo: wav(2) });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ nome: 'Trovão', raridade: 'raro', duracaoMs: 2000, url: expect.stringMatching(/^\/files\/[0-9a-f]{32}\.wav$/) });
  });

  it('CA-2/A9–A11: não-áudio, longo, grande, sem raridade e nome com marca de direção são recusados; o nome do arquivo não vale', async () => {
    const { dono, enviar } = await preparar();
    expect((await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: Buffer.from('<html>oi</html>'), nomeArquivo: 'x.mp3' })).statusCode).toBe(415);
    expect((await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: wav(15) })).statusCode).toBe(422);
    expect((await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: Buffer.alloc(2 * 1024 * 1024 + 1) })).statusCode).toBe(413);
    expect((await enviar(dono.token, { nome: 'X', raridade: 'mitico', arquivo: wav(1) })).statusCode).toBe(400);
    expect((await enviar(dono.token, { nome: 'a‮b', raridade: 'raro', arquivo: wav(1) })).statusCode).toBe(400);
    expect(readdirSync(app!.armazem.pasta)).toHaveLength(0);
    const r = await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: wav(1), nomeArquivo: '../../../etc/x.wav' });
    expect(r.statusCode).toBe(201);
    expect(readdirSync(app!.armazem.pasta)).toEqual([expect.stringMatching(/^[0-9a-f]{32}\.wav$/)]);
  });

  it('RN-14: com 200 áudios, o seguinte é recusado sem gravar arquivo', async () => {
    const { dono, enviar } = await preparar();
    const inserir = app!.banco.prepare("INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em) VALUES ('a', 'x.wav', 1000, 'comum', ?, 0)");
    for (let i = 0; i < AUDIOS_LOJA_MAX; i++) inserir.run(dono.usuario.id);
    expect((await enviar(dono.token, { nome: 'X', raridade: 'raro', arquivo: wav(1) })).statusCode).toBe(409);
    expect(readdirSync(app!.armazem.pasta)).toHaveLength(0);
  });

  it('CA-12/CA-15: alterar e retirar; com comprador fica (e o arquivo), sem comprador some com o arquivo; auditoria', async () => {
    const { dono, ana, auth, enviar } = await preparar();
    const a = (await enviar(dono.token, { nome: 'Trovão', raridade: 'raro', arquivo: wav(1) })).json() as AudioLojaDto;
    const b = (await enviar(dono.token, { nome: 'Chuva', raridade: 'comum', arquivo: wav(1) })).json() as AudioLojaDto;
    const alterado = await app!.inject({ method: 'PATCH', url: `/api/admin/loja/audios/${a.id}`, headers: auth(dono.token), payload: { raridade: 'lendario' } });
    expect(alterado.json()).toMatchObject({ id: a.id, nome: 'Trovão', raridade: 'lendario' });
    expect((await app!.inject({ method: 'PATCH', url: `/api/admin/loja/audios/${a.id}`, headers: auth(dono.token), payload: { raridade: 'mitico' } })).statusCode).toBe(400);
    expect((await app!.inject({ method: 'PATCH', url: `/api/admin/loja/audios/${a.id}`, headers: auth(ana.token), payload: { nome: 'X' } })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/loja/audios/${a.id}`, headers: auth(ana.token) })).statusCode).toBe(403);
    expect((await app!.inject({ method: 'DELETE', url: `/c/2/api/admin/loja/audios/${a.id}`, headers: auth(dono.token) })).statusCode).not.toBe(204);
    // Sem mudança real, nada vai à auditoria.
    await app!.inject({ method: 'PATCH', url: `/api/admin/loja/audios/${a.id}`, headers: auth(dono.token), payload: { raridade: 'lendario' } });
    // Ana comprou o Trovão.
    app!.banco.prepare('INSERT INTO loja_audios_compras (usuario_id, audio_id, comprado_em) VALUES (?, ?, 0)').run(ana.usuario.id, a.id);
    const disco = (x: AudioLojaDto) => join(app!.armazem.pasta, x.url.replace('/files/', ''));
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/loja/audios/${a.id}`, headers: auth(dono.token) })).statusCode).toBe(204);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/loja/audios/${b.id}`, headers: auth(dono.token) })).statusCode).toBe(204);
    expect(existsSync(disco(a))).toBe(true);
    expect(existsSync(disco(b))).toBe(false);
    const lista = (await app!.inject({ method: 'GET', url: '/api/admin/loja/audios', headers: auth(dono.token) })).json() as AudioLojaAdminDto[];
    expect(lista).toEqual([expect.objectContaining({ id: a.id, compradores: 1, retirado: true })]);
    expect((await app!.inject({ method: 'DELETE', url: `/api/admin/loja/audios/${a.id}`, headers: auth(dono.token) })).statusCode).toBe(404);
    const tipos = listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('loja_audio')).map((r) => [r.tipo, r.detalhes]);
    expect(tipos).toEqual(
      expect.arrayContaining([
        ['loja_audio_cadastrado', { audio: 'Trovão', raridade: 'raro' }],
        ['loja_audio_alterado', { audio: 'Trovão', de: 'raro', para: 'lendario' }],
        ['loja_audio_retirado', { audio: 'Trovão', raridade: 'lendario' }],
        ['loja_audio_retirado', { audio: 'Chuva', raridade: 'comum' }],
      ]),
    );
  });
});
