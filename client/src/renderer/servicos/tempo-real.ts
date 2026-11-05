import { io, type Socket } from 'socket.io-client';
import {
  ERRO_HANDSHAKE_NAO_AUTENTICADO,
  type EventosCliente,
  type EventosServidor,
  type MotivoRevogacao,
  type CanalDto,
  type DmDto,
  type MensagemDto,
  type OlaPayload,
  type UsuarioDto,
  type Destino,
} from '@tofalando/shared';
import { chaveDe, type Chave } from '../estado/chaves';

export type EstadoConexao = 'conectando' | 'conectado' | 'reconectando';

export interface OuvintesTempoReal {
  aoEstado(estado: EstadoConexao): void;
  aoOla(payload: OlaPayload): void;
  aoUsuarioCriado(usuario: UsuarioDto): void;
  aoUsuarioAtualizado(usuario: UsuarioDto): void;
  aoUsuarioRemovido(id: number): void;
  aoConviteAtualizado(link: string): void;
  aoCanalCriado(canal: CanalDto): void;
  aoCanalRenomeado(canal: CanalDto): void;
  aoCanalRemovido(id: number): void;
  aoMensagemNova(mensagem: MensagemDto): void;
  aoMensagemEditada(mensagem: MensagemDto): void;
  aoMensagemApagada(id: number, chave: Chave | null): void;
  aoDigitando(chave: Chave, usuarioId: number): void;
  aoDmAtualizada(dm: DmDto): void;
  aoLidoAtualizado(chave: Chave, ultimaMensagemId: number): void;
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

export type RespostaAcao<T> = { ok: true; valor: T } | { ok: false; erro: string };

export interface ConexaoTempoReal {
  desconectar(): void;
  /** Sinal de "digitando" (descartável: sem conexão, não faz nada). */
  avisarDigitando(destino: Destino): void;
  /** Leu a conversa até esta mensagem. */
  avisarLido(destino: Destino, ultimaMensagemId: number): void;
  /** Envia uma ação e espera a resposta do servidor (ou "sem conexão" se não estiver conectado / demorar). */
  pedir<K extends EventoComResposta>(evento: K, dados: Parameters<EventosCliente[K]>[0]): Promise<RespostaAcao<AckValor<K>>>;
}

/** Eventos que esperam resposta (ack); "digitando" é só um sinal. */
type EventoComResposta = Exclude<keyof EventosCliente, 'digitando' | 'lido:marcar'>;

type AckValor<K extends EventoComResposta> = Parameters<Parameters<EventosCliente[K]>[1]>[0] extends infer R
  ? R extends { ok: true; valor: infer V }
    ? V
    : never
  : never;

const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo em instantes.';

/** Conexão em tempo real com reconexão automática (RF-31). */
export function conectarTempoReal(
  url: string,
  token: string,
  ouvintes: OuvintesTempoReal,
  fabrica: Fabrica = io,
  rede: Rede = redeDoNavegador,
): ConexaoTempoReal {
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
  socket.on('usuario:criado', (usuario) => ouvintes.aoUsuarioCriado(usuario));
  socket.on('usuario:atualizado', (usuario) => ouvintes.aoUsuarioAtualizado(usuario));
  socket.on('usuario:removido', ({ id }) => ouvintes.aoUsuarioRemovido(id));
  socket.on('convite:atualizado', ({ link }) => ouvintes.aoConviteAtualizado(link));
  socket.on('canal:criado', (canal) => ouvintes.aoCanalCriado(canal));
  socket.on('canal:renomeado', (canal) => ouvintes.aoCanalRenomeado(canal));
  socket.on('canal:removido', ({ id }) => ouvintes.aoCanalRemovido(id));
  socket.on('mensagem:nova', (m) => ouvintes.aoMensagemNova(m));
  socket.on('mensagem:editada', (m) => ouvintes.aoMensagemEditada(m));
  socket.on('mensagem:apagada', (p) => ouvintes.aoMensagemApagada(p.id, chaveDe(p)));
  socket.on('digitando', (p) => {
    const chave = chaveDe(p);
    if (chave) ouvintes.aoDigitando(chave, p.usuarioId);
  });
  socket.on('dm:atualizada', (dm) => ouvintes.aoDmAtualizada(dm));
  socket.on('lido:atualizado', ({ chave, ultimaMensagemId }) => {
    if (/^[cd]:\d+$/.test(chave)) ouvintes.aoLidoAtualizado(chave as Chave, ultimaMensagemId);
  });
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

  return {
    desconectar() {
      encerrada = true;
      pararRede();
      socket.removeAllListeners();
      socket.disconnect();
    },
    avisarLido(destino, ultimaMensagemId) {
      if (socket.connected) socket.emit('lido:marcar', { destino, ultimaMensagemId });
    },
    avisarDigitando(destino) {
      if (socket.connected) socket.emit('digitando', { destino });
    },
    pedir(evento, dados) {
      if (!socket.connected) return Promise.resolve({ ok: false, erro: SEM_CONEXAO });
      return new Promise((resolver) => {
        (socket.timeout(10_000).emit as (e: string, d: unknown, cb: (erro: Error | null, r: never) => void) => void)(evento, dados, (erro, resposta) =>
          resolver(erro ? { ok: false, erro: SEM_CONEXAO } : resposta),
        );
      });
    },
  };
}
