import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import { LIMITE_TELAS_POR_CANAL, type CanalDto, type EventosCliente, type EventosServidor, type OlaPayload, type TransmissaoDto } from '@tofalando/shared';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { comprar, creditar } from '../src/dominio/loja.js';
import { lerConfig } from '../src/config.js';
import { appTeste, cadastrar } from './apoio.js';

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

async function abrir(token: string): Promise<{ s: Cliente; ola: OlaPayload }> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  }) as Cliente;
  sockets.push(s);
  const ola = await new Promise<OlaPayload>((r) => s.once('ola', r));
  return { s, ola };
}
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
const naVoz = (s: Cliente, canalVozId: number | null) => pedir(s, 'voz:estado', { canalVozId, mudo: false, surdo: false, camera: false });

async function preparar() {
  app = await appTeste({ CARENCIA_OFFLINE_MS: '50' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dono = (await cadastrar(app, 'dono')).json().token as string;
  const ana = (await cadastrar(app, 'ana')).json().token as string;
  const a = await abrir(dono);
  const b = await abrir(ana);
  const criar = async (nome: string) => ((await pedir(a.s, 'canal:criar', { tipo: 'voz', nome })).valor as CanalDto).id;
  return { a, b, papo: await criar('Papo'), jogo: await criar('Jogo'), ana, dono };
}

describe('transmissão de tela: trava por canal (RN-10)', () => {
  it('CA-18: o cargo com "Transmitir em 1080p" libera 720p60, 1080p30 e 1080p60; sem ele, recusa', async () => {
    const { b, jogo, dono } = await preparar();
    await naVoz(b.s, jogo);
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p60' })).toEqual({ ok: false, erro: 'Seu cargo não libera essa qualidade.' });
    const auth = (t: string) => ({ authorization: `Bearer ${t}` });
    const cargo = await app!.inject({ method: 'POST', url: '/api/admin/funcoes', headers: auth(dono), payload: { nome: 'Streamer', cor: '#ff8800', permissoes: ['transmitir_tela', 'transmitir_1080p'] } });
    expect(cargo.statusCode).toBe(201);
    const contas = (await app!.inject({ method: 'GET', url: '/api/admin/usuarios', headers: auth(dono) })).json() as { id: number; usuario: string }[];
    const anaId = contas.find((c) => c.usuario === 'ana')!.id;
    const troca = await app!.inject({ method: 'PATCH', url: `/api/admin/usuarios/${anaId}/funcao`, headers: auth(dono), payload: { funcaoId: cargo.json().id } });
    expect(troca.statusCode).toBe(200);
    for (const qualidade of ['720p60', '1080p30', '1080p60']) {
      expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade })).toMatchObject({ ok: true, valor: { qualidade } });
      await pedir(b.s, 'tela:parar', { canalVozId: jogo });
    }
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1440p60' })).ok).toBe(false);
  });

  it('CA-38: cada pessoa transmite a sua (várias no canal, até o limite); parar tira só a minha; auditoria (CA-49)', async () => {
    const { a, b, papo, ana } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, papo);
    const iniciada = new Promise<TransmissaoDto>((r) => b.s.once('tela:iniciada', r));
    expect(await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({ ok: true, valor: { canalVozId: papo, usuarioId: 1, qualidade: '720p30', espectadores: [] } });
    expect(await iniciada).toEqual({ canalVozId: papo, usuarioId: 1, qualidade: '720p30', espectadores: [] });
    // A ana também transmite no mesmo canal.
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    // Pedir de novo quem já transmite não muda nada.
    expect((await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    const c = await abrir(ana);
    expect(c.ola.transmissoes.map((t) => t.usuarioId).sort()).toEqual([1, 2]);

    // Parar a minha não mexe na da ana.
    const parada = new Promise((r) => b.s.once('tela:parada', r));
    await pedir(a.s, 'tela:parar', { canalVozId: papo });
    expect(await parada).toEqual({ canalVozId: papo, usuarioId: 1 });
    const d = await abrir(ana);
    expect(d.ola.transmissoes.map((t) => t.usuarioId)).toEqual([2]);

    const registros = listarAuditoria(app!.banco).registros.filter((r) => r.tipo.startsWith('tela_')).reverse();
    expect(registros.map((r) => [r.tipo, r.ator?.nome, r.canal?.nome])).toEqual([
      ['tela_iniciou', 'dono', 'Papo'],
      ['tela_iniciou', 'ana', 'Papo'],
      ['tela_parou', 'dono', 'Papo'],
    ]);
  });

  it(`limite de ${LIMITE_TELAS_POR_CANAL} transmissões ao mesmo tempo no canal`, async () => {
    app = await appTeste({ CARENCIA_OFFLINE_MS: '50', TENTATIVAS_POR_MINUTO: '50' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dono = await abrir((await cadastrar(app, 'dono')).json().token as string);
    const papo = ((await pedir(dono.s, 'canal:criar', { tipo: 'voz', nome: 'Papo' })).valor as CanalDto).id;
    const pessoas = [dono];
    for (let i = 0; i < LIMITE_TELAS_POR_CANAL; i++) pessoas.push(await abrir((await cadastrar(app, `pessoa${i}`)).json().token as string));
    for (const p of pessoas) await naVoz(p.s, papo);
    for (const p of pessoas.slice(0, LIMITE_TELAS_POR_CANAL)) expect((await pedir(p.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    expect(await pedir(pessoas.at(-1)!.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({
      ok: false,
      erro: `Já há ${LIMITE_TELAS_POR_CANAL} pessoas transmitindo neste canal.`,
    });
  }, 20_000);

  it('quem assiste: entra e sai da lista, só estando no canal; quem transmite não conta; sair da voz tira; ola traz', async () => {
    const { a, b, papo, jogo, ana } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, jogo);
    expect((await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    expect(await pedir(b.s, 'tela:assistir', { canalVozId: papo, assistindo: true })).toEqual({ ok: false, erro: 'Entre no canal de voz para assistir.' });
    expect((await pedir(b.s, 'tela:assistir', { canalVozId: papo, assistindo: 'sim' })).ok).toBe(false);
    await naVoz(b.s, papo);
    const lista = () => new Promise<{ canalVozId: number; usuarioId: number; espectadores: number[] }>((r) => a.s.once('tela:espectadores', r));
    let aviso = lista();
    expect((await pedir(b.s, 'tela:assistir', { canalVozId: papo, usuarioId: 1, assistindo: true })).ok).toBe(true);
    expect(await aviso).toEqual({ canalVozId: papo, usuarioId: 1, espectadores: [2] });
    // Quem transmite não vira espectador da própria tela.
    expect((await pedir(a.s, 'tela:assistir', { canalVozId: papo, assistindo: true })).ok).toBe(true);
    const c = await abrir(ana);
    expect(c.ola.transmissoes).toEqual([{ canalVozId: papo, usuarioId: 1, qualidade: '720p30', espectadores: [2] }]);
    // App antigo (sem dizer de quem): vale a transmissão do canal que não é a dele.
    aviso = lista();
    await pedir(b.s, 'tela:assistir', { canalVozId: papo, assistindo: false });
    expect(await aviso).toEqual({ canalVozId: papo, usuarioId: 1, espectadores: [] });
    aviso = lista();
    await pedir(b.s, 'tela:assistir', { canalVozId: papo, assistindo: true });
    expect(await aviso).toEqual({ canalVozId: papo, usuarioId: 1, espectadores: [2] });
    // Saiu da voz: sai da lista.
    aviso = lista();
    await naVoz(b.s, null);
    expect(await aviso).toEqual({ canalVozId: papo, usuarioId: 1, espectadores: [] });
  });

  it('outro computador da mesma pessoa assume a voz: a transmissão da sessão anterior acaba', async () => {
    const { a, b, papo, ana } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, papo);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    const parada = new Promise((r) => a.s.once('tela:parada', r));
    const b2 = await abrir(ana);
    await naVoz(b2.s, papo);
    expect(await parada).toEqual({ canalVozId: papo, usuarioId: 2 });
  });

  it('só transmite quem está no canal; um por canal (outro canal pode); sair da voz libera; ola traz quem transmite', async () => {
    const { a, b, papo, jogo, ana } = await preparar();
    expect(await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).toEqual({ ok: false, erro: 'Entre no canal de voz para transmitir.' });
    await naVoz(a.s, papo);
    await naVoz(b.s, jogo);
    expect((await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '720p30' })).ok).toBe(true);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p30' })).ok).toBe(true);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '4k' })).ok).toBe(false);
    const c = await abrir(ana);
    expect(c.ola.transmissoes).toHaveLength(2);

    // Trocar de canal (sair da voz em Jogo) libera a trava de Jogo.
    const parada = new Promise((r) => a.s.once('tela:parada', r));
    await naVoz(b.s, papo);
    expect(await parada).toEqual({ canalVozId: jogo, usuarioId: 2 });
    // Cair da conexão (depois da carência) libera Papo.
    const parada2 = new Promise((r) => b.s.once('tela:parada', r));
    a.s.close();
    expect(await parada2).toEqual({ canalVozId: papo, usuarioId: 1 });
    // CA-49: transmitir e sair da voz fica registrado como fim da transmissão.
    const motivos = listarAuditoria(app!.banco)
      .registros.filter((r) => r.tipo === 'tela_parou')
      .map((r) => [r.ator?.nome, r.detalhes?.motivo]);
    expect(motivos).toEqual([
      ['dono', 'saiu_da_voz'],
      ['ana', 'saiu_da_voz'],
    ]);
  });

  it('CA-39a: membro só 720p30 (servidor recusa acima); admin pode 1440p60; faixa fora da regra é silenciada (R-2)', async () => {
    const { a, b, papo, jogo } = await preparar();
    await naVoz(a.s, papo);
    await naVoz(b.s, jogo);
    // ana (membro) pedindo 1440p60 direto ao servidor.
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1440p60' })).toEqual({ ok: false, erro: 'Seu cargo não libera essa qualidade.' });
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p30' })).ok).toBe(true);
    // dono (admin) em 1440p60.
    expect(await pedir(a.s, 'tela:pedir', { canalVozId: papo, qualidade: '1440p60' })).toMatchObject({ ok: true, valor: { qualidade: '1440p60' } });

    const conferir = (u: number, c: number, largura: number, altura: number) => app!.tempoReal.conferirFaixaTela(u, c, { sid: 'TR_1', largura, altura });
    expect(await conferir(2, jogo, 1280, 720)).toBe(false);
    expect(await conferir(2, jogo, 1920, 1080)).toBe(true);
    expect(await conferir(2, jogo, 720, 1280)).toBe(false);
    expect(await conferir(1, papo, 2560, 1440)).toBe(false);
    expect(await conferir(1, papo, 3840, 2160)).toBe(true);
    // Sem a trava do canal (segunda tela): silenciada — com a chamada certa ao LiveKit.
    const silenciar = vi.fn(async () => undefined);
    expect(await app!.tempoReal.conferirFaixaTela(2, papo, { sid: 'TR_9', largura: 640, altura: 360 }, silenciar)).toBe(true);
    expect(silenciar).toHaveBeenCalledWith(`voz-${papo}`, '2', 'TR_9');
    // Áudio da tela: só a posse da trava conta.
    expect(await app!.tempoReal.conferirFaixaTela(2, jogo, { sid: 'TR_a', largura: 0, altura: 0, soAudio: true }, silenciar)).toBe(false);
    expect(await app!.tempoReal.conferirFaixaTela(2, papo, { sid: 'TR_b', largura: 0, altura: 0, soAudio: true }, silenciar)).toBe(true);
    // Sem dimensões: de membro, fora da regra; de admin, passa.
    expect(await conferir(2, jogo, 0, 0)).toBe(true);
    expect(await conferir(1, papo, 0, 0)).toBe(false);

    // RN-17: o dono perde o cargo transmitindo em 1440p60 — a transmissão acaba (motivo cargo_alterado).
    app!.banco.prepare("UPDATE usuarios SET cargo = 'membro' WHERE id = 1").run();
    app!.banco.prepare("UPDATE membros SET cargo = 'membro' WHERE usuario_id = 1").run();
    const parada = new Promise((r) => b.s.once('tela:parada', r));
    app!.tempoReal.cargoMudou(1);
    expect(await parada).toEqual({ canalVozId: papo, usuarioId: 1 });
    expect(listarAuditoria(app!.banco).registros.find((r) => r.tipo === 'tela_parou')?.detalhes?.motivo).toBe('cargo_alterado');
  });
});

describe('transmissão de tela: vales da loja (pontos-e-loja)', () => {
  const comprarVale = (qualidade: '720p60' | '1080p30' | '1080p60') => {
    creditar(app!.banco, 2, 600, null);
    comprar(app!.banco, 2, { tipo: 'vale', qualidade }, lerConfig({}).pontos.precos);
  };
  const conferir = (c: number, largura: number, altura: number) => app!.tempoReal.conferirFaixaTela(2, c, { sid: 'TR_1', largura, altura }, async () => undefined);

  it('CA-14/CA-16: sem vale, 1080p60 é recusado; com o vale de 1080p60, 1080p60 passa (e a faixa 1080p também), 2K não', async () => {
    const { b, jogo } = await preparar();
    await naVoz(b.s, jogo);
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p60' })).toEqual({ ok: false, erro: 'Seu cargo não libera essa qualidade.' });
    comprarVale('1080p60');
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1440p60' })).ok).toBe(false);
    for (const qualidade of ['720p60', '1080p30']) {
      expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade })).ok).toBe(true);
      await pedir(b.s, 'tela:parar', { canalVozId: jogo });
    }
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p60' })).toMatchObject({ ok: true, valor: { qualidade: '1080p60' } });
    expect(await conferir(jogo, 1920, 1080)).toBe(false);
    expect(await conferir(jogo, 2560, 1440)).toBe(true);
    // Sem dimensões, com a transmissão acima de 720p30 liberada pelo vale: passa.
    expect(await conferir(jogo, 0, 0)).toBe(false);
  });

  it('CA-16: com vale de 720p60, uma faixa 1080p é silenciada; em 720p30 sem dimensões continua suspeita', async () => {
    const { b, jogo } = await preparar();
    await naVoz(b.s, jogo);
    comprarVale('720p60');
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p60' })).ok).toBe(true);
    expect(await conferir(jogo, 1920, 1080)).toBe(true);
    await pedir(b.s, 'tela:parar', { canalVozId: jogo });
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p30' })).ok).toBe(true);
    expect(await conferir(jogo, 0, 0)).toBe(true);
  });

  it('o vale de 1080p30 libera só 1080p30 (além de 720p30)', async () => {
    const { b, jogo } = await preparar();
    await naVoz(b.s, jogo);
    comprarVale('1080p30');
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p60' })).ok).toBe(false);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '720p60' })).ok).toBe(false);
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p30' })).ok).toBe(true);
  });

  it('CA-17: o vale vence no meio — a transmissão continua (mesmo republicada); a próxima já sai limitada', async () => {
    const { b, jogo } = await preparar();
    await naVoz(b.s, jogo);
    comprarVale('1080p60');
    expect((await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p60' })).ok).toBe(true);
    app!.banco.prepare('UPDATE loja_vales SET expira_em = 1 WHERE usuario_id = 2').run();
    app!.tempoReal.cargoMudou(2);
    const doCanal = (await abrir((await cadastrar(app!, 'caio')).json().token as string)).ola.transmissoes;
    expect(doCanal).toEqual([expect.objectContaining({ usuarioId: 2, qualidade: '1080p60' })]);
    expect(await conferir(jogo, 1920, 1080)).toBe(false);
    expect(await conferir(jogo, 0, 0)).toBe(false);
    expect((await pedir(b.s, 'tela:parar', { canalVozId: jogo })).ok).toBe(true);
    expect(await pedir(b.s, 'tela:pedir', { canalVozId: jogo, qualidade: '1080p60' })).toEqual({ ok: false, erro: 'Seu cargo não libera essa qualidade.' });
  });
});

