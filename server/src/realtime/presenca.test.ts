import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARENCIA_OFFLINE_MS_PADRAO } from '@tofalando/shared';
import { criarPresenca } from './tempo-real.js';

describe('criarPresenca (CA-55, RN-24) com relógio falso e carência padrão de 30 s', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montar() {
    const eventos: string[] = [];
    const p = criarPresenca((tipo, id, motivo) => eventos.push(`${id}:${tipo}${motivo ? `:${motivo}` : ''}`), CARENCIA_OFFLINE_MS_PADRAO);
    return { p, eventos };
  }

  it('queda de 10 s e volta: nada além do online inicial', () => {
    const { p, eventos } = montar();
    p.entrou(1);
    p.saiu(1);
    vi.advanceTimersByTime(10_000);
    p.entrou(1);
    vi.advanceTimersByTime(120_000);
    expect(eventos).toEqual(['1:online']);
  });

  it('fora por 1 minuto: offline registrado depois da carência', () => {
    const { p, eventos } = montar();
    p.entrou(1);
    p.saiu(1);
    vi.advanceTimersByTime(29_999);
    expect(eventos).toEqual(['1:online']);
    vi.advanceTimersByTime(30_001);
    expect(eventos).toEqual(['1:online', '1:offline']);
    p.entrou(1);
    expect(eventos).toEqual(['1:online', '1:offline', '1:online']);
  });

  it('várias conexões: offline só quando a última cai', () => {
    const { p, eventos } = montar();
    p.entrou(1);
    p.entrou(1);
    p.saiu(1);
    vi.advanceTimersByTime(60_000);
    expect(eventos).toEqual(['1:online']);
    p.saiu(1);
    vi.advanceTimersByTime(60_000);
    expect(eventos).toEqual(['1:online', '1:offline']);
  });

  it('desligando: quem cai é "servidor_parou"; quem estava na carência vira offline na hora', () => {
    const { p, eventos } = montar();
    p.entrou(1);
    p.entrou(2);
    p.saiu(2);
    p.iniciarFechamento();
    p.saiu(1);
    p.fechar();
    expect(eventos).toEqual(['1:online', '2:online', '1:offline:servidor_parou', '2:offline']);
    vi.advanceTimersByTime(60_000);
    expect(eventos).toHaveLength(4);
  });
});
