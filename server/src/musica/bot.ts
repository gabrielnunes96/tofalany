import type { Readable } from 'node:stream';
import { LIMITE_FILA_MUSICA, type EstadoMusica, type MusicaDto } from '@tofalando/shared';
import { ErroHttp } from '../erros.js';
import type { FluxoAudio, FonteMusica } from './fonte.js';

/** Para onde o bot manda o áudio (no servidor de verdade, um participante do LiveKit). */
export interface SaidaAudio {
  /** Toca o PCM até o fim do fluxo (ou até ele ser cortado). */
  tocar(pcm: Readable): Promise<void>;
  fechar(): Promise<void>;
}

interface Canal {
  fila: MusicaDto[];
  tocando: MusicaDto | null;
  desde: number | null;
  fluxo?: FluxoAudio;
  saida?: SaidaAudio;
  rodando: boolean;
}

/**
 * Backlog v2, item 14: bot de música. Cada canal de voz tem a sua fila; o bot entra no canal quando a primeira
 * música começa e sai quando a fila acaba, alguém manda parar ou o canal esvazia.
 */
export function criarBotMusica(deps: {
  fonte: FonteMusica;
  conectar: (canalVozId: number) => Promise<SaidaAudio>;
  aoMudar: (estado: EstadoMusica) => void;
  registrarErro: (e: unknown) => void;
  agora?: () => number;
}) {
  const agora = deps.agora ?? (() => Date.now());
  const canais = new Map<number, Canal>();

  const estado = (canalVozId: number): EstadoMusica => {
    const c = canais.get(canalVozId);
    return { canalVozId, tocando: c?.tocando ?? null, desde: c?.desde ?? null, fila: c ? [...c.fila] : [] };
  };
  const avisar = (canalVozId: number) => deps.aoMudar(estado(canalVozId));

  async function rodar(canalVozId: number, c: Canal) {
    c.rodando = true;
    try {
      while (c.fila.length > 0) {
        const musica = c.fila.shift()!;
        c.tocando = musica;
        c.desde = agora();
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
      c.tocando = null;
      c.desde = null;
      c.rodando = false;
      const saida = c.saida;
      c.saida = undefined;
      canais.delete(canalVozId);
      avisar(canalVozId);
      await saida?.fechar().catch(deps.registrarErro);
    }
  }

  return {
    estado,
    estados: (): EstadoMusica[] => [...canais.keys()].map(estado),

    /** Busca e põe na fila; se nada toca, começa. Devolve o estado depois de entrar na fila. */
    async tocar(canalVozId: number, busca: string, usuarioId: number): Promise<EstadoMusica> {
      const atual = canais.get(canalVozId);
      if (atual && atual.fila.length >= LIMITE_FILA_MUSICA) throw new ErroHttp(429, 'muitas_tentativas', `A fila já tem ${LIMITE_FILA_MUSICA} músicas.`);
      const info = await deps.fonte.buscar(busca);
      let c = canais.get(canalVozId);
      if (!c) {
        c = { fila: [], tocando: null, desde: null, rodando: false };
        canais.set(canalVozId, c);
      }
      c.fila.push({ ...info, pedidoPor: usuarioId });
      if (!c.rodando) void rodar(canalVozId, c);
      else avisar(canalVozId);
      return estado(canalVozId);
    },

    pular(canalVozId: number): EstadoMusica {
      const c = canais.get(canalVozId);
      if (!c?.tocando) throw new ErroHttp(404, 'nao_encontrado', 'Nada tocando neste canal.');
      c.fluxo?.parar();
      return estado(canalVozId);
    },

    parar(canalVozId: number): EstadoMusica {
      const c = canais.get(canalVozId);
      if (!c) return estado(canalVozId);
      c.fila = [];
      c.tocando = null;
      c.fluxo?.parar();
      return estado(canalVozId);
    },
  };
}

export type BotMusica = ReturnType<typeof criarBotMusica>;
