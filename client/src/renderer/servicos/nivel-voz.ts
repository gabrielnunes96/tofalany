/**
 * volume-da-voz (T-1 a T-3): o nivelamento da voz enviada, depois do portão da detecção de voz.
 *
 *   portão ─┬→ compressor → cruzamento "nivelado" ─┐
 *           └──────────────→ cruzamento "direto" ──┴→ ganho do microfone → limitador → faixa publicada
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
  /** Ganho do ramo nivelado, além da compensação automática do compressor do navegador (ajustada pela medição do E2E). */
  compensacao: number;
  /** Peso de cada ramo (0 ou 1). */
  nivelado: number;
  direto: number;
  ganho: number;
  limitador: ParametrosCompressor;
}

/**
 * Parâmetros (T-2). Compressor de voz: a partir de −45 dBFS, 4:1, ataque rápido, soltura de 250 ms. Limitador em
 * −2 dBFS (o nativo não é rígido: a margem mantém o pico abaixo de −1 dBFS).
 */
export function parametrosNivel({ nivelar, ganho }: OpcoesNivel): ParametrosNivel {
  return {
    compressor: { threshold: -45, knee: 6, ratio: 4, attack: 0.003, release: 0.25 },
    compensacao: 1,
    nivelado: nivelar ? 1 : 0,
    direto: nivelar ? 0 : 1,
    ganho,
    limitador: { threshold: -2, knee: 0, ratio: 20, attack: 0, release: 0.05 },
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
  nivelado.gain.value = p.nivelado * p.compensacao;
  direto.gain.value = p.direto;
  ganho.gain.value = p.ganho;
  entrada.connect(compressor).connect(nivelado).connect(ganho);
  entrada.connect(direto).connect(ganho);
  ganho.connect(limitador).connect(saida);
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
