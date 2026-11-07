import type { Readable } from 'node:stream';
import { LIMITE_CANAIS_MUSICA, LIMITE_FILA_MUSICA, type EstadoMusica, type MusicaDto } from '@tofalando/shared';
import { ErroHttp } from '../erros.js';
import type { FluxoAudio, FonteMusica, InfoMusica } from './fonte.js';

/** Para onde o bot manda o áudio (no servidor de verdade, um participante do LiveKit). */
export interface SaidaAudio {
  /** Toca o PCM até o fim do fluxo (ou até ele ser cortado). */
  tocar(pcm: Readable): Promise<void>;
  /** Segura o envio do áudio (pausa) e solta de novo. */
  pausar?(): void;
  continuar?(): void;
  fechar(): Promise<void>;
}

interface Canal {
  fila: MusicaDto[];
  tocando: MusicaDto | null;
  desde: number | null;
  pausado: boolean;
  /** Tempo já tocado da música atual quando pausou (para o relógio continuar de onde parou). */
  decorrido: number;
  fluxo?: FluxoAudio;
  saida?: SaidaAudio;
  rodando: boolean;
  /** Sem música: o bot espera um pouco na sala antes de sair sozinho. */
  ocioso?: NodeJS.Timeout;
}

/** Quanto o ToOuvini espera na sala, sem tocar nada, antes de sair sozinho. */
export const ESPERA_OCIOSO_MS = 3 * 60 * 1000;

/**
 * Backlog v2, item 14: o ToOuvini, bot de música. Cada canal de voz (de qualquer servidor) tem a sua fila; o bot
 * entra no canal na primeira música, pausa e continua, pula, para (e espera um pouco na sala) e sai com /kick ou
 * quando fica ocioso. Toca em até LIMITE_CANAIS_MUSICA canais ao mesmo tempo.
 */
export function criarBotMusica(deps: {
  fonte: FonteMusica;
  conectar: (canalVozId: number) => Promise<SaidaAudio>;
  aoMudar: (estado: EstadoMusica) => void;
  registrarErro: (e: unknown) => void;
  agora?: () => number;
  esperaOciosoMs?: number;
}) {
  const agora = deps.agora ?? (() => Date.now());
  const espera = deps.esperaOciosoMs ?? ESPERA_OCIOSO_MS;
  const canais = new Map<number, Canal>();

  const estado = (canalVozId: number): EstadoMusica => {
    const c = canais.get(canalVozId);
    return {
      canalVozId,
      tocando: c?.tocando ?? null,
      desde: c?.desde ?? null,
      fila: c ? [...c.fila] : [],
      pausado: c?.pausado ?? false,
      conectado: !!c?.saida,
    };
  };
  const avisar = (canalVozId: number) => deps.aoMudar(estado(canalVozId));

  async function sair(canalVozId: number, c: Canal) {
    clearTimeout(c.ocioso);
    c.fila = [];
    c.tocando = null;
    c.fluxo?.parar();
    const saida = c.saida;
    c.saida = undefined;
    canais.delete(canalVozId);
    avisar(canalVozId);
    await saida?.fechar().catch(deps.registrarErro);
  }

  function esperarOcioso(canalVozId: number, c: Canal) {
    clearTimeout(c.ocioso);
    if (!c.saida) {
      canais.delete(canalVozId);
      return;
    }
    c.ocioso = setTimeout(() => void sair(canalVozId, c), espera);
    c.ocioso.unref?.();
  }

  async function rodar(canalVozId: number, c: Canal) {
    c.rodando = true;
    clearTimeout(c.ocioso);
    try {
      while (c.fila.length > 0 && canais.get(canalVozId) === c) {
        const musica = c.fila.shift()!;
        c.tocando = musica;
        c.desde = agora();
        c.decorrido = 0;
        c.pausado = false;
        avisar(canalVozId);
        try {
          c.saida ??= await deps.conectar(canalVozId);
          // Mandaram parar enquanto conectava.
          if (c.tocando !== musica) continue;
          c.fluxo = deps.fonte.abrir(musica.url);
          await c.saida.tocar(c.fluxo.audio);
        } catch (erro) {
          deps.registrarErro(erro);
        } finally {
          c.fluxo?.parar();
          c.fluxo = undefined;
        }
      }
    } finally {
      c.rodando = false;
      if (canais.get(canalVozId) === c) {
        c.tocando = null;
        c.desde = null;
        c.pausado = false;
        avisar(canalVozId);
        esperarOcioso(canalVozId, c);
      }
    }
  }

  const exigirTocando = (canalVozId: number): Canal => {
    const c = canais.get(canalVozId);
    if (!c?.tocando) throw new ErroHttp(404, 'nao_encontrado', 'Nada tocando neste canal.');
    return c;
  };

  return {
    estado,
    estados: (): EstadoMusica[] => [...canais.keys()].map(estado),

    /** Busca (uma música ou uma playlist) e põe na fila; se nada toca, começa. */
    async tocar(canalVozId: number, busca: string, usuarioId: number): Promise<EstadoMusica> {
      const atual = canais.get(canalVozId);
      // Vários servidores e canais ao mesmo tempo, até um limite (cada um é um download e uma conversão).
      if (!atual && canais.size >= LIMITE_CANAIS_MUSICA) throw new ErroHttp(429, 'muitas_tentativas', `O ToOuvini já está tocando em ${LIMITE_CANAIS_MUSICA} canais. Tente quando um terminar.`);
      const espaco = LIMITE_FILA_MUSICA - (atual?.fila.length ?? 0);
      if (espaco <= 0) throw new ErroHttp(429, 'muitas_tentativas', `A fila já tem ${LIMITE_FILA_MUSICA} músicas.`);
      const infos: InfoMusica[] = deps.fonte.buscarVarias ? await deps.fonte.buscarVarias(busca, espaco) : [await deps.fonte.buscar(busca)];
      if (infos.length === 0) throw new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.');
      let c = canais.get(canalVozId);
      if (!c) {
        c = { fila: [], tocando: null, desde: null, pausado: false, decorrido: 0, rodando: false };
        canais.set(canalVozId, c);
      }
      c.fila.push(...infos.slice(0, espaco).map((i) => ({ ...i, pedidoPor: usuarioId })));
      if (!c.rodando) void rodar(canalVozId, c);
      else avisar(canalVozId);
      return estado(canalVozId);
    },

    pausar(canalVozId: number): EstadoMusica {
      const c = exigirTocando(canalVozId);
      if (!c.pausado) {
        c.pausado = true;
        c.decorrido = agora() - (c.desde ?? agora());
        c.saida?.pausar?.();
        avisar(canalVozId);
      }
      return estado(canalVozId);
    },

    continuar(canalVozId: number): EstadoMusica {
      const c = exigirTocando(canalVozId);
      if (c.pausado) {
        c.pausado = false;
        c.desde = agora() - c.decorrido;
        c.saida?.continuar?.();
        avisar(canalVozId);
      }
      return estado(canalVozId);
    },

    pular(canalVozId: number): EstadoMusica {
      const c = exigirTocando(canalVozId);
      if (c.pausado) {
        c.pausado = false;
        c.saida?.continuar?.();
      }
      c.fluxo?.parar();
      return estado(canalVozId);
    },

    /** Para e limpa a fila; o bot fica na sala esperando (sai sozinho se ninguém pedir nada). */
    parar(canalVozId: number): EstadoMusica {
      const c = canais.get(canalVozId);
      if (!c) return estado(canalVozId);
      c.fila = [];
      c.tocando = null;
      if (c.pausado) {
        c.pausado = false;
        c.saida?.continuar?.();
      }
      c.fluxo?.parar();
      if (!c.rodando) {
        avisar(canalVozId);
        esperarOcioso(canalVozId, c);
      }
      return estado(canalVozId);
    },

    /** Tira o bot da sala na hora. */
    async expulsar(canalVozId: number): Promise<EstadoMusica> {
      const c = canais.get(canalVozId);
      if (c) await sair(canalVozId, c);
      return estado(canalVozId);
    },
  };
}

export type BotMusica = ReturnType<typeof criarBotMusica>;
