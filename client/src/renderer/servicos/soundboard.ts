import type { SomDto } from '@tofalando/shared';

/**
 * RF-23/RF-24: toca os sons do soundboard localmente (cada app com o próprio volume), a partir de um
 * cache baixado ao entrar na voz (R-4: latência baixa, sem mexer no microfone).
 */
export interface TocadorSoundboard {
  /** Baixa e decodifica os sons que ainda não estão no cache. */
  carregar(sons: SomDto[]): Promise<void>;
  /** Toca com o volume (0 a 1); devolve se tocou. */
  tocar(som: SomDto, volume: number): Promise<boolean>;
  definirSaida(id: string | null): void;
  /** Para os sons tocando agora (deafen, saiu da voz). */
  parar(): void;
  /** Tira do cache os sons que não existem mais. */
  esquecer(atuais: SomDto[]): void;
  fechar(): void;
}

type ContextoComSaida = AudioContext & { setSinkId?(id: string): Promise<void> };

export function criarTocadorSoundboard(
  servidorUrl: string,
  buscar: (url: string) => Promise<ArrayBuffer> = async (url) => (await fetch(url)).arrayBuffer(),
  criarContexto: () => ContextoComSaida = () => new AudioContext(),
): TocadorSoundboard {
  let ctx: ContextoComSaida | undefined;
  let fechado = false;
  const tocando = new Set<AudioBufferSourceNode>();
  let saida: string | null = null;
  let trocandoSaida: Promise<unknown> = Promise.resolve();
  const cache = new Map<string, Promise<AudioBuffer>>();
  const contexto = () => {
    // Download que termina depois de fechar não pode abrir outro contexto.
    if (fechado) throw new Error('Tocador fechado.');
    if (!ctx) {
      ctx = criarContexto();
      if (saida) trocandoSaida = ctx.setSinkId?.(saida).catch(() => undefined) ?? Promise.resolve();
    }
    return ctx;
  };
  function buffer(som: SomDto) {
    let p = cache.get(som.url);
    if (!p) {
      p = buscar(`${servidorUrl}${som.url}`).then((dados) => contexto().decodeAudioData(dados));
      // Falhou (rede): sai do cache para tentar de novo depois.
      p.catch(() => cache.delete(som.url));
      cache.set(som.url, p);
    }
    return p;
  }
  return {
    async carregar(sons) {
      await Promise.allSettled(sons.map(buffer));
    },
    async tocar(som, volume) {
      if (volume <= 0) return false;
      try {
        const b = await buffer(som);
        await trocandoSaida;
        const c = contexto();
        await c.resume?.().catch(() => undefined);
        const fonte = c.createBufferSource();
        const ganho = c.createGain();
        fonte.buffer = b;
        ganho.gain.value = volume;
        fonte.connect(ganho).connect(c.destination);
        tocando.add(fonte);
        fonte.onended = () => tocando.delete(fonte);
        fonte.start();
        return true;
      } catch {
        return false;
      }
    },
    definirSaida(id) {
      saida = id;
      if (ctx) trocandoSaida = ctx.setSinkId?.(id ?? '').catch(() => undefined) ?? Promise.resolve();
    },
    parar() {
      for (const f of tocando) {
        try {
          f.stop();
        } catch {
          /* já tinha acabado */
        }
      }
      tocando.clear();
    },
    esquecer(atuais) {
      const urls = new Set(atuais.map((s) => s.url));
      for (const url of [...cache.keys()]) if (!urls.has(url)) cache.delete(url);
    },
    fechar() {
      fechado = true;
      tocando.clear();
      cache.clear();
      void ctx?.close().catch(() => undefined);
      ctx = undefined;
    },
  };
}
