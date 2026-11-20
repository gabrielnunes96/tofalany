import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import type { CanalDto, EventosCliente, EventosServidor, LojaEstadoDto } from '@tofalando/shared';
import { contasValidas, criarPontos, type Participante } from '../src/realtime/pontos.js';
import { estadoLoja, extrato } from '../src/dominio/loja.js';
import { appTeste, cadastrar } from './apoio.js';

const p = (usuarioId: number, canalVozId: number, extra: Partial<Participante> = {}): Participante => ({ usuarioId, canalVozId, surdo: false, emCarencia: false, ...extra });

describe('contador de pontos (unitário, relógio fixo)', () => {
  it('trecho válido: em voz, sem surdo, fora da carência e com mais alguém (RN-1, R-4)', () => {
    expect(contasValidas([p(1, 10), p(2, 10)])).toEqual(new Set([1, 2]));
    expect(contasValidas([p(1, 10)])).toEqual(new Set());
    expect(contasValidas([p(1, 10, { surdo: true }), p(2, 10)])).toEqual(new Set([2]));
    expect(contasValidas([p(1, 10), p(2, 11)])).toEqual(new Set());
    expect(contasValidas([p(1, 10), p(2, 10, { emCarencia: true })])).toEqual(new Set());
  });

  it('credita só minutos completos; ao sair, o minuto incompleto se perde; voltar abre outra sessão', () => {
    let agora = 0;
    let lista = [p(1, 10), p(2, 10)];
    const creditos: [number, number, number | null][] = [];
    let proximo = 100;
    const pontos = criarPontos({
      participantes: () => lista,
      minutoMs: 60_000,
      porMinuto: 1,
      creditar: (u, n, mov) => {
        creditos.push([u, n, mov]);
        return mov ?? proximo++;
      },
      avisar: vi.fn(),
      registrarErro: (e) => {
        throw e;
      },
      agora: () => agora,
    });
    pontos.atualizar();
    agora = 150_000;
    pontos.atualizar();
    expect(creditos).toEqual([
      [1, 2, null],
      [2, 2, null],
    ]);
    // Beto sai em 2:50: Ana fica sozinha; o meio minuto (2:00–2:50) se perde.
    agora = 170_000;
    lista = [p(1, 10)];
    pontos.atualizar();
    agora = 400_000;
    pontos.atualizar();
    expect(creditos).toHaveLength(2);
    // Beto volta: sessão nova (movimento null de novo).
    lista = [p(1, 10), p(2, 10)];
    pontos.atualizar();
    agora = 460_000;
    pontos.atualizar();
    expect(creditos.slice(2)).toEqual([
      [1, 1, null],
      [2, 1, null],
    ]);
  });

  /** Contador com relógio e lista controlados; devolve os créditos [conta, pontos, sessão]. */
  function montar(lista: () => Participante[], relogio: { t: number }, creditar?: (u: number, n: number, mov: number | null) => number | null) {
    const creditos: [number, number, number | null][] = [];
    let proximo = 100;
    const pontos = criarPontos({
      participantes: lista,
      minutoMs: 60_000,
      porMinuto: 1,
      creditar:
        creditar ??
        ((u, n, mov) => {
          creditos.push([u, n, mov]);
          return mov ?? proximo++;
        }),
      avisar: vi.fn(),
      registrarErro: vi.fn(),
      agora: () => relogio.t,
    });
    return { pontos, creditos };
  }

  it('atualizar duas vezes no mesmo instante não credita de novo', () => {
    const relogio = { t: 0 };
    const { pontos, creditos } = montar(() => [p(1, 10), p(2, 10)], relogio);
    pontos.atualizar();
    relogio.t = 120_000;
    pontos.atualizar();
    pontos.atualizar();
    expect(creditos.filter(([u]) => u === 1)).toEqual([[1, 2, null]]);
  });

  it('trocar de canal (com gente nos dois) mantém a sessão; surdo no meio recomeça do zero', () => {
    const relogio = { t: 0 };
    let lista = [p(1, 10), p(2, 10), p(3, 11)];
    const { pontos, creditos } = montar(() => lista, relogio);
    pontos.atualizar();
    relogio.t = 90_000;
    lista = [p(1, 11), p(2, 10), p(3, 11)];
    pontos.atualizar();
    relogio.t = 180_000;
    pontos.atualizar();
    // Ana (1): 1 minuto no canal 10 e mais 2 no 11, na mesma sessão (100).
    expect(creditos.filter(([u]) => u === 1)).toEqual([
      [1, 1, null],
      [1, 2, 100],
    ]);
    // Ana liga o surdo em 3:30 e desliga em 4:00: o meio minuto se perde e começa outra sessão.
    relogio.t = 210_000;
    lista = [p(1, 11, { surdo: true }), p(3, 11)];
    pontos.atualizar();
    relogio.t = 240_000;
    lista = [p(1, 11), p(3, 11)];
    pontos.atualizar();
    relogio.t = 300_000;
    pontos.atualizar();
    expect(creditos.filter(([u]) => u === 1).at(-1)).toEqual([1, 1, null]);
  });

  it('falha ao gravar: os minutos ficam para a próxima vez e as outras contas seguem', () => {
    const relogio = { t: 0 };
    let falhar = true;
    const gravados: [number, number][] = [];
    const { pontos } = montar(
      () => [p(1, 10), p(2, 10)],
      relogio,
      (u, n, mov) => {
        if (u === 1 && falhar) throw new Error('SQLITE_BUSY');
        gravados.push([u, n]);
        return mov ?? 1;
      },
    );
    pontos.atualizar();
    relogio.t = 60_000;
    pontos.atualizar();
    expect(gravados).toEqual([[2, 1]]);
    falhar = false;
    relogio.t = 120_000;
    pontos.atualizar();
    expect(gravados).toEqual([
      [2, 1],
      [1, 2],
      [2, 1],
    ]);
  });
});

type Cliente = Socket<EventosServidor, EventosCliente>;
let app: FastifyInstance | undefined;
const sockets: Cliente[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await app?.close();
  app = undefined;
});

const MINUTO = 200;
const pedir = (s: Cliente, evento: string, dados: unknown) =>
  new Promise<{ ok: boolean; erro?: string; valor?: unknown }>((r) => (s.emit as (e: string, d: unknown, ack: (x: never) => void) => void)(evento, dados, r));
const naVoz = (s: Cliente, canalVozId: number | null, extra: { surdo?: boolean; mudo?: boolean } = {}) =>
  pedir(s, 'voz:estado', { canalVozId, mudo: extra.mudo ?? false, surdo: extra.surdo ?? false, camera: false });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const saldo = (id: number) => estadoLoja(app!.banco, id).saldo;

async function abrir(token: string, comunidade?: number): Promise<Cliente> {
  const s = conectar(`http://127.0.0.1:${(app!.server.address() as AddressInfo).port}`, { auth: { token, comunidade }, transports: ['websocket'], reconnection: false, forceNew: true }) as Cliente;
  sockets.push(s);
  await new Promise((r) => s.once('ola', r));
  return s;
}

/** dono (1), ana (2) e beto (3) conectados; um canal de voz "Sala" no principal. */
async function preparar() {
  app = await appTeste({ PONTOS_MINUTO_MS: String(MINUTO), PONTOS_TIQUE_MS: '20', CARENCIA_OFFLINE_MS: '5000' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const tokens = { dono: '', ana: '', beto: '' };
  for (const nome of ['dono', 'ana', 'beto'] as const) tokens[nome] = (await cadastrar(app, nome)).json().token as string;
  const dono = await abrir(tokens.dono);
  const ana = await abrir(tokens.ana);
  const beto = await abrir(tokens.beto);
  const sala = ((await pedir(dono, 'canal:criar', { tipo: 'voz', nome: 'Sala' })).valor as CanalDto).id;
  return { tokens, dono, ana, beto, sala };
}

/** Espera `minutos` minutos curtos e mais um pouco (só para conferir que NÃO ganhou). */
const minutos = (n: number) => esperar(n * MINUTO + 80);
/** Espera o saldo chegar a `n` e confere que não passou dos minutos completos desde `desde` (nada em dobro). */
async function ganhou(id: number, n: number, desde: number) {
  await vi.waitFor(() => expect(saldo(id)).toBeGreaterThanOrEqual(n), { timeout: n * MINUTO + 2000, interval: 10 });
  expect(saldo(id)).toBeLessThanOrEqual(Math.floor((Date.now() - desde) / MINUTO));
}

describe('contador de pontos (integração, minuto de 200 ms)', () => {
  it('CA-1/CA-2: dois no canal ganham; sozinho não ganha', async () => {
    const { ana, beto, sala } = await preparar();
    await naVoz(ana, sala);
    await minutos(2);
    expect(saldo(2)).toBe(0);
    const desde = Date.now();
    await naVoz(beto, sala);
    await ganhou(2, 3, desde);
    await ganhou(3, 3, desde);
    expect(saldo(1)).toBe(0);
  });

  it('CA-4/CA-5: surdo não ganha (o outro sim); mudo ganha', async () => {
    const { ana, beto, sala } = await preparar();
    const desde = Date.now();
    await naVoz(ana, sala, { surdo: true });
    await naVoz(beto, sala, { mudo: true });
    await ganhou(3, 3, desde);
    expect(saldo(2)).toBe(0);
  });

  // CA-3 é coberto por construção: o ToOuvini entra só no LiveKit (identidade bot-musica), nunca na presença de voz
  // do servidor, que é de onde o contador lê. Sem LiveKit no teste, confere-se que a presença tem só a pessoa.
  it('CA-3: o ToOuvini não conta como pessoa (só gente na presença de voz)', async () => {
    const { ana, sala } = await preparar();
    await naVoz(ana, sala);
    // O bot entra só no LiveKit; a presença de voz do servidor continua só com a ana.
    expect(app!.tempoReal.voz.participantes()).toEqual([expect.objectContaining({ usuarioId: 2 })]);
    await minutos(2);
    expect(saldo(2)).toBe(0);
  });

  it('CA-6: dois aparelhos da mesma conta não dobram', async () => {
    const { tokens, ana, beto, sala } = await preparar();
    await naVoz(ana, sala);
    await naVoz(beto, sala);
    const tirado = new Promise((r) => ana.once('voz:tirado', r));
    const desde = Date.now();
    const outro = await abrir(tokens.ana);
    await naVoz(outro, sala);
    expect(await tirado).toEqual({ motivo: 'outro_computador' });
    expect(app!.tempoReal.voz.participantes().filter((x) => x.usuarioId === 2)).toHaveLength(1);
    await ganhou(2, 3, desde - MINUTO);
  });

  it('CA-7/CA-8: voz no principal e no servidor 2 somam no saldo único; cada crédito avisa a conta', async () => {
    const { tokens, ana, beto, sala } = await preparar();
    const auth = { authorization: `Bearer ${tokens.dono}` };
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth, payload: { nome: 'Família' } });
    const codigo = (await app!.inject({ method: 'GET', url: '/c/2/api/admin/convite', headers: auth })).json().codigo as string;
    for (const t of [tokens.ana]) await app!.inject({ method: 'POST', url: '/api/comunidades/entrar', headers: { authorization: `Bearer ${t}` }, payload: { codigo } });
    const avisos: LojaEstadoDto[] = [];
    ana.on('loja:estado', (e) => avisos.push(e));
    const desde = Date.now();
    await naVoz(ana, sala);
    await naVoz(beto, sala);
    await ganhou(2, 2, desde);
    const noPrincipal = saldo(2);
    await naVoz(ana, null);
    await naVoz(beto, null);
    const donoNo2 = await abrir(tokens.dono, 2);
    const anaNo2 = await abrir(tokens.ana, 2);
    const avisosNo2: LojaEstadoDto[] = [];
    anaNo2.on('loja:estado', (e) => avisosNo2.push(e));
    const familia = ((await pedir(donoNo2, 'canal:criar', { tipo: 'voz', nome: 'Família' })).valor as CanalDto).id;
    await naVoz(donoNo2, familia);
    await naVoz(anaNo2, familia);
    await vi.waitFor(() => expect(saldo(2)).toBeGreaterThanOrEqual(noPrincipal + 2), { timeout: 3000, interval: 10 });
    await vi.waitFor(() => expect(avisosNo2.at(-1)?.saldo).toBe(saldo(2)), { timeout: 1000, interval: 10 });
    expect(avisos.at(-1)?.saldo).toBe(saldo(2));
    // Uma linha de ganho por sessão de voz.
    expect(extrato(app!.banco, 2).filter((m) => m.tipo === 'ganho')).toHaveLength(2);
  });

  it('R-4: quem volta dentro da carência retoma a contagem do zero, numa sessão nova do extrato', async () => {
    const { tokens, ana, beto, sala } = await preparar();
    const desde = Date.now();
    await naVoz(ana, sala);
    await naVoz(beto, sala);
    await ganhou(3, 1, desde);
    beto.close();
    await esperar(50);
    const volta = await abrir(tokens.beto);
    await naVoz(volta, sala);
    await vi.waitFor(() => expect(extrato(app!.banco, 3).filter((m) => m.tipo === 'ganho')).toHaveLength(2), { timeout: 3000, interval: 10 });
  });

  it('R-4: a queda da conexão para a contagem na hora (a carência não conta)', async () => {
    const { ana, beto, sala } = await preparar();
    const desde = Date.now();
    await naVoz(ana, sala);
    await naVoz(beto, sala);
    await ganhou(2, 1, desde);
    beto.close();
    await esperar(50);
    const antes = saldo(2);
    await minutos(3);
    expect(saldo(2)).toBe(antes);
  });
});
