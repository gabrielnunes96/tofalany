import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorklet from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasm from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import type { PreferenciasAudio } from '@tofalando/shared';

/** Microfone pronto para publicar: a faixa já passou pelo tratamento escolhido. */
export interface Microfone {
  faixa: MediaStreamTrack;
  /** Qual supressão de ruído está valendo de fato. */
  supressao: 'forte' | 'basica' | 'desligada';
  /** O dispositivo escolhido não existe mais e foi usado o padrão. */
  usouPadrao: boolean;
  /** deviceId do microfone de fato aberto. */
  dispositivoId: string | undefined;
  parar(): void;
}

/** Dependências do navegador (trocadas nos testes). */
export interface DependenciasAudio {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>;
  /** Prepara o RNNoise; rejeita se não houver AudioWorklet/WASM. */
  prepararRnnoise(): Promise<{ processar(stream: MediaStream): MediaStreamTrack; fechar(): void }>;
}

/** RNNoise trabalha a 48 kHz; o WASM é baixado uma vez e reaproveitado. */
let wasmRnnoise: Promise<ArrayBuffer> | undefined;

const navegador: DependenciasAudio = {
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  async prepararRnnoise() {
    const ctx = new AudioContext({ sampleRate: 48_000 });
    try {
      wasmRnnoise ??= loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm });
      const wasmBinary = await wasmRnnoise.catch((e: unknown) => {
        wasmRnnoise = undefined;
        throw e;
      });
      await ctx.audioWorklet.addModule(rnnoiseWorklet);
      return {
        processar(stream) {
          const origem = ctx.createMediaStreamSource(stream);
          const rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
          const destino = ctx.createMediaStreamDestination();
          origem.connect(rnnoise).connect(destino);
          return destino.stream.getAudioTracks()[0]!;
        },
        fechar: () => void ctx.close().catch(() => undefined),
      };
    } catch (erro) {
      void ctx.close().catch(() => undefined);
      throw erro;
    }
  },
};

/**
 * RF-17/RF-18: abre o microfone escolhido com eco, ganho e supressão de ruído ligados ou não, cada um
 * por si. Supressão ligada tenta o RNNoise (forte); se não carregar, usa a do Chromium (básica).
 */
export async function abrirMicrofone(prefs: PreferenciasAudio, deps: DependenciasAudio = navegador): Promise<Microfone> {
  let rnnoise: Awaited<ReturnType<DependenciasAudio['prepararRnnoise']>> | undefined;
  if (prefs.supressaoRuido) {
    try {
      rnnoise = await deps.prepararRnnoise();
    } catch {
      rnnoise = undefined;
    }
  }
  const audio = (entradaId: string | null): MediaTrackConstraints => ({
    ...(entradaId ? { deviceId: { exact: entradaId } } : {}),
    echoCancellation: prefs.cancelamentoEco,
    autoGainControl: prefs.ganhoAutomatico,
    noiseSuppression: prefs.supressaoRuido && !rnnoise,
    channelCount: 1,
  });

  let stream: MediaStream;
  let usouPadrao = false;
  try {
    try {
      stream = await deps.getUserMedia({ audio: audio(prefs.entradaId), video: false });
    } catch (erro) {
      // Microfone escolhido sumiu (desconectado): usa o padrão do sistema.
      if (!prefs.entradaId || (erro as Error)?.name !== 'OverconstrainedError') throw erro;
      stream = await deps.getUserMedia({ audio: audio(null), video: false });
      usouPadrao = true;
    }
  } catch (erro) {
    rnnoise?.fechar();
    throw erro;
  }

  const bruta = stream.getAudioTracks()[0]!;
  const faixa = rnnoise ? rnnoise.processar(stream) : bruta;
  // Microfone desconectado: a faixa tratada pelo RNNoise não acaba sozinha; encerra junto.
  if (faixa !== bruta) bruta.addEventListener?.('ended', () => faixa.stop());
  return {
    faixa,
    supressao: !prefs.supressaoRuido ? 'desligada' : rnnoise ? 'forte' : 'basica',
    usouPadrao,
    dispositivoId: bruta.getSettings?.().deviceId,
    parar() {
      for (const t of stream.getTracks()) t.stop();
      if (faixa !== bruta) faixa.stop();
      rnnoise?.fechar();
    },
  };
}

/** RF-20: nível do microfone em dBFS (-100 a 0), lido de um AnalyserNode. */
export interface Medidor {
  nivelDb(): number;
  parar(): void;
}

export function criarMedidor(faixa: MediaStreamTrack): Medidor {
  const ctx = new AudioContext();
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 1024;
  ctx.createMediaStreamSource(new MediaStream([faixa])).connect(analisador);
  const amostras = new Float32Array(analisador.fftSize);
  return {
    nivelDb() {
      analisador.getFloatTimeDomainData(amostras);
      return nivelEmDb(amostras);
    },
    parar: () => void ctx.close().catch(() => undefined),
  };
}

/** RMS em dBFS, limitado a -100..0. */
export function nivelEmDb(amostras: Float32Array): number {
  let soma = 0;
  for (const a of amostras) soma += a * a;
  const rms = Math.sqrt(soma / Math.max(1, amostras.length));
  if (rms <= 0) return -100;
  return Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
}
