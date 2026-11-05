import { io, type Socket } from 'socket.io-client';
import {
  ERRO_HANDSHAKE_NAO_AUTENTICADO,
  type EventosCliente,
  type EventosServidor,
  type MotivoRevogacao,
  type OlaPayload,
} from '@tofalando/shared';

export type EstadoConexao = 'conectando' | 'conectado' | 'reconectando';

export interface OuvintesTempoReal {
  aoEstado(estado: EstadoConexao): void;
  aoOla(payload: OlaPayload): void;
  /** A sessão não vale mais: não tenta reconectar. */
  aoRevogada(motivo: MotivoRevogacao): void;
}

export type SocketTofalando = Socket<EventosServidor, EventosCliente>;
type Fabrica = (url: string, opcoes: Parameters<typeof io>[1]) => SocketTofalando;

/** Avisos de rede do sistema (window online/offline); injetável para teste. */
export interface Rede {
  aoMudar(fn: (online: boolean) => void): () => void;
}

const redeDoNavegador: Rede = {
  aoMudar(fn) {
    if (typeof window === 'undefined') return () => undefined;
    const online = () => fn(true);
    const offline = () => fn(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  },
};

/** Conexão em tempo real com reconexão automática (RF-31). Devolve a função que desconecta. */
export function conectarTempoReal(
  url: string,
  token: string,
  ouvintes: OuvintesTempoReal,
  fabrica: Fabrica = io,
  rede: Rede = redeDoNavegador,
): () => void {
  let encerrada = false;
  const socket = fabrica(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  });

  const revogar = (motivo: MotivoRevogacao) => {
    if (encerrada) return;
    encerrada = true;
    socket.disconnect();
    ouvintes.aoRevogada(motivo);
  };

  ouvintes.aoEstado('conectando');
  socket.on('connect', () => ouvintes.aoEstado('conectado'));
  socket.on('ola', (payload) => ouvintes.aoOla(payload));
  socket.on('sessao:revogada', ({ motivo }) => revogar(motivo));
  socket.on('connect_error', (erro) => {
    if (erro.message === ERRO_HANDSHAKE_NAO_AUTENTICADO) revogar('sessao_invalida');
    else if (!encerrada) ouvintes.aoEstado('reconectando');
  });
  socket.on('disconnect', (motivo) => {
    if (encerrada) return;
    // "io server disconnect" sem aviso de revogação: o servidor encerrou; reconecta à mão.
    if (motivo === 'io server disconnect') socket.connect();
    ouvintes.aoEstado('reconectando');
  });

  // O sistema avisa a perda de rede antes do batimento: mostra "reconectando" na hora.
  const pararRede = rede.aoMudar((online) => {
    if (encerrada) return;
    if (!online) ouvintes.aoEstado('reconectando');
    else if (socket.connected) ouvintes.aoEstado('conectado');
  });

  return () => {
    encerrada = true;
    pararRede();
    socket.removeAllListeners();
    socket.disconnect();
  };
}
