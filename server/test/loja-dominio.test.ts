import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { qualidadesDosVales, VALE_MS } from '@tofalando/shared';
import { comprar, creditar, estadoLoja, extrato, qualidadesDaLoja } from '../src/dominio/loja.js';
import { lerConfig } from '../src/config.js';
import { appTeste, cadastrar } from './apoio.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const precos = lerConfig({}).pontos.precos;
const DIA = 24 * 60 * 60 * 1000;
const DIA_1 = Date.UTC(2026, 10, 1, 21, 30);

/** dono (1ª conta, administrador da instalação) e ana (membro). */
async function preparar() {
  app = await appTeste();
  await cadastrar(app, 'dono');
  const ana = (await cadastrar(app, 'ana')).json().usuario.id as number;
  return { banco: app.banco, ana, dono: 1 };
}

describe('domínio da loja (pontos-e-loja)', () => {
  it('CA-26: a loja nasce vazia, sem pontos retroativos', async () => {
    const { banco, ana } = await preparar();
    for (const tabela of ['pontos_saldos', 'pontos_movimentos', 'loja_temas', 'loja_vales']) {
      expect(banco.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get()).toEqual({ n: 0 });
    }
    expect(estadoLoja(banco, ana)).toEqual({ saldo: 0, temas: [], vales: [], tudoLiberado: false });
  });

  it('crédito por sessão: a mesma linha de ganho soma os minutos; sessão nova abre outra', async () => {
    const { banco, ana } = await preparar();
    const id = creditar(banco, ana, 1, null, DIA_1);
    expect(creditar(banco, ana, 2, id, DIA_1 + 60_000)).toBe(id);
    expect(creditar(banco, ana, 0, null, DIA_1 + 60_000)).toBeNull();
    const outra = creditar(banco, ana, 4, null, DIA_1 + 120_000);
    expect(outra).not.toBe(id);
    expect(estadoLoja(banco, ana).saldo).toBe(7);
    expect(extrato(banco, ana).map((m) => [m.tipo, m.valor])).toEqual([
      ['ganho', 4],
      ['ganho', 3],
    ]);
  });

  it('CA-12: vale comprado no dia 1 vale até o dia 8 na mesma hora; outro no dia 3 estende até o dia 15', async () => {
    const { banco, ana } = await preparar();
    creditar(banco, ana, 1200, null, DIA_1);
    comprar(banco, ana, { tipo: 'vale', qualidade: '1080p60' }, precos, DIA_1);
    expect(estadoLoja(banco, ana, DIA_1).vales).toEqual([{ qualidade: '1080p60', expiraEm: DIA_1 + 7 * DIA }]);
    const r = comprar(banco, ana, { tipo: 'vale', qualidade: '1080p60' }, precos, DIA_1 + 2 * DIA);
    expect(r.estado.vales).toEqual([{ qualidade: '1080p60', expiraEm: DIA_1 + 14 * DIA }]);
    expect(r.estado.saldo).toBe(0);
  });

  it('CA-13: vale vencido no dia 8, comprado de novo no dia 10, vale até o dia 17', async () => {
    const { banco, ana } = await preparar();
    creditar(banco, ana, 1200, null, DIA_1);
    comprar(banco, ana, { tipo: 'vale', qualidade: '720p60' }, precos, DIA_1);
    expect(estadoLoja(banco, ana, DIA_1 + 8 * DIA).vales).toEqual([]);
    const r = comprar(banco, ana, { tipo: 'vale', qualidade: '720p60' }, precos, DIA_1 + 9 * DIA);
    expect(r.estado.vales).toEqual([{ qualidade: '720p60', expiraEm: DIA_1 + 16 * DIA }]);
  });

  it('RN-9: o vale de 1080p60 também libera 720p60 e 1080p30; vencido não libera nada', async () => {
    expect(qualidadesDosVales([{ qualidade: '1080p60', expiraEm: DIA_1 + VALE_MS }], DIA_1)).toEqual(['720p60', '1080p30', '1080p60']);
    expect(qualidadesDosVales([{ qualidade: '1080p30', expiraEm: DIA_1 + 1 }], DIA_1)).toEqual(['1080p30']);
    expect(qualidadesDosVales([{ qualidade: '1080p60', expiraEm: DIA_1 }], DIA_1)).toEqual([]);
    const { banco, ana, dono } = await preparar();
    expect(qualidadesDaLoja(banco, ana)).toEqual([]);
    expect(qualidadesDaLoja(banco, dono)).toEqual(['720p60', '1080p30', '1080p60']);
  });

  it('compra: sem saldo nada muda; tema não se compra duas vezes; o administrador da instalação tem tudo', async () => {
    const { banco, ana, dono } = await preparar();
    creditar(banco, ana, 500, null, DIA_1);
    expect(() => comprar(banco, ana, { tipo: 'tema', tema: 'cinzas' }, precos, DIA_1)).toThrow('Faltam 100 pontos.');
    expect(estadoLoja(banco, ana)).toMatchObject({ saldo: 500, temas: [] });
    creditar(banco, ana, 700, null, DIA_1);
    expect(comprar(banco, ana, { tipo: 'tema', tema: 'cinzas' }, precos, DIA_1).estado).toMatchObject({ saldo: 600, temas: ['cinzas'] });
    expect(() => comprar(banco, ana, { tipo: 'tema', tema: 'cinzas' }, precos, DIA_1)).toThrow('Você já tem este tema.');
    expect(estadoLoja(banco, ana).saldo).toBe(600);
    expect(extrato(banco, ana).filter((m) => m.tipo === 'compra')).toHaveLength(1);
    comprar(banco, ana, { tipo: 'vale', qualidade: '1080p60' }, precos, DIA_1);
    expect(() => comprar(banco, ana, { tipo: 'vale', qualidade: '720p60' }, precos, DIA_1)).toThrow('Faltam 200 pontos.');
    expect(estadoLoja(banco, ana, DIA_1)).toMatchObject({ saldo: 0, vales: [{ qualidade: '1080p60' }] });
    expect(estadoLoja(banco, dono).tudoLiberado).toBe(true);
    expect(() => comprar(banco, dono, { tipo: 'tema', tema: 'gibi' }, precos, DIA_1)).toThrow('O administrador já tem tudo liberado.');
  });

  it('CA-22: extrato do mais novo para o mais antigo, e a soma bate com o saldo', async () => {
    const { banco, ana } = await preparar();
    creditar(banco, ana, 900, null, DIA_1);
    comprar(banco, ana, { tipo: 'tema', tema: 'arcano' }, precos, DIA_1 + 1);
    comprar(banco, ana, { tipo: 'vale', qualidade: '720p60' }, precos, DIA_1 + 2);
    const linhas = extrato(banco, ana);
    expect(linhas.map((m) => [m.tipo, m.item, m.valor])).toEqual([
      ['compra', 'vale:720p60', -200],
      ['compra', 'tema:arcano', -600],
      ['ganho', null, 900],
    ]);
    expect(linhas.reduce((s, m) => s + m.valor, 0)).toBe(estadoLoja(banco, ana).saldo);
    expect(extrato(banco, ana, { antes: linhas[0]!.id, limite: 1 }).map((m) => m.item)).toEqual(['tema:arcano']);
    expect(extrato(banco, ana, { limite: Number.NaN })).toHaveLength(3);
  });
});
