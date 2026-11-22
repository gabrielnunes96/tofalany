import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { permissoesDe, PERMISSOES_BASICAS } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { criarCanal } from '../src/dominio/canais.js';
import { afkDa, ehSalaAfk } from '../src/dominio/comunidades.js';

/** mover-e-afk, T1: configuração da sala de AFK (CA-8, CA-15) e a permissão "Mover membros". */
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function preparar() {
  app = await appTeste();
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const afk = criarCanal(app.banco, 'voz', 'AFK', dono.usuario.id).id;
  const texto = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'texto' LIMIT 1").get() as { id: number }).id;
  const pedir = (token: string, payload: unknown, url = '/api/comunidade/afk') => app!.inject({ method: 'PATCH', url, headers: auth(token), payload: payload as object });
  return { dono, ana, afk, texto, pedir };
}

describe('sala de AFK (mover-e-afk, T1)', () => {
  it('CA-8: o administrador escolhe a sala e o tempo; o ola manda; desligar volta a null', async () => {
    const { dono, afk, pedir } = await preparar();
    const r = await pedir(dono.token, { canalId: afk, minutos: 15 });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ afk: { canalId: afk, minutos: 15 } });
    expect(afkDa(app!.banco, 1)).toEqual({ canalId: afk, minutos: 15 });
    expect(ehSalaAfk(app!.banco, afk)).toBe(true);
    expect((await pedir(dono.token, { canalId: null, minutos: 15 })).json()).toEqual({ afk: null });
  });

  it('A13: só o administrador; só sala de voz deste servidor; tempo da lista; corpo fechado', async () => {
    const { dono, ana, afk, texto, pedir } = await preparar();
    expect((await pedir(ana.token, { canalId: afk, minutos: 15 })).statusCode).toBe(403);
    expect((await pedir(dono.token, { canalId: texto, minutos: 15 })).statusCode).toBe(400);
    expect((await pedir(dono.token, { canalId: afk, minutos: 7 })).statusCode).toBe(400);
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const deLa = criarCanal(app!.banco, 'voz', 'Lá', dono.usuario.id, Date.now(), 2).id;
    expect((await pedir(dono.token, { canalId: deLa, minutos: 15 })).statusCode).toBe(400);
    expect(afkDa(app!.banco, 1)).toBeNull();
  });

  it('CA-15: apagar o canal da AFK desliga a AFK', async () => {
    const { dono, afk, pedir } = await preparar();
    await pedir(dono.token, { canalId: afk, minutos: 30 });
    app!.banco.prepare('DELETE FROM canais WHERE id = ?').run(afk);
    expect(afkDa(app!.banco, 1)).toBeNull();
  });

  it('"Mover membros" não é básica, o administrador tem e de castigo não vale', () => {
    expect(PERMISSOES_BASICAS).not.toContain('mover_membros');
    expect(permissoesDe({ cargo: 'admin', funcaoId: null, castigoAte: null }, []).has('mover_membros')).toBe(true);
    const cargo = { id: 3, nome: 'Mod', cor: null, posicao: 1, permissoes: ['mover_membros' as const] };
    expect(permissoesDe({ cargo: 'membro', funcaoId: 3, castigoAte: null }, [cargo]).has('mover_membros')).toBe(true);
    expect(permissoesDe({ cargo: 'membro', funcaoId: 3, castigoAte: Date.now() + 60_000 }, [cargo]).has('mover_membros')).toBe(false);
  });
});
