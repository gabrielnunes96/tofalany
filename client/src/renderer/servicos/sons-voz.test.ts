// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { criarSonsVoz, NOTAS } from './sons-voz';

function contextoFalso() {
  const osciladores: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = [];
  const no = () => ({ connect: vi.fn((d: unknown) => d) });
  const ctx = {
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setSinkId: vi.fn(async () => undefined),
    createOscillator: () => {
      const o = { ...no(), type: '', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() };
      osciladores.push(o);
      return o;
    },
    createGain: () => ({ ...no(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } }),
  };
  return { ctx, osciladores };
}

describe('sons de voz (RF-21)', () => {
  it('toca as notas de cada som na saída escolhida e marca o último', async () => {
    const { ctx, osciladores } = contextoFalso();
    const criar = vi.fn(() => ctx as never);
    const sons = criarSonsVoz(criar);
    sons.definirSaida('fone');
    expect(criar).not.toHaveBeenCalled();
    sons.tocar('entrar');
    expect(ctx.setSinkId).toHaveBeenCalledWith('fone');
    await new Promise((r) => setTimeout(r, 0));
    expect(osciladores.map((o) => o.frequency.value)).toEqual(NOTAS.entrar.freqs);
    expect(document.documentElement.dataset.somVoz).toBe('entrar:1');
    sons.tocar('sair');
    expect(document.documentElement.dataset.somVoz).toBe('sair:2');
    expect(criar).toHaveBeenCalledTimes(1);
    sons.definirSaida(null);
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('');
    sons.fechar();
    expect(ctx.close).toHaveBeenCalled();
  });

  it('erro de áudio não sobe para quem chamou', () => {
    const sons = criarSonsVoz(() => {
      throw new Error('limite de contextos');
    });
    expect(() => sons.tocar('entrar')).not.toThrow();
  });

  it('subir = entrou/desmutou, descer = saiu/mutou', () => {
    const sobe = (f: number[]) => f[1]! > f[0]!;
    expect(sobe(NOTAS.entrar.freqs) && sobe(NOTAS.desmudo.freqs)).toBe(true);
    expect(sobe(NOTAS.sair.freqs) || sobe(NOTAS.mudo.freqs)).toBe(false);
  });
});
