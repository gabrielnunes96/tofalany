import { Room, RoomEvent, Track, type Participant, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import type { PreferenciasAudio } from '@tofalando/shared';
import { abrirMicrofone, type Microfone } from './pipeline-audio';

/** O que a tela precisa saber da sala de voz. */
export interface OuvintesVoz {
  /** Quem está falando agora (ids de usuário), na ordem do LiveKit. */
  aoFalando(ids: number[]): void;
  /** A sala caiu ou a pessoa foi tirada (entrou em outro computador, canal removido…). */
  aoCaiu(): void;
  /** Algo deu errado sem tirar da sala (ex.: microfone negado). */
  aoAviso(mensagem: string): void;
  /** RF-14: o portão do meu microfone abriu (transmitindo) ou fechou. */
  aoTransmitindo?(aberto: boolean): void;
}

/** Controles do microfone e da saída durante a chamada (RF-14, RF-16). */
export interface ControlesVoz {
  mudo: boolean;
  surdo: boolean;
  /** Atalho de push-to-talk apertado. */
  ptt: boolean;
}

export interface SalaVoz {
  /** Conecta; rejeita se falhar ou se `sair()` for chamado antes de terminar. */
  entrar(url: string, token: string, audio: PreferenciasAudio): Promise<void>;
  /** RF-17/RF-18: troca microfone, saída ou tratamento sem sair da sala. */
  aplicarAudio(audio: PreferenciasAudio): Promise<void>;
  /** Microfone publicado agora (para o medidor e para a supressão efetiva). */
  microfone(): Microfone | undefined;
  /** RF-16: mute (fecha o microfone), deafen (zera quem está na sala e também muta) e PTT apertado. */
  controlar(c: Partial<ControlesVoz>): void;
  /** RF-19/RF-38: volume (0 a 2) de cada pessoa e quem está silenciado, só neste computador. */
  definirPessoas(p: { volumes: Record<string, number>; silenciados: number[] }): void;
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
  localParticipant: {
    sid?: string;
    publishTrack(
      faixa: MediaStreamTrack,
      opcoes: { source: Track.Source; name: string },
    ): Promise<{ track?: { replaceTrack(f: MediaStreamTrack, doUsuario?: boolean): Promise<unknown>; mute(): Promise<unknown>; unmute(): Promise<unknown> } }>;
  };
  switchActiveDevice(tipo: MediaDeviceKind, id: string): Promise<unknown>;
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
export function criarSalaVoz(ouvintes: OuvintesVoz, fabrica: () => SalaLivekit = novaSala, abrir: typeof abrirMicrofone = abrirMicrofone): SalaVoz {
  let sala: SalaLivekit | undefined;
  /** Conectou (o microfone pode ser publicado). */
  let conectada = false;
  let mic: Microfone | undefined;
  /** Preferências com que o microfone atual foi aberto e saída aplicada. */
  let micPrefs: PreferenciasAudio | undefined;
  let saidaAplicada: string | null = null;
  let publicacao: Awaited<ReturnType<SalaLivekit['localParticipant']['publishTrack']>> | undefined;
  /** Última escolha pedida; a fila aplica sempre a mais nova. */
  let prefs: PreferenciasAudio | undefined;
  /** Operações de microfone/saída uma de cada vez: duas trocas seguidas não se atropelam. */
  let fila: Promise<void> = Promise.resolve();
  const enfileirar = (fn: () => Promise<void>) => {
    const p = fila.then(fn, fn);
    fila = p.catch(() => undefined);
    return p;
  };
  const controles: ControlesVoz = { mudo: false, surdo: false, ptt: false };
  let pararTransmitindo: (() => void) | undefined;
  /** Leva o estado de mute/deafen/PTT ao portão, à publicação e ao volume de quem está na sala. */
  /** Volume escolhido por pessoa (RF-19) e silenciados (RF-38); deafen e silêncio zeram sem perder o volume. */
  let volumes: Record<string, number> = {};
  let silenciados = new Set<string>();
  function aplicarVolume(elemento: HTMLMediaElement, faixa: RemoteTrack) {
    const id = elemento.dataset.participante ?? '';
    const v = controles.surdo || silenciados.has(id) ? 0 : (volumes[id] ?? 1);
    const ajustar = (faixa as RemoteTrack & { setVolume?(v: number): void }).setVolume?.bind(faixa);
    try {
      ajustar?.(v);
    } catch {
      // Sem Web Audio, o volume vai no elemento, que só aceita até 100%.
      ajustar?.(Math.min(1, v));
    }
    elemento.dataset.volume = String(v);
  }
  function aplicarControles() {
    const fechado = controles.mudo || controles.surdo;
    if (mic) {
      mic.portao.definir({ mudo: fechado, ptt: controles.ptt });
      mic.faixa.enabled = !fechado;
    }
    const faixa = publicacao?.track;
    if (faixa) void (fechado ? faixa.mute() : faixa.unmute()).catch(() => undefined);
    for (const [elemento, t] of faixas) aplicarVolume(elemento, t);
  }
  const pararMic = () => {
    pararTransmitindo?.();
    pararTransmitindo = undefined;
    ouvintes.aoTransmitindo?.(false);
    mic?.parar();
    mic = undefined;
    micPrefs = undefined;
    publicacao = undefined;
  };
  const mesmoMic = (a: PreferenciasAudio, b: PreferenciasAudio) =>
    a.entradaId === b.entradaId && a.supressaoRuido === b.supressaoRuido && a.cancelamentoEco === b.cancelamentoEco && a.ganhoAutomatico === b.ganhoAutomatico;
  async function saida(atual: SalaLivekit, id: string | null) {
    try {
      await atual.switchActiveDevice('audiooutput', id ?? 'default');
    } catch {
      ouvintes.aoAviso('Não foi possível usar a saída de áudio escolhida.');
    }
  }
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

  /** Leva microfone e saída para a escolha mais nova (sempre dentro da fila). */
  async function sincronizar(atual: SalaLivekit) {
    const desejado = prefs;
    if (!desejado || sala !== atual || !conectada) return;
    if (desejado.saidaId !== saidaAplicada) {
      saidaAplicada = desejado.saidaId;
      await saida(atual, desejado.saidaId);
    }
    if (micPrefs && mesmoMic(micPrefs, desejado)) {
      // Sensibilidade e modo vão direto ao portão, sem reabrir o microfone.
      mic?.portao.definir({ modo: desejado.modoMicrofone, limiarDb: desejado.sensibilidadeDb });
      micPrefs = desejado;
      return;
    }
    let novo: Microfone;
    try {
      novo = await abrir(desejado);
    } catch {
      if (sala === atual) ouvintes.aoAviso(publicacao ? 'Não foi possível abrir o microfone escolhido; continua o anterior.' : 'Sem acesso ao microfone: você entrou só para ouvir.');
      return;
    }
    if (sala !== atual) return novo.parar();
    // Mute/deafen valem antes de a faixa nova sair (nem alguns milissegundos de microfone aberto).
    const fechado = controles.mudo || controles.surdo;
    novo.portao.definir({ mudo: fechado, ptt: controles.ptt });
    novo.faixa.enabled = !fechado;
    try {
      if (publicacao?.track) {
        // Troca a quente: a mesma publicação passa a mandar a faixa nova (RF-17).
        await publicacao.track.replaceTrack(novo.faixa, true);
      } else {
        publicacao = await atual.localParticipant.publishTrack(novo.faixa, { source: Track.Source.Microphone, name: 'microfone' });
      }
    } catch {
      novo.parar();
      if (sala === atual) ouvintes.aoAviso(publicacao ? 'Não foi possível trocar o microfone; continua o anterior.' : 'Não foi possível enviar o microfone: você entrou só para ouvir.');
      return;
    }
    // Saiu da sala durante a troca: ninguém mais vai parar esta faixa.
    if (sala !== atual) return novo.parar();
    if (mic !== novo) mic?.parar();
    pararTransmitindo?.();
    // O portão novo só avisa quando abre: o indicador começa apagado.
    ouvintes.aoTransmitindo?.(false);
    mic = novo;
    micPrefs = desejado;
    pararTransmitindo = novo.portao.aoMudar((aberto) => ouvintes.aoTransmitindo?.(aberto));
    aplicarControles();
    if (novo.usouPadrao) ouvintes.aoAviso('O microfone escolhido não foi encontrado; usando o padrão do sistema.');
  }

  const api: SalaVoz = {
    async entrar(url, token, audio) {
      if (sala) throw new Error('Já está numa sala de voz.');
      prefs = audio;
      saindo = false;
      conectada = false;
      saidaAplicada = null;
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
        aplicarVolume(elemento, track);
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
        conectada = false;
        limpar();
        pararMic();
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
      conectada = true;
      await enfileirar(() => sincronizar(atual));
    },
    async aplicarAudio(audio) {
      prefs = audio;
      const atual = sala;
      if (!atual) return;
      await enfileirar(() => sincronizar(atual));
    },
    microfone: () => mic,
    definirPessoas(p) {
      volumes = { ...p.volumes };
      silenciados = new Set(p.silenciados.map(String));
      for (const [elemento, t] of faixas) aplicarVolume(elemento, t);
    },
    controlar(c) {
      Object.assign(controles, c);
      aplicarControles();
    },
    async sair() {
      const atual = sala;
      if (!atual) return;
      saindo = true;
      sala = undefined;
      conectada = false;
      limpar();
      pararMic();
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
