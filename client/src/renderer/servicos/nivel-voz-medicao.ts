import { montarNivel, type OpcoesNivel } from './nivel-voz';

const TAXA = 48_000;
const DURACAO_S = 1.5;

export interface MedidaNivel {
  entradaDb: number;
  /** Nível de saída, como o pico de uma senoide de mesmo RMS (comparável à entrada), na parte estável do sinal. */
  saidaDb: number;
  /** Maior amostra (em dBFS) em todo o trecho, inclusive no começo, antes de o compressor agir. */
  picoDb: number;
}

const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

/**
 * volume-da-voz (T-6): passa uma senoide de 440 Hz em cada nível (dBFS de pico) pelo mesmo nivelamento do microfone,
 * num OfflineAudioContext, e mede a saída. Usado pelo E2E (só no modo de teste).
 */
export async function medirNivel(opcoes: OpcoesNivel, niveisDb: number[]): Promise<MedidaNivel[]> {
  const medidas: MedidaNivel[] = [];
  for (const entradaDb of niveisDb) {
    const ctx = new OfflineAudioContext(1, Math.round(TAXA * DURACAO_S), TAXA);
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const amplitude = ctx.createGain();
    amplitude.gain.value = 10 ** (entradaDb / 20);
    osc.connect(amplitude);
    montarNivel(ctx, amplitude, ctx.destination, opcoes);
    osc.start();
    const saida = (await ctx.startRendering()).getChannelData(0);
    let pico = 0;
    for (const v of saida) pico = Math.max(pico, Math.abs(v));
    // Parte estável: o último meio segundo (depois do ataque e da soltura do compressor).
    const estavel = saida.subarray(Math.round(TAXA * (DURACAO_S - 0.5)));
    let soma = 0;
    for (const v of estavel) soma += v * v;
    const rms = Math.sqrt(soma / estavel.length);
    medidas.push({ entradaDb, saidaDb: db(rms * Math.SQRT2), picoDb: db(pico) });
  }
  return medidas;
}
