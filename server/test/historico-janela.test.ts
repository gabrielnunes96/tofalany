import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PaginaMensagens } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { inserirMensagem } from '../src/dominio/mensagens.js';
import { criarCanal } from '../src/dominio/canais.js';
import { abrirDm } from '../src/dominio/dms.js';

/** chat-fixar-e-buscar, T4: histórico em janela (em=<id>) e para baixo (depois=<id>). */
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
  const beto = (await cadastrar(app, 'beto')).json() as { token: string; usuario: { id: number } };
  const geral = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'texto' AND comunidade_id = 1 ORDER BY id LIMIT 1").get() as { id: number }).id;
  const pedir = async (token: string, url: string) => {
    const r = await app!.inject({ method: 'GET', url, headers: auth(token) });
    return { status: r.statusCode, pagina: r.json() as PaginaMensagens };
  };
  return { dono, ana, beto, geral, pedir };
}

describe('histórico em janela (CA-6, CA-13)', () => {
  it('mensagem 3000 posições antes do fim: 25 antes, ela e 25 depois, com os dois indicadores', async () => {
    const { ana, geral, pedir } = await preparar();
    const ids: number[] = [];
    app!.banco.transaction(() => {
      for (let i = 0; i < 3100; i++) ids.push(inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, `m${i}`));
    })();
    const alvo = ids[99]!;
    const { status, pagina } = await pedir(ana.token, `/api/canais/${geral}/mensagens?em=${alvo}`);
    expect(status).toBe(200);
    expect(pagina.mensagens).toHaveLength(51);
    expect(pagina.mensagens[25]!.id).toBe(alvo);
    expect(pagina.mensagens.map((m) => m.id)).toEqual(ids.slice(74, 125));
    expect(pagina.fim).toBe(false);
    expect(pagina.fimDepois).toBe(false);
    // Para baixo até o fim.
    let ultimo = pagina.mensagens.at(-1)!.id;
    let paginas = 0;
    for (;;) {
      const p = (await pedir(ana.token, `/api/canais/${geral}/mensagens?depois=${ultimo}&limite=100`)).pagina;
      paginas++;
      expect(p.mensagens[0]!.id).toBe(ultimo + 1);
      ultimo = p.mensagens.at(-1)!.id;
      if (p.fimDepois) break;
    }
    expect(ultimo).toBe(ids.at(-1));
    expect(paginas).toBe(30);
  });

  it('no começo e no fim da conversa os indicadores valem; mensagem apagada abre a janela em volta', async () => {
    const { ana, geral, pedir } = await preparar();
    const ids = Array.from({ length: 10 }, (_, i) => inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, `m${i}`));
    const { pagina } = await pedir(ana.token, `/api/canais/${geral}/mensagens?em=${ids[2]}`);
    expect(pagina.mensagens.map((m) => m.id)).toEqual(ids);
    expect(pagina.fim).toBe(true);
    expect(pagina.fimDepois).toBe(true);
    app!.banco.prepare('DELETE FROM mensagens WHERE id = ?').run(ids[5]);
    const sem = (await pedir(ana.token, `/api/canais/${geral}/mensagens?em=${ids[5]}`)).pagina;
    expect(sem.mensagens.map((m) => m.id)).toEqual(ids.filter((_, i) => i !== 5));
  });

  it('as mesmas checagens: canal de outro servidor 404, DM alheia 403', async () => {
    const { dono, ana, beto, pedir } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const secreto = criarCanal(app!.banco, 'texto', 'secreto', dono.usuario.id, Date.now(), 2).id;
    const id = inserirMensagem(app!.banco, { canalId: secreto }, dono.usuario.id, 'x');
    expect((await pedir(ana.token, `/api/canais/${secreto}/mensagens?em=${id}`)).status).toBe(404);
    expect((await pedir(ana.token, `/api/canais/${secreto}/mensagens?depois=1`)).status).toBe(404);
    const dm = abrirDm(app!.banco, dono.usuario.id, beto.usuario.id);
    const idDm = inserirMensagem(app!.banco, { dmId: dm }, dono.usuario.id, 'segredo');
    expect((await pedir(ana.token, `/api/dms/${dm}/mensagens?em=${idDm}`)).status).toBe(403);
    expect((await pedir(beto.token, `/api/dms/${dm}/mensagens?em=${idDm}`)).pagina.mensagens.map((m) => m.texto)).toEqual(['segredo']);
  });
});
