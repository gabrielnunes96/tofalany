import { describe, expect, it, vi } from 'vitest';
import { AUDIO_PADRAO } from '@tofalando/shared';
import { abrirMicrofone, nivelEmDb, type DependenciasAudio } from './pipeline-audio';

vi.mock('@sapphi-red/web-noise-suppressor', () => ({ loadRnnoise: vi.fn(), RnnoiseWorkletNode: vi.fn() }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url', () => ({ default: 'w.js' }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url', () => ({ default: 'r.wasm' }));
vi.mock('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url', () => ({ default: 's.wasm' }));
vi.mock('./portao-voz.worklet.js?url', () => ({ default: 'p.js' }));

const faixa = (nome: string) =>
  ({ nome, stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId: 'dev-' + nome }) }) as unknown as MediaStreamTrack & {
    stop: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  };
const stream = (t: MediaStreamTrack) => ({ getAudioTracks: () => [t], getTracks: () => [t] }) as unknown as MediaStream;

function deps(opcoes: { rnnoise?: 'ok' | 'falha'; semDispositivo?: boolean } = {}) {
  const bruta = faixa('bruta');
  const saida = faixa('saida');
  const medicao = faixa('medicao');
  const fechar = vi.fn();
  const definir = vi.fn();
  const d = {
    getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
      const a = c.audio as MediaTrackConstraints;
      if (opcoes.semDispositivo && a.deviceId) throw Object.assign(new Error('sumiu'), { name: 'OverconstrainedError' });
      return stream(bruta);
    }),
    prepararGrafo: vi.fn(async (rnnoise: boolean) => {
      if (rnnoise && opcoes.rnnoise === 'falha') throw new Error('sem worklet');
      return { processar: () => ({ faixa: saida, faixaMedicao: medicao, portao: { definir, aoMudar: () => () => undefined } }), fechar };
    }),
  } satisfies DependenciasAudio;
  return { d, bruta, saida, medicao, fechar, definir };
}

describe('pipeline de áudio (RF-14, RF-17, RF-18)', () => {
  it('supressão forte: RNNoise no grafo, a do Chromium desligada; portão com modo e sensibilidade', async () => {
    const { d, bruta, saida, medicao, fechar, definir } = deps();
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, entradaId: 'mic-2', ganhoAutomatico: false, modoMicrofone: 'ptt', sensibilidadeDb: -30 }, d);
    expect(d.prepararGrafo).toHaveBeenCalledWith(true);
    expect(mic.supressao).toBe('forte');
    expect(mic.faixa).toBe(saida);
    expect(mic.faixaMedicao).toBe(medicao);
    expect(mic.dispositivoId).toBe('dev-bruta');
    expect(definir).toHaveBeenCalledWith({ modo: 'ptt', limiarDb: -30 });
    expect(d.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic-2' }, echoCancellation: true, autoGainControl: false, noiseSuppression: false, channelCount: 1 },
      video: false,
    });
    // Microfone desconectado encerra também as faixas do grafo.
    (bruta.addEventListener.mock.calls.find((c) => c[0] === 'ended')![1] as () => void)();
    expect(saida.stop).toHaveBeenCalled();
    mic.parar();
    expect(bruta.stop).toHaveBeenCalled();
    expect(medicao.stop).toHaveBeenCalled();
    expect(fechar).toHaveBeenCalled();
  });

  it('RNNoise indisponível: grafo sem ele e supressão básica do Chromium', async () => {
    const { d } = deps({ rnnoise: 'falha' });
    const mic = await abrirMicrofone(AUDIO_PADRAO, d);
    expect(d.prepararGrafo.mock.calls).toEqual([[true], [false]]);
    expect(mic.supressao).toBe('basica');
    expect((d.getUserMedia.mock.calls[0]![0].audio as MediaTrackConstraints).noiseSuppression).toBe(true);
  });

  it('supressão desligada não carrega o RNNoise', async () => {
    const { d } = deps();
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, supressaoRuido: false, cancelamentoEco: false }, d);
    expect(mic.supressao).toBe('desligada');
    expect(d.prepararGrafo.mock.calls).toEqual([[false]]);
    expect(d.getUserMedia.mock.calls[0]![0].audio).toMatchObject({ noiseSuppression: false, echoCancellation: false });
  });

  it('microfone escolhido sumiu: usa o padrão e avisa; outro erro fecha o grafo e propaga', async () => {
    const sumiu = deps({ semDispositivo: true });
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, entradaId: 'velho' }, sumiu.d);
    expect(mic.usouPadrao).toBe(true);
    expect((sumiu.d.getUserMedia.mock.calls[1]![0].audio as MediaTrackConstraints).deviceId).toBeUndefined();

    const negado = deps();
    negado.d.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('não'), { name: 'NotAllowedError' }));
    await expect(abrirMicrofone(AUDIO_PADRAO, negado.d)).rejects.toThrow('não');
    expect(negado.fechar).toHaveBeenCalled();
  });

  it('sem AudioWorklet: microfone direto e o portão vira liga/desliga da faixa', async () => {
    const { d, bruta } = deps();
    d.prepararGrafo.mockRejectedValue(new Error('sem worklet'));
    const mic = await abrirMicrofone({ ...AUDIO_PADRAO, modoMicrofone: 'ptt' }, d);
    expect(mic.faixa).toBe(bruta);
    expect(mic.supressao).toBe('basica');
    expect(bruta.enabled).toBe(false);
    mic.portao.definir({ ptt: true });
    expect(bruta.enabled).toBe(true);
    mic.portao.definir({ mudo: true });
    expect(bruta.enabled).toBe(false);
  });

  it('nível em dBFS', () => {
    expect(nivelEmDb(new Float32Array(8))).toBe(-100);
    expect(nivelEmDb(new Float32Array(8).fill(1))).toBe(0);
    expect(Math.round(nivelEmDb(new Float32Array(8).fill(0.1)))).toBe(-20);
  });
});
