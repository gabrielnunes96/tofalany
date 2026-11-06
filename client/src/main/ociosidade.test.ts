import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarOciosidade } from './ociosidade';

afterEach(() => vi.useRealTimers());

describe('ociosidade (RN-25)', () => {
  it('avisa ao passar do limite e ao voltar, só quando muda', () => {
    vi.useFakeTimers();
    let ocioso = 0;
    const aoMudar = vi.fn();
    const o = criarOciosidade(() => ocioso, aoMudar, 600, 15_000);
    ocioso = 599;
    vi.advanceTimersByTime(15_000);
    expect(aoMudar).not.toHaveBeenCalled();
    ocioso = 600;
    vi.advanceTimersByTime(15_000);
    vi.advanceTimersByTime(15_000);
    expect(aoMudar.mock.calls).toEqual([[true]]);
    expect(o.ausente()).toBe(true);
    ocioso = 2;
    o.verificar();
    expect(aoMudar).toHaveBeenLastCalledWith(false);
    o.parar();
  });
});
