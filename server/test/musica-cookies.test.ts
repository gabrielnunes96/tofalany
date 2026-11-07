import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appTeste, cadastrar } from './apoio.js';

let app: FastifyInstance | undefined;
let pasta: string;
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(pasta, { recursive: true, force: true });
});

const COOKIES = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tabc\n';

describe('ToOuvini: cookies do YouTube enviados pelo administrador', () => {
  it('só o administrador do principal envia, vê e remove; o arquivo fica só para o servidor', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'tofalando-cookies-'));
    app = await appTeste({ BANCO: join(pasta, 'tofalando.db') });
    const dono = (await cadastrar(app, 'dono')).json() as { token: string };
    const ana = (await cadastrar(app, 'ana')).json() as { token: string };
    const pedir = (token: string, method: 'GET' | 'PUT' | 'DELETE', payload?: object) =>
      app!.inject({ method, url: method === 'GET' ? '/api/admin/musica' : '/api/admin/musica/cookies', headers: { authorization: `Bearer ${token}` }, payload });

    expect((await pedir(ana.token, 'PUT', { conteudo: COOKIES })).statusCode).toBe(403);
    expect((await pedir(dono.token, 'GET')).json()).toEqual({ cookies: false, atualizadoEm: null });
    expect((await pedir(dono.token, 'PUT', { conteudo: 'qualquer coisa' })).json()).toMatchObject({ erro: 'dados_invalidos' });
    const enviado = await pedir(dono.token, 'PUT', { conteudo: COOKIES });
    expect(enviado.json()).toMatchObject({ cookies: true });
    const arquivo = join(pasta, 'musica-cookies.txt');
    expect(statSync(arquivo).mode & 0o777).toBe(0o600);
    expect((await pedir(dono.token, 'DELETE')).statusCode).toBe(204);
    expect(existsSync(arquivo)).toBe(false);
  });
});
