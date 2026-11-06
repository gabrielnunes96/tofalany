/** RF-21: sons curtos da voz, gerados na hora (sem arquivos). */
export type SomVoz = 'entrar' | 'sair' | 'mudo' | 'desmudo';

/** Notas (Hz) e duração de cada nota (s): subir = entrou/desmutou, descer = saiu/mutou. */
export const NOTAS: Record<SomVoz, { freqs: number[]; duracao: number }> = {
  entrar: { freqs: [587, 880], duracao: 0.09 },
  sair: { freqs: [880, 587], duracao: 0.09 },
  mudo: { freqs: [523, 392], duracao: 0.06 },
  desmudo: { freqs: [392, 523], duracao: 0.06 },
};

const VOLUME = 0.12;

export interface SonsVoz {
  tocar(som: SomVoz): void;
  /** Saída escolhida nas Configurações (RF-17); null = padrão. */
  definirSaida(id: string | null): void;
  fechar(): void;
}

type ContextoComSaida = AudioContext & { setSinkId?(id: string): Promise<void> };

export function criarSonsVoz(criarContexto: () => ContextoComSaida = () => new AudioContext()): SonsVoz {
  let ctx: ContextoComSaida | undefined;
  let saida: string | null = null;
  /** Troca de saída em andamento: o som espera, para não sair no dispositivo errado. */
  let trocandoSaida: Promise<unknown> = Promise.resolve();
  let tocados = 0;
  const contexto = () => {
    if (!ctx) {
      ctx = criarContexto();
      if (saida) trocandoSaida = ctx.setSinkId?.(saida).catch(() => undefined) ?? Promise.resolve();
    }
    return ctx;
  };
  function emitir(c: ContextoComSaida, som: SomVoz) {
    const { freqs, duracao } = NOTAS[som];
    let t = c.currentTime + 0.01;
    for (const f of freqs) {
      const osc = c.createOscillator();
      const ganho = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      // Envelope curto para não estalar.
      ganho.gain.setValueAtTime(0, t);
      ganho.gain.linearRampToValueAtTime(VOLUME, t + 0.01);
      ganho.gain.linearRampToValueAtTime(0, t + duracao);
      osc.connect(ganho).connect(c.destination);
      osc.start(t);
      osc.stop(t + duracao + 0.01);
      t += duracao;
    }
  }
  return {
    // Som é enfeite: nenhum erro de áudio (contexto indisponível, fechado) sobe para quem chamou.
    tocar(som) {
      document.documentElement.dataset.somVoz = `${som}:${++tocados}`;
      let c: ContextoComSaida;
      try {
        c = contexto();
      } catch {
        return;
      }
      void trocandoSaida.then(() => {
        try {
          void c.resume?.().catch(() => undefined);
          if (ctx === c) emitir(c, som);
        } catch {
          /* sem som */
        }
      });
    },
    definirSaida(id) {
      saida = id;
      if (ctx) trocandoSaida = ctx.setSinkId?.(id ?? '').catch(() => undefined) ?? Promise.resolve();
    },
    fechar() {
      void ctx?.close().catch(() => undefined);
      ctx = undefined;
    },
  };
}
