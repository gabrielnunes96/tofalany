import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, OlaPayload } from '@tofalando/shared';
import { appTeste, cadastrar } from './apoio.js';
import { criarCanal } from '../src/dominio/canais.js';

/** mover-e-afk, T2: mover e desconectar da chamada (CA-1 a CA-6, CA-14, CA-16; A1–A5, A10). */
type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
type Resposta = { ok: boolean; valor?: unknown; erro?: string };
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<Resposta>((r) => (s.emit as (e: string, d: unknown, cb: (x: Resposta) => void) => void)(evento, dados, r));
const naVoz = (s: Cliente, canalVozId: number | null) => pedir(s, 'voz:estado', { canalVozId, mudo: false, surdo: false, camera: false });

async function preparar(prazo = '200') {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50', PRAZO_MOVER_MS: prazo });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const conta = async (nome: string) => (await cadastrar(app!, nome)).json() as { token: string; usuario: { id: number } };
  const dono = await conta('dono');
  const ana = await conta('ana');
  const bia = await conta('bia');
  const caio = await conta('caio');
  const abrir = (token: string, comunidade = 1) =>
    new Promise<{ s: Cliente; ola: OlaPayload }>((r) => {
      const s: Cliente = conectar(url, { auth: { token, comunidade }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(s);
      s.once('ola', (ola) => r({ s, ola }));
    });
  const d = await abrir(dono.token);
  const papo = ((await pedir(d.s, 'canal:criar', { tipo: 'voz', nome: 'Papo' })).valor as CanalDto).id;
  const jogos = ((await pedir(d.s, 'canal:criar', { tipo: 'voz', nome: 'Jogos' })).valor as CanalDto).id;
  /** Cargo "Mod" com "Mover membros" para quem for passado. */
  const darMover = async (...ids: number[]) => {
    const cargo = (await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono.token), payload: { nome: 'Mod', cor: '#ff8800', permissoes: ['entrar_voz', 'mover_membros'] } })).json() as {
      id: number;
    };
    for (const id of ids) await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${id}/funcao`, headers: auth(dono.token), payload: { funcaoId: cargo.id } });
  };
  return { dono, ana, bia, caio, abrir, d, papo, jogos, darMover };
}

const auditoria = (tipo: string) =>
  app!.banco.prepare('SELECT ator_id AS ator, alvo_usuario_id AS alvo, canal_id AS canal, detalhes FROM auditoria WHERE tipo = ? ORDER BY id').all(tipo) as {
    ator: number;
    alvo: number;
    canal: number;
    detalhes: string;
  }[];

describe('mover e desconectar da chamada', () => {
  it('CA-1: sem a permissão, recusa', async () => {
    const { ana, bia, abrir, papo, jogos } = await preparar();
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).erro).toMatch(/não permite mover/);
    expect((await pedir(a.s, 'voz:desconectar', { usuarioId: bia.usuario.id })).erro).toMatch(/não permite mover/);
  });

  it('CA-2/CA-14: com a permissão move; a pessoa recebe o destino e quem moveu (nomes do banco); auditoria', async () => {
    const { ana, bia, abrir, papo, jogos, darMover } = await preparar();
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    const movido = new Promise((r) => b.s.once('voz:movido', r));
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).ok).toBe(true);
    expect(await movido).toEqual({ canalVozId: jogos, canalNome: 'Jogos', porNome: 'ana' });
    // O app obedece: entra em Jogos pelo caminho normal e não é tirado.
    expect((await naVoz(b.s, jogos)).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const estados = await new Promise<{ usuarioId: number; canalVozId: number }[]>((r) => {
      b.s.once('voz:estados', r);
      void naVoz(b.s, jogos);
    });
    expect(estados.find((e) => e.usuarioId === bia.usuario.id)?.canalVozId).toBe(jogos);
    const [reg] = auditoria('voz_movido');
    expect(reg).toMatchObject({ ator: ana.usuario.id, alvo: bia.usuario.id, canal: jogos });
    expect(JSON.parse(reg!.detalhes)).toMatchObject({ de: 'Papo' });
  });

  it('A5: o app que ignora o pedido é tirado da sala antiga no prazo', async () => {
    const { ana, bia, abrir, papo, jogos, darMover } = await preparar('150');
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    const saiu = new Promise<{ usuarioId: number }[]>((r) => {
      a.s.on('voz:estados', (lista) => {
        if (!lista.some((e) => e.usuarioId === bia.usuario.id)) r(lista);
      });
    });
    await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos });
    await saiu;
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo = 'voz_saiu' AND detalhes LIKE '%movido%'").get()).toEqual({ n: 1 });
  });

  it('A5: quem obedece e depois volta para a sala antiga (nova entrada) dentro do prazo não é tirado', async () => {
    const { ana, bia, abrir, papo, jogos, darMover } = await preparar('200');
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).ok).toBe(true);
    await naVoz(b.s, jogos);
    await naVoz(b.s, papo);
    await new Promise((r) => setTimeout(r, 400));
    const estados = await new Promise<{ usuarioId: number; canalVozId: number }[]>((r) => {
      b.s.once('voz:estados', r);
      void naVoz(b.s, papo);
    });
    expect(estados.find((e) => e.usuarioId === bia.usuario.id)?.canalVozId).toBe(papo);
    expect(app!.banco.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo = 'voz_saiu' AND detalhes LIKE '%movido%'").get()).toEqual({ n: 0 });
  });

  it('CA-6: desconectar tira na hora e avisa', async () => {
    const { ana, bia, abrir, papo, darMover } = await preparar();
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    const aviso = new Promise((r) => b.s.once('voz:desconectado', r));
    expect((await pedir(a.s, 'voz:desconectar', { usuarioId: bia.usuario.id })).ok).toBe(true);
    expect(await aviso).toEqual({ porNome: 'ana' });
    expect(auditoria('voz_desconectado')).toMatchObject([{ ator: ana.usuario.id, alvo: bia.usuario.id, canal: papo }]);
  });

  it('CA-4/CA-16: quem não é admin não move admin nem quem também move; admin move', async () => {
    const { dono, ana, caio, abrir, papo, jogos, darMover, d } = await preparar();
    await darMover(ana.usuario.id, caio.usuario.id);
    const a = await abrir(ana.token);
    const c = await abrir(caio.token);
    await naVoz(d.s, papo);
    await naVoz(c.s, papo);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: dono.usuario.id, canalVozId: jogos })).erro).toMatch(/administrador move um administrador/);
    expect((await pedir(a.s, 'voz:desconectar', { usuarioId: dono.usuario.id })).ok).toBe(false);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: caio.usuario.id, canalVozId: jogos })).erro).toMatch(/também move membros/);
    expect((await pedir(d.s, 'voz:mover', { usuarioId: caio.usuario.id, canalVozId: jogos })).ok).toBe(true);
  });

  it('CA-5: de castigo não é movido; A2: destino inválido; A3: fora da chamada e a si mesmo', async () => {
    const { dono, ana, bia, caio, abrir, papo, jogos, darMover, d } = await preparar();
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    const texto = d.ola.canais.find((c) => c.tipo === 'texto')!.id;
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: texto })).erro).toMatch(/não é de voz/);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: papo })).erro).toMatch(/já está nessa sala/);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: 99_999 })).erro).toMatch(/não encontrada/);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: caio.usuario.id, canalVozId: jogos })).erro).toMatch(/não está em chamada/);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: 99_999, canalVozId: jogos })).erro).toMatch(/não está em chamada/);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: ana.usuario.id, canalVozId: jogos })).ok).toBe(false);
    await app!.inject({ method: 'POST', url: `/api/moderacao/${bia.usuario.id}/castigo`, headers: auth(dono.token), payload: { minutos: 5 } });
    // De castigo já sai da voz; mesmo assim, voltando a estar presente, não seria movida.
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).ok).toBe(false);
    expect(auditoria('voz_movido')).toEqual([]);
  });

  it('A1: quem está em chamada em outro servidor não é movido daqui', async () => {
    const { dono, ana, bia, abrir, jogos, darMover } = await preparar();
    await darMover(ana.usuario.id);
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    app!.banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (2, ?, 'membro', ?)").run(bia.usuario.id, Date.now());
    const la = criarCanal(app!.banco, 'voz', 'Lá', dono.usuario.id, Date.now(), 2).id;
    const a = await abrir(ana.token);
    const b2 = await abrir(bia.token, 2);
    expect((await naVoz(b2.s, la)).ok).toBe(true);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).erro).toMatch(/não está em chamada neste servidor/);
  });

  it('A10: muitos movimentos seguidos param no limite', async () => {
    const { ana, bia, abrir, papo, jogos, darMover } = await preparar('10000');
    await darMover(ana.usuario.id);
    const a = await abrir(ana.token);
    const b = await abrir(bia.token);
    await naVoz(b.s, papo);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: jogos })).ok).toBe(true);
    await naVoz(b.s, jogos);
    expect((await pedir(a.s, 'voz:mover', { usuarioId: bia.usuario.id, canalVozId: papo })).erro).toMatch(/muitas trocas/);
  });
});
