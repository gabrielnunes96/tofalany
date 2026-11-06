// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import { AUDIO_PADRAO } from '@tofalando/shared';
import { criarSalaVoz, EntradaCancelada, type SalaLivekit } from './voz';
import type { Microfone } from './pipeline-audio';

vi.mock('./pipeline-audio', () => ({ abrirMicrofone: vi.fn() }));

function salaFalsa(opcoes: { conectar?: 'ok' | 'falha' } = {}) {
  const ouvintes = new Map<string, (...a: unknown[]) => void>();
  const replaceTrack = vi.fn(async () => undefined);
  const mute = vi.fn(async () => undefined);
  const unmute = vi.fn(async () => undefined);
  const sala = {
    on: vi.fn((e: string, fn: (...a: unknown[]) => void) => ouvintes.set(e, fn)),
    connect: vi.fn(async () => {
      if (opcoes.conectar === 'falha') throw new Error('sem rota');
    }),
    disconnect: vi.fn(async () => ouvintes.get(RoomEvent.Disconnected)?.()),
    switchActiveDevice: vi.fn(async () => undefined),
    localParticipant: {
      sid: 'PA_1',
      publishTrack: vi.fn(async () => ({ track: { replaceTrack, mute, unmute } })),
    },
  };
  const emitir = (e: RoomEvent, ...args: unknown[]) => ouvintes.get(e)?.(...args);
  return { sala: sala as unknown as SalaLivekit & typeof sala, emitir, replaceTrack, mute, unmute };
}

function microfone(nome = 'mic') {
  let aoMudar: ((aberto: boolean) => void) | undefined;
  const portao = {
    definir: vi.fn(),
    aoMudar: vi.fn((fn: (aberto: boolean) => void) => {
      aoMudar = fn;
      return () => (aoMudar = undefined);
    }),
    abrir: (aberto: boolean) => aoMudar?.(aberto),
  };
  return {
    faixa: { nome } as unknown as MediaStreamTrack,
    faixaMedicao: { nome: nome + '-medicao' } as unknown as MediaStreamTrack,
    portao,
    supressao: 'forte' as const,
    usouPadrao: false,
    dispositivoId: nome,
    parar: vi.fn(),
  } satisfies Microfone;
}

const ouvintesVoz = () => ({ aoFalando: vi.fn(), aoCaiu: vi.fn(), aoAviso: vi.fn() });

describe('sala de voz (RF-13)', () => {
  it('conecta, publica o microfone tratado, toca o áudio recebido e informa quem fala', async () => {
    const { sala, emitir } = salaFalsa();
    const o = ouvintesVoz();
    const mic = microfone();
    const abrir = vi.fn(async () => mic);
    const voz = criarSalaVoz(o, () => sala, abrir);
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    expect(sala.connect).toHaveBeenCalledWith('ws://lk', 'tok');
    expect(abrir).toHaveBeenCalledWith(AUDIO_PADRAO);
    expect(sala.localParticipant.publishTrack).toHaveBeenCalledWith(mic.faixa, { source: 'microphone', name: 'microfone' });
    expect(voz.microfone()).toBe(mic);
    expect(voz.sid()).toBe('PA_1');

    const audio = document.createElement('audio');
    const faixa = { kind: 'audio', attach: () => audio, detach: vi.fn(() => [audio]) };
    emitir(RoomEvent.TrackSubscribed, faixa, {}, { identity: '2' });
    expect(document.querySelector('[data-testid="audios-voz"] audio')).toBe(audio);
    emitir(RoomEvent.TrackSubscribed, { kind: 'video', attach: vi.fn() });
    expect(document.querySelectorAll('[data-testid="audios-voz"] > *')).toHaveLength(1);

    emitir(RoomEvent.ActiveSpeakersChanged, [{ identity: '2' }, { identity: 'x' }]);
    expect(o.aoFalando).toHaveBeenLastCalledWith([2]);

    emitir(RoomEvent.TrackUnsubscribed, faixa);
    expect(audio.isConnected).toBe(false);
    expect(faixa.detach).toHaveBeenCalledWith(audio);

    // Saída da pessoa também tira o áudio dela, mesmo sem TrackUnsubscribed.
    const outro = document.createElement('audio');
    emitir(RoomEvent.TrackSubscribed, { kind: 'audio', attach: () => outro, detach: vi.fn(() => []) }, {}, { identity: '3' });
    emitir(RoomEvent.ParticipantDisconnected, { identity: '3' });
    expect(outro.isConnected).toBe(false);

    await voz.sair();
    expect(sala.disconnect).toHaveBeenCalled();
    expect(mic.parar).toHaveBeenCalled();
    expect(o.aoCaiu).not.toHaveBeenCalled();
    expect(o.aoFalando).toHaveBeenLastCalledWith([]);
    await voz.destruir();
    expect(document.querySelector('[data-testid="audios-voz"]')).toBeNull();
  });

  it('RF-17: troca microfone e saída sem sair da sala', async () => {
    const { sala, replaceTrack } = salaFalsa();
    const o = ouvintesVoz();
    const primeiro = microfone('1');
    const segundo = microfone('2');
    const abrir = vi.fn().mockResolvedValueOnce(primeiro).mockResolvedValueOnce(segundo);
    const voz = criarSalaVoz(o, () => sala, abrir);
    await voz.entrar('ws://lk', 'tok', { ...AUDIO_PADRAO, saidaId: 'fone' });
    expect(sala.switchActiveDevice).toHaveBeenCalledWith('audiooutput', 'fone');

    await voz.aplicarAudio({ ...AUDIO_PADRAO, saidaId: 'fone', sensibilidadeDb: -20 });
    expect(abrir).toHaveBeenCalledTimes(1);

    await voz.aplicarAudio({ ...AUDIO_PADRAO, saidaId: null, entradaId: 'mic-2' });
    expect(sala.switchActiveDevice).toHaveBeenLastCalledWith('audiooutput', 'default');
    expect(replaceTrack).toHaveBeenCalledWith(segundo.faixa, true);
    expect(primeiro.parar).toHaveBeenCalled();
    expect(voz.microfone()).toBe(segundo);
    expect(sala.disconnect).not.toHaveBeenCalled();
  });

  it('duas trocas seguidas: fica a última; mudança durante a conexão não publica duas vezes', async () => {
    const { sala, replaceTrack } = salaFalsa();
    let liberar!: () => void;
    sala.connect.mockImplementation(() => new Promise<void>((r) => (liberar = r)));
    const mics = [microfone('A'), microfone('B'), microfone('C')];
    let i = 0;
    const abrir = vi.fn(async () => mics[i++]!);
    const voz = criarSalaVoz(ouvintesVoz(), () => sala, abrir);
    const entrando = voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    const durante = voz.aplicarAudio({ ...AUDIO_PADRAO, entradaId: 'A' });
    liberar();
    await Promise.all([entrando, durante]);
    expect(sala.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, entradaId: 'A' });

    await Promise.all([voz.aplicarAudio({ ...AUDIO_PADRAO, entradaId: 'B' }), voz.aplicarAudio({ ...AUDIO_PADRAO, entradaId: 'C' })]);
    // A fila aplica direto a escolha mais nova (C): abre um microfone só.
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, entradaId: 'C' });
    expect(voz.microfone()).toBe(mics[1]);
    expect(mics[0]!.parar).toHaveBeenCalled();
    expect(replaceTrack).toHaveBeenCalledTimes(1);
  });

  it('troca que falha ou sala que fecha durante a troca não deixa microfone aberto', async () => {
    const { sala, replaceTrack } = salaFalsa();
    const o = ouvintesVoz();
    const mics = [microfone('1'), microfone('2'), microfone('3')];
    let i = 0;
    const voz = criarSalaVoz(o, () => sala, vi.fn(async () => mics[i++]!));
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    replaceTrack.mockRejectedValueOnce(new Error('falhou'));
    await voz.aplicarAudio({ ...AUDIO_PADRAO, entradaId: 'x' });
    expect(mics[1]!.parar).toHaveBeenCalled();
    expect(voz.microfone()).toBe(mics[0]);
    expect(o.aoAviso).toHaveBeenLastCalledWith('Não foi possível trocar o microfone; continua o anterior.');

    replaceTrack.mockImplementationOnce(async () => {
      await voz.sair();
    });
    await voz.aplicarAudio({ ...AUDIO_PADRAO, entradaId: 'y' });
    expect(mics[2]!.parar).toHaveBeenCalled();
    expect(mics[0]!.parar).toHaveBeenCalled();
    expect(voz.microfone()).toBeUndefined();
  });

  it('RF-16: mute fecha o portão e silencia a publicação; deafen zera quem está na sala e também muta; PTT abre', async () => {
    const { sala, emitir, mute, unmute } = salaFalsa();
    const o = { ...ouvintesVoz(), aoTransmitindo: vi.fn() };
    const mic = microfone();
    const voz = criarSalaVoz(o, () => sala, vi.fn(async () => mic));
    await voz.entrar('ws://lk', 'tok', { ...AUDIO_PADRAO, modoMicrofone: 'ptt' });
    const remota = { kind: 'audio', attach: () => document.createElement('audio'), detach: vi.fn(() => []), setVolume: vi.fn() };
    emitir(RoomEvent.TrackSubscribed, remota, {}, { identity: '2' });

    mic.portao.abrir(true);
    expect(o.aoTransmitindo).toHaveBeenLastCalledWith(true);

    voz.controlar({ ptt: true });
    expect(mic.portao.definir).toHaveBeenLastCalledWith({ mudo: false, ptt: true });
    voz.controlar({ mudo: true });
    expect(mic.portao.definir).toHaveBeenLastCalledWith({ mudo: true, ptt: true });
    expect(mute).toHaveBeenCalled();
    voz.controlar({ mudo: false, surdo: true });
    expect(mic.portao.definir).toHaveBeenLastCalledWith({ mudo: true, ptt: true });
    expect(remota.setVolume).toHaveBeenLastCalledWith(0);
    // Quem entra durante o deafen também chega mudo.
    const nova = { kind: 'audio', attach: () => document.createElement('audio'), detach: vi.fn(() => []), setVolume: vi.fn() };
    emitir(RoomEvent.TrackSubscribed, nova, {}, { identity: '3' });
    expect(nova.setVolume).toHaveBeenCalledWith(0);
    voz.controlar({ surdo: false });
    expect(remota.setVolume).toHaveBeenLastCalledWith(1);
    expect(unmute).toHaveBeenCalled();

    // Sensibilidade e modo vão ao portão sem reabrir o microfone.
    await voz.aplicarAudio({ ...AUDIO_PADRAO, modoMicrofone: 'deteccao', sensibilidadeDb: -30 });
    expect(mic.portao.definir).toHaveBeenLastCalledWith({ modo: 'deteccao', limiarDb: -30 });

    await voz.sair();
    expect(o.aoTransmitindo).toHaveBeenLastCalledWith(false);
  });

  it('RF-19/RF-38: volume por pessoa e silenciar; deafen zera e volta ao volume escolhido', async () => {
    const { sala, emitir } = salaFalsa();
    const voz = criarSalaVoz(ouvintesVoz(), () => sala, vi.fn(async () => microfone()));
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    const faixa = (id: string) => {
      const el = document.createElement('audio');
      const f = { kind: 'audio', attach: () => el, detach: vi.fn(() => []), setVolume: vi.fn() };
      emitir(RoomEvent.TrackSubscribed, f, {}, { identity: id });
      return { el, f };
    };
    const a = faixa('2');
    const b = faixa('3');
    voz.definirPessoas({ volumes: { '2': 0.5, '3': 1.8 }, silenciados: [] });
    expect(a.f.setVolume).toHaveBeenLastCalledWith(0.5);
    expect(b.el.dataset.volume).toBe('1.8');
    voz.definirPessoas({ volumes: { '2': 0.5, '3': 1.8 }, silenciados: [3] });
    expect(b.f.setVolume).toHaveBeenLastCalledWith(0);
    expect(a.f.setVolume).toHaveBeenLastCalledWith(0.5);
    voz.controlar({ surdo: true });
    expect(a.f.setVolume).toHaveBeenLastCalledWith(0);
    voz.controlar({ surdo: false });
    expect(a.f.setVolume).toHaveBeenLastCalledWith(0.5);
    // Quem chega depois já entra com o volume guardado.
    voz.definirPessoas({ volumes: { '4': 0.2 }, silenciados: [] });
    expect(faixa('4').f.setVolume).toHaveBeenLastCalledWith(0.2);
  });

  it('RF-25: câmera ligada e desligada; vídeos dos outros aparecem e somem', async () => {
    const { sala, emitir } = salaFalsa();
    const minha = { attach: vi.fn(), detach: vi.fn() };
    (sala.localParticipant as unknown as { setCameraEnabled: unknown }).setCameraEnabled = vi.fn(async (ligar: boolean) => (ligar ? { track: minha } : undefined));
    const o = { ...ouvintesVoz(), aoVideos: vi.fn() };
    const voz = criarSalaVoz(o, () => sala, vi.fn(async () => microfone()));
    expect(await voz.camera(true)).toBe(false);
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    expect(await voz.camera(true)).toBe(true);
    expect(o.aoVideos).toHaveBeenLastCalledWith([{ usuarioId: 0, faixa: minha, meu: true }]);
    const dela = { kind: 'video', source: 'camera', attach: vi.fn(), detach: vi.fn() };
    emitir(RoomEvent.TrackSubscribed, dela, {}, { identity: '2' });
    expect(o.aoVideos).toHaveBeenLastCalledWith([
      { usuarioId: 0, faixa: minha, meu: true },
      { usuarioId: 2, faixa: dela, meu: false },
    ]);
    // Tela compartilhada não entra na grade de câmeras.
    emitir(RoomEvent.TrackSubscribed, { kind: 'video', source: 'screen_share' }, {}, { identity: '3' });
    expect(o.aoVideos.mock.lastCall![0]).toHaveLength(2);
    // Desligar a câmera do outro lado chega como "mudo" da publicação; religar, como "desmudo".
    emitir(RoomEvent.TrackMuted, { kind: 'video', source: 'camera' }, { identity: '2' });
    expect(o.aoVideos.mock.lastCall![0].map((v: { usuarioId: number }) => v.usuarioId)).toEqual([0]);
    emitir(RoomEvent.TrackUnmuted, { kind: 'video', source: 'camera', track: dela }, { identity: '2' });
    expect(o.aoVideos.mock.lastCall![0].map((v: { usuarioId: number }) => v.usuarioId)).toEqual([0, 2]);
    expect(await voz.camera(false)).toBe(false);
    emitir(RoomEvent.TrackUnsubscribed, dela);
    expect(o.aoVideos).toHaveBeenLastCalledWith([]);
    // Quem chega com a câmera desligada (publicação muda) não entra na grade.
    emitir(RoomEvent.TrackSubscribed, { kind: 'video', source: 'camera' }, { isMuted: true }, { identity: '4' });
    expect(o.aoVideos).toHaveBeenLastCalledWith([]);
    // Quem sai da sala some da grade.
    emitir(RoomEvent.TrackSubscribed, dela, {}, { identity: '2' });
    emitir(RoomEvent.ParticipantDisconnected, { identity: '2' });
    expect(o.aoVideos).toHaveBeenLastCalledWith([]);
    // Sair limpa a minha prévia.
    await voz.camera(true);
    await voz.sair();
    expect(o.aoVideos).toHaveBeenLastCalledWith([]);
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    (sala.localParticipant as unknown as { setCameraEnabled: ReturnType<typeof vi.fn> }).setCameraEnabled.mockRejectedValueOnce(new Error('sem câmera'));
    expect(await voz.camera(true)).toBe(false);
    expect(o.aoAviso).toHaveBeenLastCalledWith('Não foi possível abrir a câmera.');
  });

  it('RF-26/RF-30: transmitir sem simulcast, telas dos outros, parar no meio do início, fim por fora', async () => {
    const { sala, emitir } = salaFalsa();
    let liberar!: (v: unknown) => void;
    const minhaTela = { attach: vi.fn(), detach: vi.fn(), stop: vi.fn() };
    const setScreenShareEnabled = vi.fn(async (ligar: boolean) => (ligar ? { track: minhaTela } : undefined));
    (sala.localParticipant as unknown as { setScreenShareEnabled: unknown }).setScreenShareEnabled = setScreenShareEnabled;
    const o = { ...ouvintesVoz(), aoTelas: vi.fn(), aoMinhaTelaParou: vi.fn() };
    const voz = criarSalaVoz(o, () => sala, vi.fn(async () => microfone()));
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    expect(await voz.transmitir('720p30', false)).toBe(true);
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ contentHint: 'motion', resolution: { width: 1280, height: 720, frameRate: 30 } }),
      { simulcast: false, videoCodec: 'h264', backupCodec: false, screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 30 } },
    );
    expect(voz.transmitindoTela()).toBe(true);
    // Fim por fora (janela fechou).
    emitir(RoomEvent.LocalTrackUnpublished, { source: 'screen_share' });
    expect(o.aoMinhaTelaParou).toHaveBeenCalledTimes(1);
    expect(voz.transmitindoTela()).toBe(false);

    // Parar no meio do início: a captura que termina depois é desfeita.
    setScreenShareEnabled.mockImplementationOnce(() => new Promise((r) => (liberar = r as (v: unknown) => void)));
    const iniciando = voz.transmitir('720p30', false);
    await voz.pararTela();
    liberar({ track: minhaTela });
    expect(await iniciando).toBe(false);
    expect(setScreenShareEnabled).toHaveBeenLastCalledWith(false);
    expect(voz.transmitindoTela()).toBe(false);

    // Telas dos outros entram e saem.
    const dela = { kind: 'video', source: 'screen_share', attach: vi.fn(), detach: vi.fn() };
    emitir(RoomEvent.TrackSubscribed, dela, {}, { identity: '2' });
    expect(o.aoTelas).toHaveBeenLastCalledWith([{ usuarioId: 2, faixa: dela, meu: false }]);
    emitir(RoomEvent.TrackUnsubscribed, dela);
    expect(o.aoTelas).toHaveBeenLastCalledWith([]);
    emitir(RoomEvent.TrackSubscribed, dela, {}, { identity: '2' });
    emitir(RoomEvent.ParticipantDisconnected, { identity: '2' });
    expect(o.aoTelas).toHaveBeenLastCalledWith([]);

    setScreenShareEnabled.mockRejectedValueOnce(new Error('negado'));
    expect(await voz.transmitir('720p30', false)).toBe(false);
    expect(o.aoAviso).toHaveBeenLastCalledWith('Não foi possível transmitir a tela.');
  });

  it('queda sem pedir para sair avisa; microfone negado entra só para ouvir', async () => {
    const { sala, emitir } = salaFalsa();
    const o = ouvintesVoz();
    const voz = criarSalaVoz(o, () => sala, vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    expect(o.aoAviso).toHaveBeenCalledWith('Sem acesso ao microfone: você entrou só para ouvir.');
    expect(sala.localParticipant.publishTrack).not.toHaveBeenCalled();
    emitir(RoomEvent.Disconnected);
    expect(o.aoCaiu).toHaveBeenCalledTimes(1);
    await voz.entrar('ws://lk', 'tok2', AUDIO_PADRAO);
    expect(sala.connect).toHaveBeenCalledTimes(2);
  });

  it('falha ao conectar propaga o erro e libera para tentar de novo', async () => {
    const falha = salaFalsa({ conectar: 'falha' });
    const ok = salaFalsa();
    const fabrica = vi.fn().mockReturnValueOnce(falha.sala).mockReturnValueOnce(ok.sala);
    const voz = criarSalaVoz(ouvintesVoz(), fabrica, vi.fn(async () => microfone()));
    await expect(voz.entrar('ws://lk', 'tok', AUDIO_PADRAO)).rejects.toThrow('sem rota');
    await voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    expect(ok.sala.connect).toHaveBeenCalled();
  });

  it('sair durante o connect desfaz a entrada sem abrir o microfone', async () => {
    let liberar!: () => void;
    const { sala } = salaFalsa();
    sala.connect.mockImplementation(() => new Promise<void>((r) => (liberar = r)));
    const o = ouvintesVoz();
    const abrir = vi.fn(async () => microfone());
    const voz = criarSalaVoz(o, () => sala, abrir);
    const entrando = voz.entrar('ws://lk', 'tok', AUDIO_PADRAO);
    await voz.sair();
    liberar();
    await expect(entrando).rejects.toBeInstanceOf(EntradaCancelada);
    expect(sala.disconnect).toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
    expect(o.aoAviso).not.toHaveBeenCalled();
    expect(voz.sid()).toBeUndefined();
  });
});
