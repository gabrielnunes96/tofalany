// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import { criarSalaVoz, EntradaCancelada, type SalaLivekit } from './voz';

function salaFalsa(opcoes: { microfone?: 'ok' | 'negado'; conectar?: 'ok' | 'falha' } = {}) {
  const ouvintes = new Map<string, (...a: unknown[]) => void>();
  const sala = {
    on: vi.fn((e: string, fn: (...a: unknown[]) => void) => ouvintes.set(e, fn)),
    connect: vi.fn(async () => {
      if (opcoes.conectar === 'falha') throw new Error('sem rota');
    }),
    disconnect: vi.fn(async () => ouvintes.get(RoomEvent.Disconnected)?.()),
    localParticipant: {
      setMicrophoneEnabled: vi.fn(async () => {
        if (opcoes.microfone === 'negado') throw new Error('NotAllowedError');
      }),
    },
  };
  const emitir = (e: RoomEvent, ...args: unknown[]) => ouvintes.get(e)?.(...args);
  return { sala: sala as unknown as SalaLivekit & typeof sala, emitir };
}

const ouvintesVoz = () => ({ aoFalando: vi.fn(), aoCaiu: vi.fn(), aoAviso: vi.fn() });

describe('sala de voz (RF-13)', () => {
  it('conecta, publica o microfone, toca o áudio recebido e informa quem fala', async () => {
    const { sala, emitir } = salaFalsa();
    const o = ouvintesVoz();
    const voz = criarSalaVoz(o, () => sala);
    await voz.entrar('ws://lk', 'tok');
    expect(sala.connect).toHaveBeenCalledWith('ws://lk', 'tok');
    expect(sala.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);

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
    expect(o.aoCaiu).not.toHaveBeenCalled();
    expect(o.aoFalando).toHaveBeenLastCalledWith([]);
    await voz.destruir();
    expect(document.querySelector('[data-testid="audios-voz"]')).toBeNull();
  });

  it('sair durante o connect desfaz a entrada sem aviso falso de microfone', async () => {
    let liberar!: () => void;
    const { sala } = salaFalsa();
    sala.connect.mockImplementation(() => new Promise<void>((r) => (liberar = r)));
    const o = ouvintesVoz();
    const voz = criarSalaVoz(o, () => sala);
    const entrando = voz.entrar('ws://lk', 'tok');
    await voz.sair();
    liberar();
    await expect(entrando).rejects.toBeInstanceOf(EntradaCancelada);
    expect(sala.disconnect).toHaveBeenCalled();
    expect(sala.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(o.aoAviso).not.toHaveBeenCalled();
    expect(voz.sid()).toBeUndefined();
  });

  it('queda sem pedir para sair avisa; microfone negado entra só para ouvir', async () => {
    const { sala, emitir } = salaFalsa({ microfone: 'negado' });
    const o = ouvintesVoz();
    const voz = criarSalaVoz(o, () => sala);
    await voz.entrar('ws://lk', 'tok');
    expect(o.aoAviso).toHaveBeenCalledWith('Sem acesso ao microfone: você entrou só para ouvir.');
    emitir(RoomEvent.Disconnected);
    expect(o.aoCaiu).toHaveBeenCalledTimes(1);
    // Pode entrar de novo depois de cair.
    await voz.entrar('ws://lk', 'tok2');
    expect(sala.connect).toHaveBeenCalledTimes(2);
  });

  it('falha ao conectar propaga o erro e libera para tentar de novo', async () => {
    const falha = salaFalsa({ conectar: 'falha' });
    const ok = salaFalsa();
    const fabrica = vi.fn().mockReturnValueOnce(falha.sala).mockReturnValueOnce(ok.sala);
    const voz = criarSalaVoz(ouvintesVoz(), fabrica);
    await expect(voz.entrar('ws://lk', 'tok')).rejects.toThrow('sem rota');
    await voz.entrar('ws://lk', 'tok');
    expect(ok.sala.connect).toHaveBeenCalled();
  });
});
