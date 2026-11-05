import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorklet from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasm from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasm from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import portaoWorklet from './portao-voz.worklet.js?url';
import type { PreferenciasAudio } from '@tofalando/shared';

/** Estado do portão do microfone (RF-14, RF-16). */
export interface EstadoPortao {
  modo?: 'deteccao' | 'ptt';
  limiarDb?: number;
  /** Atalho de push-to-talk apertado. */
  ptt?: boolean;
  mudo?: boolean;
}

export interface Portao {
  definir(estado: EstadoPortao): void;
  /** Avisa quando passa a transmitir ou para. Devolve a função que para de ouvir. */
  aoMudar(fn: (aberto: boolean) => void): () => void;
}

/** Microfone pronto para publicar: a faixa já passou pelo tratamento e pelo portão. */
export interface Microfone {
  faixa: MediaStreamTrack;
  /** Antes do portão: o que o medidor mostra (para comparar com a marca da sensibilidade). */
  faixaMedicao: MediaStreamTrack;
  portao: Portao;
  /** Qual supressão de ruído está valendo de fato. */
  supressao: 'forte' | 'basica' | 'desligada';
  /** O dispositivo escolhido não existe mais e foi usado o padrão. */
  usouPadrao: boolean;
  /** deviceId do microfone de fato aberto. */
  dispositivoId: string | undefined;
  parar(): void;
}

/** Grafo de áudio montado sobre o microfone. */
export interface Grafo {
  processar(stream: MediaStream): { faixa: MediaStreamTrack; faixaMedicao: MediaStreamTrack; portao: Portao };
  fechar(): void;
}

/** Dependências do navegador (trocadas nos testes). */
export interface DependenciasAudio {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>;
  /** Prepara o grafo (com RNNoise ou não); rejeita se faltar AudioWorklet/WASM. */
  prepararGrafo(rnnoise: boolean): Promise<Grafo>;
}

/** O WASM do RNNoise é baixado uma vez e reaproveitado. */
let wasmRnnoise: Promise<ArrayBuffer> | undefined;

const navegador: DependenciasAudio = {
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  async prepararGrafo(comRnnoise) {
    // RNNoise trabalha a 48 kHz.
    const ctx = new AudioContext({ sampleRate: 48_000 });
    try {
      let wasmBinary: ArrayBuffer | undefined;
      if (comRnnoise) {
        wasmRnnoise ??= loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm });
        wasmBinary = await wasmRnnoise.catch((e: unknown) => {
          wasmRnnoise = undefined;
          throw e;
        });
        await ctx.audioWorklet.addModule(rnnoiseWorklet);
      }
      await ctx.audioWorklet.addModule(portaoWorklet);
      return {
        processar(stream) {
          const origem = ctx.createMediaStreamSource(stream);
          const tratado: AudioNode = wasmBinary ? origem.connect(new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })) : origem;
          const medicao = ctx.createMediaStreamDestination();
          tratado.connect(medicao);
          const no = new AudioWorkletNode(ctx, 'portao-voz', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
          const destino = ctx.createMediaStreamDestination();
          tratado.connect(no).connect(destino);
          const ouvintes = new Set<(aberto: boolean) => void>();
          no.port.onmessage = (e: MessageEvent<{ aberto: boolean }>) => {
            for (const fn of ouvintes) fn(e.data.aberto);
          };
          return {
            faixa: destino.stream.getAudioTracks()[0]!,
            faixaMedicao: medicao.stream.getAudioTracks()[0]!,
            portao: {
              definir: (estado) => no.port.postMessage(estado),
              aoMudar(fn) {
                ouvintes.add(fn);
                return () => ouvintes.delete(fn);
              },
            },
          };
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
 * por si, e passa pelo portão (RF-14). Supressão ligada tenta o RNNoise (forte); se não carregar, usa a
 * do Chromium (básica).
 */
export async function abrirMicrofone(prefs: PreferenciasAudio, deps: DependenciasAudio = navegador): Promise<Microfone> {
  let grafo: Grafo | undefined;
  let forte = false;
  if (prefs.supressaoRuido) {
    try {
      grafo = await deps.prepararGrafo(true);
      forte = true;
    } catch {
      grafo = undefined;
    }
  }
  // Sem AudioWorklet (ou bloqueado): microfone direto, sem portão — o mute e o PTT viram liga/desliga da faixa.
  if (!grafo) grafo = await deps.prepararGrafo(false).catch(() => undefined);

  const audio = (entradaId: string | null): MediaTrackConstraints => ({
    ...(entradaId ? { deviceId: { exact: entradaId } } : {}),
    echoCancellation: prefs.cancelamentoEco,
    autoGainControl: prefs.ganhoAutomatico,
    noiseSuppression: prefs.supressaoRuido && !forte,
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
    grafo?.fechar();
    throw erro;
  }

  const bruta = stream.getAudioTracks()[0]!;
  const { faixa, faixaMedicao, portao } = grafo ? grafo.processar(stream) : semPortao(bruta);
  portao.definir({ modo: prefs.modoMicrofone, limiarDb: prefs.sensibilidadeDb });
  // Microfone desconectado: as faixas do grafo não acabam sozinhas; encerra junto.
  bruta.addEventListener?.('ended', () => {
    faixa.stop();
    faixaMedicao.stop();
  });
  return {
    faixa,
    faixaMedicao,
    portao,
    supressao: !prefs.supressaoRuido ? 'desligada' : forte ? 'forte' : 'basica',
    usouPadrao,
    dispositivoId: bruta.getSettings?.().deviceId,
    parar() {
      for (const t of stream.getTracks()) t.stop();
      faixa.stop();
      faixaMedicao.stop();
      grafo?.fechar();
    },
  };
}

/** Reserva sem AudioWorklet: a própria faixa liga e desliga (sem detecção de voz). */
function semPortao(bruta: MediaStreamTrack): ReturnType<Grafo['processar']> {
  const estado: Required<EstadoPortao> = { modo: 'deteccao', limiarDb: -50, ptt: false, mudo: false };
  return {
    faixa: bruta,
    faixaMedicao: bruta,
    portao: {
      definir(e) {
        Object.assign(estado, e);
        bruta.enabled = !estado.mudo && (estado.modo !== 'ptt' || estado.ptt);
      },
      aoMudar: () => () => undefined,
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
