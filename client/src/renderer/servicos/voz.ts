import { Room, RoomEvent, Track, type Participant, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { DIMENSOES_TELA, IDENTIDADE_BOT_MUSICA, VOLUME_BOT_PADRAO, type PreferenciasAudio, type QualidadeTela } from '@tofalando/shared';
import { abrirMicrofone, type Microfone } from './pipeline-audio';
import { criarMedidorFala, fonteDeFaixa } from './medidor-fala';

/** O que a tela precisa saber da sala de voz. */
export interface OuvintesVoz {
  /** Quem está falando agora (ids de usuário), medido no próprio app (backlog v2, item 1). */
  aoFalando(ids: number[]): void;
  /** A sala caiu ou a pessoa foi tirada (entrou em outro computador, canal removido…). */
  aoCaiu(): void;
  /** Algo deu errado sem tirar da sala (ex.: microfone negado). */
  aoAviso(mensagem: string): void;
  /** RF-14: o portão do meu microfone abriu (transmitindo) ou fechou. */
  aoTransmitindo?(aberto: boolean): void;
  /** RF-25: vídeos de câmera na sala (o meu, como prévia, e os dos outros). */
  aoVideos?(videos: VideoSala[]): void;
  /** RF-30: transmissões de tela dos outros que estão chegando. */
  aoTelas?(telas: VideoSala[]): void;
  /** A minha transmissão acabou por fora (ex.: a janela transmitida fechou). */
  aoMinhaTelaParou?(): void;
  /** RF-31: a mídia caiu e o LiveKit está tentando voltar (true) ou voltou (false). */
  aoReconectando?(reconectando: boolean): void;
}

/**
 * Backlog v2, 1c: voz em Opus a 64 kbps (o padrão do LiveKit é menor), DTX (silêncio quase não gasta banda) e RED
 * (redundância: um pacote perdido não vira falha no áudio). Cerca de 64 kbps por pessoa falando.
 */
export const PUBLICACAO_VOZ = { audioPreset: { maxBitrate: 64_000 }, dtx: true, red: true };

/** Taxa máxima por qualidade (bits/s): a banda que cada espectador recebe (R-10). */
export const TAXAS_TELA: Record<QualidadeTela, number> = { '720p30': 2_500_000, '1080p60': 6_000_000, '1440p60': 10_000_000 };

/** RF-28: resolução e quadros de cada qualidade (as mesmas dimensões que o servidor confere). */
export const RESOLUCOES_TELA = Object.fromEntries(
  Object.entries(DIMENSOES_TELA).map(([q, d]) => [q, { width: d.largura, height: d.altura, frameRate: d.quadros }]),
) as Record<QualidadeTela, { width: number; height: number; frameRate: number }>;

/** Faixa de vídeo que a tela prende num <video> (attach/detach do livekit-client). */
export interface FaixaVideo {
  attach(elemento: HTMLMediaElement): HTMLMediaElement;
  detach(elemento: HTMLMediaElement): HTMLMediaElement;
}

export interface VideoSala {
  usuarioId: number;
  faixa: FaixaVideo;
  meu: boolean;
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
  /** Ida e volta até o servidor de mídia, em ms (undefined fora da voz ou antes da primeira medida). */
  latencia(): number | undefined;
  /** RF-16: mute (fecha o microfone), deafen (zera quem está na sala e também muta) e PTT apertado. */
  controlar(c: Partial<ControlesVoz>): void;
  /** RF-25: liga ou desliga a minha câmera (simulcast); devolve se ficou ligada. */
  camera(ligar: boolean): Promise<boolean>;
  /** RF-26: começa a transmitir a fonte já escolhida (sem simulcast, "motion"); devolve se começou. */
  /** somVirtual: no Linux, o som do sistema vem do microfone virtual (backlog v2, item 13) e é publicado à parte. */
  transmitir(qualidade: QualidadeTela, audio: boolean, codec?: 'h264' | 'vp9', somVirtual?: boolean): Promise<boolean>;
  pararTela(): Promise<void>;
  /** Estou transmitindo a tela agora (para conferir trava "minha" vinda do servidor). */
  transmitindoTela(): boolean;
  /** Backlog v2, item 12: a faixa da minha tela, para a prévia local (não gasta banda). */
  faixaMinhaTela(): MediaStreamTrack | undefined;
  /** RF-19/RF-38: volume (0 a 2) de cada pessoa e quem está silenciado, só neste computador. */
  definirPessoas(p: { volumes: Record<string, number>; silenciados: number[] }): void;
  /**
   * Som da transmissão de alguém: só toca para quem está assistindo, no volume escolhido no painel (0 = mudo),
   * separado do volume da voz da pessoa.
   */
  somDaTela(usuarioId: number, o: { assistindo?: boolean; volume?: number }): void;
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
    identity?: string;
    publishTrack(
      faixa: MediaStreamTrack,
      opcoes: { source: Track.Source; name: string; audioPreset?: { maxBitrate: number }; dtx?: boolean; red?: boolean },
    ): Promise<{ track?: { replaceTrack(f: MediaStreamTrack, doUsuario?: boolean): Promise<unknown>; mute(): Promise<unknown>; unmute(): Promise<unknown> } }>;
    unpublishTrack?(faixa: MediaStreamTrack, parar?: boolean): Promise<unknown>;
    getTrackPublication?(fonte: Track.Source): unknown;
  };
  switchActiveDevice(tipo: MediaDeviceKind, id: string): Promise<unknown>;
  /** O livekit-client mede o RTT do canal de sinalização (ping/pong com o servidor de mídia). */
  engine?: { client?: { rtt?: number } };
}

/** Só o que usamos da câmera do participante local (permite testar sem WebRTC). */
interface CameraLocal {
  setCameraEnabled(ligar: boolean, opcoes?: object, publicar?: object): Promise<{ track?: FaixaVideo } | undefined>;
  setScreenShareEnabled(ligar: boolean, opcoes?: object, publicar?: object): Promise<{ track?: FaixaVideo } | undefined>;
}

/** webAudioMix: volume por pessoa acima de 100% e escolha da saída (T15, T17). */
const novaSala = (): SalaLivekit => new Room({ adaptiveStream: true, dynacast: true, webAudioMix: true }) as unknown as SalaLivekit;

/** Saiu antes de terminar de conectar. */
export class EntradaCancelada extends Error {
  /** Para quem não importa a classe (a tela carrega este módulo sob demanda). */
  readonly cancelada = true;
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
  // RF-25: câmeras na sala (identidade → faixa) e a minha.
  const videos = new Map<string, FaixaVideo>();
  let meuVideo: FaixaVideo | undefined;
  const emitirVideos = () => {
    const lista: VideoSala[] = [...videos].map(([id, faixa]) => ({ usuarioId: Number(id), faixa, meu: false }));
    // A tela sabe quem sou eu: o meu vídeo vai marcado como meu (usuarioId 0).
    if (meuVideo) lista.unshift({ usuarioId: 0, faixa: meuVideo, meu: true });
    ouvintes.aoVideos?.(lista);
  };
  // RF-30: telas transmitidas pelos outros (identidade → faixa) e se eu estou transmitindo.
  const telas = new Map<string, FaixaVideo>();
  let transmitindoTela = false;
  let minhaFaixaTela: MediaStreamTrack | undefined;
  /** Backlog v2, item 13: som do sistema no Linux, publicado como áudio da tela. */
  let somTela: MediaStreamTrack | undefined;
  const pararSomTela = (atual: SalaLivekit | undefined) => {
    const f = somTela;
    somTela = undefined;
    if (!f) return;
    void atual?.localParticipant.unpublishTrack?.(f, true)?.catch(() => undefined);
    f.stop();
  };
  /** Cada pedido de transmitir/parar ganha um número: um "parar" no meio do início cancela a captura que terminar depois. */
  let pedidoTela = 0;
  const emitirTelas = () => ouvintes.aoTelas?.([...telas].map(([id, faixa]) => ({ usuarioId: Number(id), faixa, meu: false })));
  const limparVideos = () => {
    if (telas.size > 0) {
      telas.clear();
      ouvintes.aoTelas?.([]);
    }
    transmitindoTela = false;
    minhaFaixaTela = undefined;
    const tinha = videos.size > 0 || !!meuVideo;
    videos.clear();
    meuVideo = undefined;
    if (tinha) ouvintes.aoVideos?.([]);
  };
  let pararTransmitindo: (() => void) | undefined;
  /** Leva o estado de mute/deafen/PTT ao portão, à publicação e ao volume de quem está na sala. */
  /** Volume escolhido por pessoa (RF-19) e silenciados (RF-38); deafen e silêncio zeram sem perder o volume. */
  let volumes: Record<string, number> = {};
  let silenciados = new Set<string>();
  /** Som das transmissões (por quem transmite): só com o painel aberto, no volume do painel. */
  const somTelas = new Map<string, { assistindo: boolean; volume: number }>();
  function aplicarVolume(elemento: HTMLMediaElement, faixa: RemoteTrack) {
    const id = elemento.dataset.participante ?? '';
    const tela = somTelas.get(id);
    const v =
      elemento.dataset.tela === '1'
        ? controles.surdo || !tela?.assistindo
          ? 0
          : tela.volume
        : controles.surdo || silenciados.has(id)
          ? 0
          : (volumes[id] ?? (id === IDENTIDADE_BOT_MUSICA ? VOLUME_BOT_PADRAO : 1));
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
  // Backlog v2, item 1: a bolinha de quem fala vem do nível do áudio que chega (e do meu portão), na hora;
  // o "quem fala" do LiveKit chegava com algumas centenas de milissegundos de atraso.
  let ctxFala: AudioContext | undefined;
  const fala = criarMedidorFala((ids) => ouvintes.aoFalando(ids.map(Number).filter((id) => Number.isInteger(id))));
  const meuId = () => sala?.localParticipant.identity ?? '';
  const pararMic = () => {
    pararTransmitindo?.();
    pararTransmitindo = undefined;
    ouvintes.aoTransmitindo?.(false);
    fala.definirEu(meuId(), false);
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
      if (sala === atual)
        ouvintes.aoAviso(
          publicacao ? 'Não foi possível abrir o microfone escolhido; continua o anterior.' : 'Sem acesso ao microfone: você entrou só para ouvir.',
        );
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
        publicacao = await atual.localParticipant.publishTrack(novo.faixa, { source: Track.Source.Microphone, name: 'microfone', ...PUBLICACAO_VOZ });
      }
    } catch {
      novo.parar();
      if (sala === atual)
        ouvintes.aoAviso(
          publicacao ? 'Não foi possível trocar o microfone; continua o anterior.' : 'Não foi possível enviar o microfone: você entrou só para ouvir.',
        );
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
    pararTransmitindo = novo.portao.aoMudar((aberto) => {
      ouvintes.aoTransmitindo?.(aberto);
      fala.definirEu(meuId(), aberto);
    });
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
      atual.on(RoomEvent.TrackSubscribed, ((track: RemoteTrack, pub: { isMuted?: boolean } | undefined, participante: RemoteParticipant) => {
        if (sala !== atual) return;
        if (track.kind === 'video' && track.source === Track.Source.ScreenShare && participante) {
          telas.set(participante.identity, track);
          emitirTelas();
          return;
        }
        if (track.kind === 'video') {
          // Câmera desligada (publicação muda) não entra: volta quando a pessoa religar (TrackUnmuted).
          if (track.source === Track.Source.Camera && participante && !pub?.isMuted) {
            videos.set(participante.identity, track);
            emitirVideos();
          }
          return;
        }
        if (track.kind !== 'audio') return;
        const somDeTela = track.source === Track.Source.ScreenShareAudio;
        // O som da tela não acende a bolinha de quem fala.
        if (participante && track.mediaStreamTrack && !somDeTela) {
          try {
            ctxFala ??= new AudioContext();
            fala.adicionar(participante.identity, fonteDeFaixa(ctxFala, track.mediaStreamTrack));
          } catch {
            // Sem Web Audio: fica sem a bolinha dessa pessoa (o áudio segue normal).
          }
        }
        const elemento = track.attach();
        elemento.dataset.participante = participante?.identity ?? '';
        if (somDeTela) elemento.dataset.tela = '1';
        faixas.set(elemento, track);
        caixa.appendChild(elemento);
        aplicarVolume(elemento, track);
      }) as never);
      // Desligar a câmera silencia a publicação (não desassina): some e volta pela marcação de mudo.
      const camera = (pub: { kind?: string; source?: string }) => pub.kind === 'video' && pub.source === Track.Source.Camera;
      atual.on(RoomEvent.TrackMuted, ((pub: { kind?: string; source?: string }, participante: Participant) => {
        if (sala !== atual || !camera(pub) || !participante || participante === (atual.localParticipant as unknown as Participant)) return;
        if (videos.delete(participante.identity)) emitirVideos();
      }) as never);
      atual.on(RoomEvent.TrackUnmuted, ((pub: { kind?: string; source?: string; track?: FaixaVideo }, participante: Participant) => {
        if (sala !== atual || !camera(pub) || !pub.track || !participante || participante === (atual.localParticipant as unknown as Participant)) return;
        videos.set(participante.identity, pub.track);
        emitirVideos();
      }) as never);
      atual.on(RoomEvent.TrackUnsubscribed, ((track: RemoteTrack, _pub: unknown, participante?: RemoteParticipant) => {
        if (sala !== atual) return;
        if (track.kind === 'audio' && participante) fala.remover(participante.identity);
        for (const [id, v] of [...videos]) {
          if (v !== track) continue;
          videos.delete(id);
          emitirVideos();
        }
        for (const [id, v] of [...telas]) {
          if (v !== track) continue;
          telas.delete(id);
          emitirTelas();
        }
        for (const [e, t] of [...faixas]) if (t === track) tirarElemento(e);
      }) as never);
      atual.on(RoomEvent.ParticipantDisconnected, ((participante: RemoteParticipant) => {
        fala.remover(participante.identity);
        for (const e of [...faixas.keys()]) if (e.dataset.participante === participante.identity) tirarElemento(e);
        if (videos.delete(participante.identity)) emitirVideos();
        if (telas.delete(participante.identity)) emitirTelas();
      }) as never);
      // A transmissão terminou por fora (janela fechada, "parar de compartilhar" do sistema).
      atual.on(RoomEvent.LocalTrackUnpublished, ((pub: { source?: string }) => {
        if (sala !== atual || pub.source !== Track.Source.ScreenShare || !transmitindoTela) return;
        transmitindoTela = false;
        minhaFaixaTela = undefined;
        ouvintes.aoMinhaTelaParou?.();
      }) as never);
      // RF-31: o livekit-client tenta voltar sozinho (retoma ou reconecta inteiro); a tela só avisa.
      const reconectando = () => {
        if (sala !== atual) return;
        // Marca para os testes de ponta a ponta (e para depurar): a volta costuma levar menos de 1 s.
        document.documentElement.dataset.vozReconexoes = String(Number(document.documentElement.dataset.vozReconexoes ?? 0) + 1);
        ouvintes.aoReconectando?.(true);
      };
      atual.on(RoomEvent.Reconnecting, reconectando as never);
      atual.on(RoomEvent.SignalReconnecting, reconectando as never);
      atual.on(RoomEvent.Reconnected, (() => sala === atual && ouvintes.aoReconectando?.(false)) as never);
      atual.on(RoomEvent.Disconnected, (() => {
        if (sala !== atual) return;
        ouvintes.aoReconectando?.(false);
        sala = undefined;
        conectada = false;
        limpar();
        limparVideos();
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
    latencia() {
      const rtt = conectada ? sala?.engine?.client?.rtt : undefined;
      return typeof rtt === 'number' && rtt > 0 ? Math.round(rtt) : undefined;
    },
    async transmitir(qualidade, audio, codec = 'h264', somVirtual = false) {
      const atual = sala;
      if (!atual || !conectada) return false;
      const meu = ++pedidoTela;
      try {
        const pub = await (atual.localParticipant as unknown as CameraLocal).setScreenShareEnabled(
          true,
          {
            // Som do sistema sem o som do próprio app (Windows/macOS, Electron 43.4+ usa a captura sem o processo do app):
            // sem isso, quem assiste ouve a própria voz de volta pela transmissão. E sem tratamento de voz (é música/jogo).
            audio: audio ? { restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
            resolution: RESOLUCOES_TELA[qualidade],
            contentHint: 'motion',
            selfBrowserSurface: 'exclude',
          },
          // Sem simulcast na tela (técnica §5): uma camada só, na qualidade pedida; H.264 por padrão (R-3).
          // backupCodec desligado: VP9 sem VP8 de reserva (pesaria na CPU em 1440p60 sem codificação por hardware).
          {
            simulcast: false,
            videoCodec: codec,
            backupCodec: false,
            screenShareEncoding: { maxBitrate: TAXAS_TELA[qualidade], maxFramerate: RESOLUCOES_TELA[qualidade].frameRate },
          },
        );
        // A resolução pedida pelo livekit-client é só "ideal": garante o teto (o servidor silencia o que passar, RN-17).
        const r = RESOLUCOES_TELA[qualidade];
        await (pub?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack
          ?.applyConstraints({ width: { max: r.width }, height: { max: r.height }, frameRate: { max: r.frameRate } })
          .catch(() => undefined);
        if (sala !== atual) {
          (pub?.track as { stop?(): void } | undefined)?.stop?.();
          transmitindoTela = false;
          minhaFaixaTela = undefined;
          return false;
        }
        // Pediram para parar enquanto a captura começava: desfaz.
        if (meu !== pedidoTela) {
          await (atual.localParticipant as unknown as CameraLocal).setScreenShareEnabled(false).catch(() => undefined);
          return false;
        }
        transmitindoTela = !!pub?.track;
        minhaFaixaTela = (pub?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack;
        // Windows: o som vem junto da captura; se o sistema não entregou, quem transmite fica sabendo.
        if (transmitindoTela && audio && !somVirtual && !atual.localParticipant.getTrackPublication?.(Track.Source.ScreenShareAudio)) {
          ouvintes.aoAviso('A tela está indo, mas sem o som do computador (o sistema não entregou o áudio).');
        }
        if (transmitindoTela && somVirtual) {
          const faixa = await abrirMicrofoneVirtual();
          if (!faixa) ouvintes.aoAviso('A tela está indo, mas sem o som do computador (o microfone virtual não apareceu).');
          else if (sala !== atual || meu !== pedidoTela) faixa.stop();
          else {
            somTela = faixa;
            await atual.localParticipant
              .publishTrack(faixa, { source: Track.Source.ScreenShareAudio, name: 'tela-audio', audioPreset: { maxBitrate: 128_000 }, dtx: false, red: false })
              .catch(() => {
                pararSomTela(atual);
                ouvintes.aoAviso('A tela está indo, mas sem o som do computador.');
              });
          }
        }
        return transmitindoTela;
      } catch {
        ouvintes.aoAviso('Não foi possível transmitir a tela.');
        return false;
      }
    },
    transmitindoTela: () => transmitindoTela,
    faixaMinhaTela: () => minhaFaixaTela,
    async pararTela() {
      const atual = sala;
      pedidoTela++;
      pararSomTela(atual);
      transmitindoTela = false;
      minhaFaixaTela = undefined;
      if (!atual) return;
      await (atual.localParticipant as unknown as CameraLocal).setScreenShareEnabled(false).catch(() => undefined);
    },
    async camera(ligar) {
      const atual = sala;
      if (!atual || !conectada) return false;
      try {
        // Simulcast: quem assiste pequeno recebe a camada menor (técnica §5).
        const pub = await (atual.localParticipant as unknown as CameraLocal).setCameraEnabled(
          ligar,
          { resolution: { width: 1280, height: 720, frameRate: 30 } },
          { simulcast: true },
        );
        if (sala !== atual) {
          // Saiu da voz enquanto a câmera abria: garante a luz apagada.
          (pub?.track as { stop?(): void } | undefined)?.stop?.();
          return false;
        }
        meuVideo = ligar ? pub?.track : undefined;
        emitirVideos();
        return ligar && !!meuVideo;
      } catch {
        if (ligar) ouvintes.aoAviso('Não foi possível abrir a câmera.');
        return false;
      }
    },
    somDaTela(usuarioId, o) {
      const id = String(usuarioId);
      const atual = somTelas.get(id) ?? { assistindo: false, volume: 1 };
      somTelas.set(id, { assistindo: o.assistindo ?? atual.assistindo, volume: Math.max(0, Math.min(2, o.volume ?? atual.volume)) });
      for (const [elemento, t] of faixas) if (elemento.dataset.participante === id && elemento.dataset.tela === '1') aplicarVolume(elemento, t);
    },
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
      // Sair no meio de uma reconexão: o aviso não pode ficar preso para a próxima entrada.
      ouvintes.aoReconectando?.(false);
      pararSomTela(atual);
      limpar();
      limparVideos();
      pararMic();
      fala.parar();
      await atual.disconnect();
    },
    sid: () => sala?.localParticipant.sid || undefined,
    async destruir() {
      await api.sair();
      void ctxFala?.close().catch(() => undefined);
      ctxFala = undefined;
      caixa.remove();
    },
  };
  return api;
}

/** Nome do microfone virtual criado no processo principal (main/som-sistema.ts). */
const MICROFONE_VIRTUAL = 'vencord-screen-share';

/**
 * Backlog v2, item 13: captura o microfone virtual com o som do sistema (sem o som do app), sem nenhum
 * tratamento de voz: eco, ruído e ganho desligados e em estéreo. Ele leva um instante para aparecer.
 */
export async function abrirMicrofoneVirtual(dispositivos: MediaDevices = navigator.mediaDevices, tentativas = 15): Promise<MediaStreamTrack | undefined> {
  for (let i = 0; i < tentativas; i++) {
    const d = (await dispositivos.enumerateDevices()).find((x) => x.kind === 'audioinput' && x.label.includes(MICROFONE_VIRTUAL));
    if (d) {
      const fluxo = await dispositivos
        .getUserMedia({ audio: { deviceId: { exact: d.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } })
        .catch(() => undefined);
      return fluxo?.getAudioTracks()[0];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}
