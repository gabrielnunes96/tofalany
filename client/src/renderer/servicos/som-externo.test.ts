// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferSom, paraPcm } from './som-externo.worklet.js';
import { MENSAGEM_PORTA_SOM, escutarPortaSom, faixaDaPorta, tomarPortaSom } from './som-externo';

/** som-sistema-windows, T2: som do sistema que chega pela porta (CA-1, CA-4). */
describe('buffer do som externo (worklet)', () => {
  it('converte PCM 16 bits estéreo para float e só toca depois de juntar o mínimo', () => {
    const b = new BufferSom(16, 4);
    const esq = new Float32Array(2);
    const dir = new Float32Array(2);
    b.escrever(new Int16Array([16384, -16384, 32767, 0]));
    b.ler(esq, dir);
    // Só 2 quadros (mínimo 4): silêncio.
    expect([...esq]).toEqual([0, 0]);
    b.escrever(new Int16Array([0, 0, 8192, 8192]));
    b.ler(esq, dir);
    expect(esq[0]).toBeCloseTo(0.5);
    expect(dir[0]).toBeCloseTo(-0.5);
    expect(esq[1]).toBeCloseTo(32767 / 32768);
  });

  it('faltou som: silêncio e volta a juntar; sobrou: descarta o mais antigo', () => {
    const b = new BufferSom(4, 2);
    b.escrever(new Int16Array([1, 1, 2, 2]));
    const esq = new Float32Array(4);
    b.ler(esq, new Float32Array(4));
    expect(esq[2]).toBe(0);
    expect(b.tocando).toBe(false);
    b.escrever(new Int16Array([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]));
    expect(b.total).toBe(4);
    expect(b.descartados).toBe(2);
  });

  it('paraPcm aceita o que vem do principal (Buffer/Uint8Array desalinhado) e recusa o resto', () => {
    const bytes = new Uint8Array(9).fill(1).subarray(1);
    expect(paraPcm(bytes)?.length).toBe(4);
    expect(paraPcm(new ArrayBuffer(8))?.length).toBe(4);
    expect(paraPcm('x')).toBeNull();
    expect(paraPcm(new Uint8Array(2))).toBeNull();
  });
});

describe('porta do som do sistema', () => {
  afterEach(() => vi.useRealTimers());

  it('só aceita a porta repassada pela própria janela; quem espera recebe; sem porta no prazo, undefined', async () => {
    const parar = escutarPortaSom(window);
    const { port1 } = new MessageChannel();
    const esperando = tomarPortaSom(1000);
    window.dispatchEvent(new MessageEvent('message', { data: MENSAGEM_PORTA_SOM, source: window, ports: [port1] }));
    expect(await esperando).toBe(port1);
    // De outra origem (outro frame): ignorada.
    const { port1: estranha } = new MessageChannel();
    window.dispatchEvent(new MessageEvent('message', { data: MENSAGEM_PORTA_SOM, source: null, ports: [estranha] }));
    vi.useFakeTimers();
    const nada = tomarPortaSom(500);
    vi.advanceTimersByTime(600);
    expect(await nada).toBeUndefined();
    parar();
  });

  it('a porta vai para o worklet; a queda avisa; parar fecha tudo', async () => {
    const no = { connect: vi.fn(), disconnect: vi.fn(), port: { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: vi.fn() } };
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor() {
          return no;
        }
      },
    );
    const faixa = { stop: vi.fn() };
    const ctx = { audioWorklet: { addModule: vi.fn(async () => undefined) }, createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [faixa] } }), close: vi.fn(async () => undefined) };
    const porta = { close: vi.fn() } as unknown as MessagePort;
    const aoCair = vi.fn();
    const som = await faixaDaPorta(porta, aoCair, () => ctx as unknown as AudioContext);
    expect(no.port.postMessage).toHaveBeenCalledWith({ porta }, [porta]);
    no.port.onmessage!({ data: { erro: 'captura-caiu' } });
    expect(aoCair).toHaveBeenCalled();
    som.parar();
    expect(faixa.stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
