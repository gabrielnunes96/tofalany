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
