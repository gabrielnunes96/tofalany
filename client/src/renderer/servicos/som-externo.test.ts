// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferSom, paraPcm } from './som-externo.worklet.js';
import { MENSAGEM_PORTA_SOM, descartarPortaSom, escutarPortaSom, faixaDaPorta, tomarPortaSom } from './som-externo';

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

  const entregar = (porta: MessagePort, source: Window | null = window) =>
    window.dispatchEvent(new MessageEvent('message', { data: MENSAGEM_PORTA_SOM, source, ports: [porta] }));

  it('só aceita a porta da própria janela, durante uma escolha; quem espera recebe; sem porta no prazo, undefined', async () => {
    const parar = escutarPortaSom(window);
    // Duas telas montadas: um ouvinte só (a porta não é fechada pela segunda).
    const parar2 = escutarPortaSom(window);
    descartarPortaSom();
    const { port1 } = new MessageChannel();
    const fechar = vi.spyOn(port1, 'close');
    entregar(port1);
    expect(await tomarPortaSom(1000)).toBe(port1);
    expect(fechar).not.toHaveBeenCalled();
    // De outro frame: ignorada.
    descartarPortaSom();
    const { port1: estranha } = new MessageChannel();
    entregar(estranha, null);
    vi.useFakeTimers();
    const nada = tomarPortaSom(500);
    vi.advanceTimersByTime(600);
    expect(await nada).toBeUndefined();
    parar();
    parar2();
  });

  it('RN-7: porta que chega fora de uma escolha (depois do prazo) é fechada; a que sobrou é descartada na escolha seguinte', async () => {
    const parar = escutarPortaSom(window);
    const { port1: tarde } = new MessageChannel();
    const fecharTarde = vi.spyOn(tarde, 'close');
    entregar(tarde);
    expect(fecharTarde).toHaveBeenCalled();
    descartarPortaSom();
    const { port1: sobra } = new MessageChannel();
    const fecharSobra = vi.spyOn(sobra, 'close');
    entregar(sobra);
    descartarPortaSom();
    expect(fecharSobra).toHaveBeenCalled();
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
    // O worklet fecha a porta: o principal para a captura.
    expect(no.port.postMessage).toHaveBeenLastCalledWith({ fechar: true });
    expect(faixa.stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
