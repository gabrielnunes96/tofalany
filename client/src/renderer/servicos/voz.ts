import { Room, RoomEvent, type Participant, type RemoteParticipant, type RemoteTrack } from 'livekit-client';

/** O que a tela precisa saber da sala de voz. */
export interface OuvintesVoz {
  /** Quem está falando agora (ids de usuário), na ordem do LiveKit. */
  aoFalando(ids: number[]): void;
  /** A sala caiu ou a pessoa foi tirada (entrou em outro computador, canal removido…). */
  aoCaiu(): void;
  /** Algo deu errado sem tirar da sala (ex.: microfone negado). */
  aoAviso(mensagem: string): void;
}

export interface SalaVoz {
  /** Conecta; rejeita se falhar ou se `sair()` for chamado antes de terminar. */
  entrar(url: string, token: string): Promise<void>;
  sair(): Promise<void>;
  /** Sessão de mídia atual (participant.sid), para o servidor reconhecer a saída certa. */
  sid(): string | undefined;
  /** Sai e tira os elementos de áudio da página (ao desmontar a tela). */
  destruir(): Promise<void>;
}

/** Só o que usamos do Room do livekit-client (permite testar sem WebRTC). */
export interface SalaLivekit {
  on(evento: RoomEvent, fn: (...args: never[]) => void): unknown;
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  localParticipant: { sid?: string; setMicrophoneEnabled(ligado: boolean): Promise<unknown> };
}

/** webAudioMix: volume por pessoa acima de 100% e escolha da saída (T15, T17). */
const novaSala = (): SalaLivekit => new Room({ adaptiveStream: true, dynacast: true, webAudioMix: true }) as unknown as SalaLivekit;

/** Saiu antes de terminar de conectar. */
export class EntradaCancelada extends Error {
  constructor() {
    super('Entrada na voz cancelada.');
  }
}

/**
 * RF-13: entra na sala do LiveKit do canal de voz, publica o microfone e toca o áudio de quem está lá.
 * Os elementos de áudio ficam numa caixa escondida, fora do React.
 */
export function criarSalaVoz(ouvintes: OuvintesVoz, fabrica: () => SalaLivekit = novaSala): SalaVoz {
  let sala: SalaLivekit | undefined;
  let saindo = false;
  const caixa = document.createElement('div');
  caixa.hidden = true;
  caixa.dataset.testid = 'audios-voz';
  /** Elemento → faixa, para soltar a faixa (detach) ao tirar o elemento. */
  const faixas = new Map<HTMLMediaElement, RemoteTrack>();

  function tirarElemento(e: HTMLMediaElement) {
    faixas.get(e)?.detach(e);
    faixas.delete(e);
    e.remove();
  }
  const limpar = () => {
    for (const e of [...faixas.keys()]) tirarElemento(e);
    caixa.replaceChildren();
  };

  const api: SalaVoz = {
    async entrar(url, token) {
      if (sala) throw new Error('Já está numa sala de voz.');
      saindo = false;
      const atual = fabrica();
      sala = atual;
      if (!caixa.isConnected) document.body.appendChild(caixa);
      // Cada elemento leva quem fala: some quando a faixa é desassinada ou a pessoa sai da sala.
      atual.on(RoomEvent.TrackSubscribed, ((track: RemoteTrack, _pub: unknown, participante: RemoteParticipant) => {
        if (track.kind !== 'audio' || sala !== atual) return;
        const elemento = track.attach();
        elemento.dataset.participante = participante?.identity ?? '';
        faixas.set(elemento, track);
        caixa.appendChild(elemento);
      }) as never);
      atual.on(RoomEvent.TrackUnsubscribed, ((track: RemoteTrack) => {
        for (const [e, t] of [...faixas]) if (t === track) tirarElemento(e);
      }) as never);
      atual.on(RoomEvent.ParticipantDisconnected, ((participante: RemoteParticipant) => {
        for (const e of [...faixas.keys()]) if (e.dataset.participante === participante.identity) tirarElemento(e);
      }) as never);
      atual.on(RoomEvent.ActiveSpeakersChanged, ((falando: Participant[]) => {
        if (sala !== atual) return;
        ouvintes.aoFalando(falando.map((p) => Number(p.identity)).filter((id) => Number.isInteger(id)));
      }) as never);
      atual.on(RoomEvent.Disconnected, (() => {
        if (sala !== atual) return;
        sala = undefined;
        limpar();
        ouvintes.aoFalando([]);
        if (!saindo) ouvintes.aoCaiu();
      }) as never);
      try {
        await atual.connect(url, token);
      } catch (erro) {
        if (sala === atual) sala = undefined;
        throw erro;
      }
      // Pediram para sair (ou entraram em outra) enquanto conectava: desfaz esta.
      if (sala !== atual) {
        await atual.disconnect();
        throw new EntradaCancelada();
      }
      try {
        await atual.localParticipant.setMicrophoneEnabled(true);
      } catch {
        if (sala === atual) ouvintes.aoAviso('Sem acesso ao microfone: você entrou só para ouvir.');
      }
    },
    async sair() {
      const atual = sala;
      if (!atual) return;
      saindo = true;
      sala = undefined;
      limpar();
      ouvintes.aoFalando([]);
      await atual.disconnect();
    },
    sid: () => sala?.localParticipant.sid || undefined,
    async destruir() {
      await api.sair();
      caixa.remove();
    },
  };
  return api;
}
