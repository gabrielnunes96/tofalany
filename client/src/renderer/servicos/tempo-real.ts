import { io, type Socket } from 'socket.io-client';
import { separarComunidade, ERRO_HANDSHAKE_NAO_AUTENTICADO, type EventosCliente, type EventosServidor, type MotivoRevogacao, type CanalDto, type DmDto, type MensagemDto, type OlaPayload, type SomDto, type VozEstadoDto, type StatusPessoa, type TransmissaoDto, type UsuarioDto, type Destino, type EscolhaStatus, type FuncaoDto, type EstadoMusica, type AmizadeDto } from '@tofalando/shared';
import { chaveDe, type Chave } from '../estado/chaves';

export type EstadoConexao = 'conectando' | 'conectado' | 'reconectando';

export interface OuvintesTempoReal {
  aoEstado(estado: EstadoConexao): void;
  aoOla(payload: OlaPayload): void;
  aoUsuarioCriado(usuario: UsuarioDto): void;
  aoUsuarioAtualizado(usuario: UsuarioDto): void;
  aoUsuarioRemovido(id: number): void;
  /** Backlog v2, item 10c: os cargos personalizados mudaram. */
  aoFuncoes?(funcoes: FuncaoDto[]): void;
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
  aoSonsAtualizados(sons: SomDto[]): void;
  aoVozEstados(estados: VozEstadoDto[]): void;
  /** Entrei na voz por outro computador: este sai da sala. */
  aoVozTirado(): void;
  /** RF-23: som do soundboard tocado no meu canal de voz. */
  aoSomTocado(p: { somId: number; porUsuarioId: number; canalVozId: number }): void;
  /** RF-37: status de alguém mudou. */
  aoPresenca(id: number, status: StatusPessoa): void;
  /** RN-10: transmissão de tela começou/parou em algum canal. */
  aoTelaIniciada(t: TransmissaoDto): void;
  aoTelaParada(canalVozId: number, usuarioId?: number): void;
  aoTelaEspectadores?(canalVozId: number, usuarioId: number, espectadores: number[]): void;
  /** Backlog v2, item 14: o bot de música mudou num canal (servidor antigo nunca manda). */
  aoMusica?(estado: EstadoMusica): void;
  /** Amigos e pedidos mudaram (servidor antigo nunca manda). */
  aoAmizades?(amizades: AmizadeDto[], conhecidos: UsuarioDto[]): void;
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
  /** RN-25: o computador ficou ocioso (ou voltou). */
  avisarAusente(ausente: boolean): void;
  /** Backlog v2, item 2: status escolhido (vai também no handshake das reconexões). */
  escolherStatus(status: EscolhaStatus): void;
  /** Envia uma ação e espera a resposta do servidor (ou "sem conexão" se não estiver conectado / demorar). */
  /** `tempoMs`: quanto esperar a resposta (padrão 10 s; a busca de música no YouTube pede mais). */
  pedir<K extends EventoComResposta>(evento: K, dados: Parameters<EventosCliente[K]>[0], tempoMs?: number): Promise<RespostaAcao<AckValor<K>>>;
}

/** Eventos que esperam resposta (ack); "digitando" é só um sinal. */
type EventoComResposta = Exclude<keyof EventosCliente, 'digitando' | 'lido:marcar' | 'presenca:ausente' | 'presenca:escolher'>;

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
  let ausente = false;
  let escolha: EscolhaStatus = 'auto';
  // Servidor criado na mesma instalação (https://x/c/<id>): a conexão vai para a raiz e diz o servidor
  // (o caminho no endereço do Socket.IO seria lido como namespace).
  const { base, comunidade } = separarComunidade(url);
  const socket = fabrica(base, {
    // O 'ausente' vai junto no handshake de cada (re)conexão (RN-25).
    auth: (enviar) => enviar({ token, ausente, status: escolha, comunidade }),
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
  socket.on('funcoes:atualizadas', (funcoes) => ouvintes.aoFuncoes?.(funcoes));
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
  socket.on('sons:atualizados', (sons) => ouvintes.aoSonsAtualizados(sons));
  socket.on('voz:estados', (estados) => ouvintes.aoVozEstados(estados));
  socket.on('voz:tirado', () => ouvintes.aoVozTirado());
  socket.on('som:tocado', (p) => ouvintes.aoSomTocado(p));
  socket.on('presenca:atualizada', ({ id, status }) => ouvintes.aoPresenca(id, status));
  socket.on('tela:iniciada', (t) => ouvintes.aoTelaIniciada(t));
  socket.on('tela:parada', ({ canalVozId, usuarioId }) => ouvintes.aoTelaParada(canalVozId, usuarioId));
  socket.on('tela:espectadores', ({ canalVozId, usuarioId, espectadores }) => ouvintes.aoTelaEspectadores?.(canalVozId, usuarioId, espectadores));
  socket.on('musica:estado', (estado) => ouvintes.aoMusica?.(estado));
  socket.on('amizades:atualizadas', ({ amizades, conhecidos }) => ouvintes.aoAmizades?.(amizades, conhecidos));
  socket.on('sessao:revogada', ({ motivo }) => revogar(motivo));
  socket.on('connect_error', (erro) => {
    if (erro.message === ERRO_HANDSHAKE_NAO_AUTENTICADO) revogar('sessao_invalida');
    else if (erro.message === 'nao_membro') revogar('fora_do_servidor');
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
    escolherStatus(valor) {
      if (valor === escolha) return;
      escolha = valor;
      if (socket.connected) socket.emit('presenca:escolher', { status: valor });
    },
    avisarAusente(valor) {
      ausente = valor;
      if (socket.connected) socket.emit('presenca:ausente', { ausente: valor });
    },
    avisarDigitando(destino) {
      if (socket.connected) socket.emit('digitando', { destino });
    },
    pedir(evento, dados, tempoMs = 10_000) {
      if (!socket.connected) return Promise.resolve({ ok: false, erro: SEM_CONEXAO });
      return new Promise((resolver) => {
        (socket.timeout(tempoMs).emit as (e: string, d: unknown, cb: (erro: Error | null, r: never) => void) => void)(evento, dados, (erro, resposta) =>
          resolver(erro ? { ok: false, erro: SEM_CONEXAO } : resposta),
        );
      });
    },
  };
}
