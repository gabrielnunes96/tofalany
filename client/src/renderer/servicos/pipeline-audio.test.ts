import { describe, expect, it, vi } from 'vitest';
import { AUDIO_PADRAO } from '@tofalando/shared';
import { abrirMicrofone, nivelEmDb, type DependenciasAudio } from './pipeline-audio';

vi.mock('@sapphi-red/web-noise-suppressor', () => ({ loadRnnoise: vi.fn(), RnnoiseWorkletNode: vi.fn() }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url', () => ({ default: 'w.js' }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url', () => ({ default: 'r.wasm' }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url', () => ({ default: 's.wasm' }));

const faixa = (nome: string) => ({ nome, stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: 'dev-' + nome }) }) as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
const stream = (t: MediaStreamTrack) => ({ getAudioTracks: () => [t], getTracks: () => [t] }) as unknown as MediaStream;

function deps(opcoes: { rnnoise?: 'ok' | 'falha'; semDispositivo?: boolean } = {}) {
  const bruta = faixa('bruta');
  const tratada = faixa('rnnoise');
  const fechar = vi.fn();
  const d = {
    getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
      const a = c.audio as MediaTrackConstraints;
      if (opcoes.semDispositivo && a.deviceId) throw Object.assign(new Error('sumiu'), { name: 'OverconstrainedError' });
      return stream(bruta);
    }),
    prepararRnnoise: vi.fn(async () => {
      if (opcoes.rnnoise === 'falha') throw new Error('sem worklet');
      return { processar: () => tratada, fechar };
    }),
  } satisfies DependenciasAudio;
  return { d, bruta, tratada, fechar };
}

describe('pipeline de áudio (RF-17, RF-18)', () => {
  it('supressão forte: RNNoise processa e a do Chromium fica desligada; eco e ganho conforme a escolha', async () => {
    const { d, bruta, tratada, fechar } = deps();
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, entradaId: 'mic-2', ganhoAutomatico: false }, d);
    expect(mic.supressao).toBe('forte');
    expect(mic.faixa).toBe(tratada);
    expect(mic.dispositivoId).toBe('dev-bruta');
    // Microfone desconectado encerra também a faixa tratada.
    const aoAcabar = (bruta.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'ended')![1] as () => void;
    aoAcabar();
    expect(tratada.stop).toHaveBeenCalled();
    expect(d.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic-2' }, echoCancellation: true, autoGainControl: false, noiseSuppression: false, channelCount: 1 },
      video: false,
    });
    mic.parar();
    expect(bruta.stop).toHaveBeenCalled();
    expect(tratada.stop).toHaveBeenCalled();
    expect(fechar).toHaveBeenCalled();
  });

  it('RNNoise indisponível: cai para a supressão básica do Chromium', async () => {
    const { d, bruta } = deps({ rnnoise: 'falha' });
    const mic = await abrirMicrofone(AUDIO_PADRAO, d);
    expect(mic.supressao).toBe('basica');
    expect(mic.faixa).toBe(bruta);
    expect((d.getUserMedia.mock.calls[0]![0].audio as MediaTrackConstraints).noiseSuppression).toBe(true);
  });

  it('supressão desligada não carrega o RNNoise', async () => {
    const { d } = deps();
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, supressaoRuido: false, cancelamentoEco: false }, d);
    expect(mic.supressao).toBe('desligada');
    expect(d.prepararRnnoise).not.toHaveBeenCalled();
    expect(d.getUserMedia.mock.calls[0]![0].audio).toMatchObject({ noiseSuppression: false, echoCancellation: false });
  });

  it('microfone escolhido sumiu: usa o padrão e avisa; outro erro fecha o RNNoise e propaga', async () => {
    const sumiu = deps({ semDispositivo: true });
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, entradaId: 'velho' }, sumiu.d);
    expect(mic.usouPadrao).toBe(true);
    expect((sumiu.d.getUserMedia.mock.calls[1]![0].audio as MediaTrackConstraints).deviceId).toBeUndefined();

    const negado = deps();
    negado.d.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('não'), { name: 'NotAllowedError' }));
    await expect(abrirMicrofone(AUDIO_PADRAO, negado.d)).rejects.toThrow('não');
    expect(negado.fechar).toHaveBeenCalled();
  });

  it('nível em dBFS', () => {
    expect(nivelEmDb(new Float32Array(8))).toBe(-100);
    expect(nivelEmDb(new Float32Array(8).fill(1))).toBe(0);
    expect(Math.round(nivelEmDb(new Float32Array(8).fill(0.1)))).toBe(-20);
  });
});
