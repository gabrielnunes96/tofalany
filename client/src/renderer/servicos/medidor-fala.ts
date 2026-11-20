import { nivelEmDb } from './nivel';

/** Acima disto (dBFS) o áudio que chega conta como fala. */
export const LIMIAR_FALA_DB = -50;
/** Depois de baixar do limiar, a bolinha fica acesa mais um pouco (pausas entre palavras não piscam). */
export const SEGURAR_MS = 300;
const INTERVALO_MS = 60;

/** Fonte de nível: o áudio de alguém (medido aqui) ou um estado pronto (o meu, pelo portão do microfone). */
export interface FonteNivel {
  nivelDb(): number;
  parar(): void;
}

/**
 * Backlog v2, item 1: quem está falando, medido no próprio app (como o indicador do rodapé), sem esperar o
 * "quem fala" do servidor de mídia, que chega com algumas centenas de milissegundos de atraso.
 */
export function criarMedidorFala(aoMudar: (ids: string[]) => void, agora: () => number = () => performance.now()) {
  const fontes = new Map<string, FonteNivel>();
  const ultimaFala = new Map<string, number>();
  const meus = new Set<string>();
  let anterior = '';
  let relogio: ReturnType<typeof setInterval> | undefined;

  function medir() {
    const t = agora();
    for (const [id, fonte] of fontes) if (fonte.nivelDb() > LIMIAR_FALA_DB) ultimaFala.set(id, t);
    const falando = new Set<string>(meus);
    for (const [id, quando] of ultimaFala) {
      if (t - quando <= SEGURAR_MS && fontes.has(id)) falando.add(id);
      else ultimaFala.delete(id);
    }
    const lista = [...falando].sort();
    const chave = lista.join(',');
    if (chave !== anterior) {
      anterior = chave;
      aoMudar(lista);
    }
  }

  function garantirRelogio() {
    if (!relogio) relogio = setInterval(medir, INTERVALO_MS);
  }

  return {
    medir,
    adicionar(id: string, fonte: FonteNivel) {
      fontes.get(id)?.parar();
      fontes.set(id, fonte);
      garantirRelogio();
    },
    remover(id: string) {
      fontes.get(id)?.parar();
      fontes.delete(id);
      ultimaFala.delete(id);
      medir();
    },
    /** O meu microfone: o portão aberto já é "falando" (é o mesmo que acende o rodapé). */
    definirEu(id: string, falando: boolean) {
      if (!id) return;
      if (falando) meus.add(id);
      else meus.delete(id);
      garantirRelogio();
      medir();
    },
    parar() {
      if (relogio) clearInterval(relogio);
      relogio = undefined;
      for (const f of fontes.values()) f.parar();
      fontes.clear();
      ultimaFala.clear();
      meus.clear();
      if (anterior !== '') {
        anterior = '';
        aoMudar([]);
      }
    },
  };
}

/** Nível de uma faixa de áudio que chega (WebRTC), num AudioContext compartilhado. */
export function fonteDeFaixa(ctx: AudioContext, faixa: MediaStreamTrack): FonteNivel {
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  const origem = ctx.createMediaStreamSource(new MediaStream([faixa]));
  origem.connect(analisador);
  const amostras = new Float32Array(analisador.fftSize);
  return {
    nivelDb() {
      analisador.getFloatTimeDomainData(amostras);
      return nivelEmDb(amostras);
    },
    parar() {
      origem.disconnect();
    },
  };
}
