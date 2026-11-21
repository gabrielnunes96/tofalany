/**
 * volume-da-voz (T-1 a T-3): o nivelamento da voz enviada, depois do portão da detecção de voz.
 *
 *   portão ─┬→ compressor → cruzamento "nivelado" ─┐
 *           └──────────────→ cruzamento "direto" ──┴→ ganho do microfone → limitador → correção → faixa publicada
 *
 * Ligar e desligar o nivelamento troca os dois cruzamentos com uma rampa (sem estalo, sem religar nós). Tudo usa o
 * processamento de áudio do próprio navegador (DynamicsCompressorNode e GainNode).
 */

export interface OpcoesNivel {
  nivelar: boolean;
  /** Ganho do microfone (0,5 a 3). */
  ganho: number;
}

interface ParametrosCompressor {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
}

export interface ParametrosNivel {
  compressor: ParametrosCompressor;
  /**
   * Ganho do ramo nivelado. O compressor do navegador já aplica uma compensação automática ((1/curva(0 dBFS))^0,6 na
   * especificação do Web Audio, ~+20 dB aqui); este fator a corrige para a fala comum (−20 dBFS) sair no nível de hoje.
   */
  compensacao: number;
  /** Ganho depois do limitador, que desfaz a compensação automática dele (~+1,1 dB): o pico fica abaixo de −1 dBFS. */
  correcao: number;
  /** Peso de cada ramo (0 ou 1). */
  nivelado: number;
  direto: number;
  ganho: number;
  limitador: ParametrosCompressor;
}

/**
 * Parâmetros (T-2, ajustados na execução): compressor de voz a partir de −45 dBFS, 4:1 (com −30 dB, como na técnica, a
 * diferença entre −40 e −6 dBFS ficaria em ~16 dB e o CA-2 não passaria). Limitador em −2,5 dBFS com correção da
 * compensação automática dele. `compensacao` e `correcao` partem da fórmula da especificação e foram conferidos pela
 * medição no Chromium (E2E da T6, `e2e/nivel-voz.spec.ts`).
 */
export function parametrosNivel({ nivelar, ganho }: OpcoesNivel): ParametrosNivel {
  return {
    compressor: { threshold: -45, knee: 6, ratio: 4, attack: 0.003, release: 0.25 },
    // Fala a −20 dBFS: o compressor leva a ~−38,75 dB e a compensação automática soma ~+20,25 dB; −1,5 dB a corrige.
    compensacao: 10 ** (-1.5 / 20),
    // Limitador: curva(0 dBFS) = −2,5 + 2,5/20 = −2,375 dB → compensação automática de 2,375 × 0,6 = 1,425 dB, desfeita aqui.
    correcao: 10 ** (-1.425 / 20),
    nivelado: nivelar ? 1 : 0,
    direto: nivelar ? 0 : 1,
    ganho,
    // −2,5 dBFS: medido no Chromium (T6), o pico com ganho 300% fica perto de −1,5 dBFS (com −2, ficava em −1,06).
    limitador: { threshold: -2.5, knee: 0, ratio: 20, attack: 0, release: 0.05 },
  };
}

/** Constante de tempo das rampas: ~15 ms até o valor (três constantes de 5 ms). */
const RAMPA_S = 0.005;

/** O mínimo de um contexto de áudio que a montagem usa (o de verdade, um OfflineAudioContext ou um falso nos testes). */
export interface ContextoNivel {
  currentTime: number;
  createDynamicsCompressor(): DynamicsCompressorNode;
  createGain(): GainNode;
}

export interface Nivel {
  definir(opcoes: OpcoesNivel): void;
}

function configurar(c: DynamicsCompressorNode, p: ParametrosCompressor) {
  c.threshold.value = p.threshold;
  c.knee.value = p.knee;
  c.ratio.value = p.ratio;
  c.attack.value = p.attack;
  c.release.value = p.release;
}

/** Liga `entrada` → nivelamento → `saida` e devolve o controle ao vivo. */
export function montarNivel(ctx: ContextoNivel, entrada: AudioNode, saida: AudioNode, inicial: OpcoesNivel): Nivel {
  const p = parametrosNivel(inicial);
  const compressor = ctx.createDynamicsCompressor();
  configurar(compressor, p.compressor);
  const nivelado = ctx.createGain();
  const direto = ctx.createGain();
  const ganho = ctx.createGain();
  const limitador = ctx.createDynamicsCompressor();
  configurar(limitador, p.limitador);
  const correcao = ctx.createGain();
  correcao.gain.value = p.correcao;
  nivelado.gain.value = p.nivelado * p.compensacao;
  direto.gain.value = p.direto;
  ganho.gain.value = p.ganho;
  entrada.connect(compressor).connect(nivelado).connect(ganho);
  entrada.connect(direto).connect(ganho);
  ganho.connect(limitador).connect(correcao).connect(saida);
  return {
    definir(opcoes) {
      const n = parametrosNivel(opcoes);
      const agora = ctx.currentTime;
      nivelado.gain.setTargetAtTime(n.nivelado * n.compensacao, agora, RAMPA_S);
      direto.gain.setTargetAtTime(n.direto, agora, RAMPA_S);
      ganho.gain.setTargetAtTime(n.ganho, agora, RAMPA_S);
    },
  };
}

/** Sem grafo de áudio (reserva sem AudioWorklet, T-5): sem nivelamento nem ganho. */
export const nivelInerte: Nivel = { definir: () => undefined };
