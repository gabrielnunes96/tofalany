import { describe, expect, it, vi } from 'vitest';
import { criarTocadorSoundboard } from './soundboard';

function contexto() {
  const fontes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown }[] = [];
  const ganhos: { gain: { value: number } }[] = [];
  const ctx = {
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setSinkId: vi.fn(async () => undefined),
    decodeAudioData: vi.fn(async (d: ArrayBuffer) => ({ decodificado: d.byteLength })),
    createBufferSource: () => {
      const f = { connect: (d: unknown) => d, start: vi.fn(), stop: vi.fn(), onended: null as unknown, buffer: null as unknown };
      fontes.push(f);
      return f;
    },
    createGain: () => {
      const g = { connect: (d: unknown) => d, gain: { value: 1 } };
      ganhos.push(g);
      return g;
    },
  };
  return { ctx, fontes, ganhos };
}

const som = { id: 1, nome: 'Grilo', url: '/files/a.wav', duracaoMs: 1000 };

describe('tocador do soundboard (RF-23, RF-24)', () => {
  it('baixa uma vez, toca com o volume local e na saída escolhida; volume 0 não toca', async () => {
    const { ctx, fontes, ganhos } = contexto();
    const buscar = vi.fn(async () => new ArrayBuffer(8));
    const t = criarTocadorSoundboard('http://s', buscar, () => ctx as never);
    t.definirSaida('fone');
    await t.carregar([som]);
    expect(buscar).toHaveBeenCalledWith('http://s/files/a.wav');
    expect(ctx.setSinkId).toHaveBeenCalledWith('fone');
    expect(await t.tocar(som, 0.4)).toBe(true);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(fontes[0]!.start).toHaveBeenCalled();
    expect(fontes[0]!.buffer).toEqual({ decodificado: 8 });
    expect(ganhos[0]!.gain.value).toBe(0.4);
    expect(await t.tocar(som, 0)).toBe(false);
    expect(fontes).toHaveLength(1);
  });

  it('parar interrompe o que toca; esquecer limpa o cache; fechar durante o download não abre contexto', async () => {
    const { ctx, fontes } = contexto();
    let liberar!: (b: ArrayBuffer) => void;
    const buscar = vi.fn().mockResolvedValueOnce(new ArrayBuffer(8)).mockImplementationOnce(() => new Promise((r) => (liberar = r)));
    const criar = vi.fn(() => ctx as never);
    const t = criarTocadorSoundboard('http://s', buscar, criar);
    await t.tocar(som, 1);
    t.parar();
    expect(fontes[0]!.stop).toHaveBeenCalled();
    t.esquecer([]);
    const outro = { ...som, url: '/files/b.wav' };
    const tocando = t.tocar(outro, 1);
    t.fechar();
    liberar(new ArrayBuffer(4));
    expect(await tocando).toBe(false);
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('falha de rede não toca e tenta baixar de novo depois', async () => {
    const { ctx } = contexto();
    const buscar = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue(new ArrayBuffer(4));
    const t = criarTocadorSoundboard('http://s', buscar, () => ctx as never);
    expect(await t.tocar(som, 1)).toBe(false);
    expect(await t.tocar(som, 1)).toBe(true);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});
