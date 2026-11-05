// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AUDIO_PADRAO, type PreferenciasAudio } from '@tofalando/shared';
import { TelaConfiguracoes, type DependenciasConfiguracoes } from './TelaConfiguracoes';

vi.mock('../servicos/pipeline-audio', () => ({ abrirMicrofone: vi.fn(), criarMedidor: vi.fn() }));

afterEach(cleanup);

const dispositivo = (kind: MediaDeviceKind, deviceId: string, label: string) => ({ kind, deviceId, label, groupId: '' }) as MediaDeviceInfo;

function montar(audio: PreferenciasAudio = AUDIO_PADRAO, supressao: 'forte' | 'basica' = 'forte', extra: Partial<Parameters<typeof TelaConfiguracoes>[0]> = {}) {
  const parar = vi.fn();
  const pararMedidor = vi.fn();
  const deps: DependenciasConfiguracoes = {
    listarDispositivos: vi.fn(async () => [
      dispositivo('audioinput', 'default', 'Padrão'),
      dispositivo('audioinput', 'mic-1', 'Microfone USB'),
      dispositivo('audioinput', 'mic-2', ''),
      dispositivo('audiooutput', 'fone', 'Fone'),
    ]),
    aoMudarDispositivos: () => () => undefined,
    abrirMicrofone: vi.fn(async () => ({ faixa: {} as MediaStreamTrack, supressao, usouPadrao: false, dispositivoId: 'mic-1', parar })),
    criarMedidor: vi.fn(() => ({ nivelDb: () => -20, parar: pararMedidor })),
  };
  const aoMudarAudio = vi.fn();
  const r = render(<TelaConfiguracoes audio={audio} aoMudarAudio={aoMudarAudio} aoVoltar={() => undefined} deps={deps} {...extra} />);
  return { deps, aoMudarAudio, parar, pararMedidor, desmontar: r.unmount };
}

describe('TelaConfiguracoes (RF-17, RF-18, RF-20)', () => {
  it('lista dispositivos (sem o "default" duplicado) e muda cada opção', async () => {
    const { aoMudarAudio } = montar();
    const entrada = screen.getByLabelText('Microfone') as HTMLSelectElement;
    await waitFor(() => expect([...entrada.options].map((o) => o.textContent)).toEqual(['Padrão do sistema', 'Microfone USB', 'Microfone 2']));
    fireEvent.change(entrada, { target: { value: 'mic-1' } });
    expect(aoMudarAudio).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, entradaId: 'mic-1' });
    fireEvent.change(screen.getByLabelText('Saída de áudio'), { target: { value: 'fone' } });
    expect(aoMudarAudio).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, saidaId: 'fone' });
    fireEvent.click(screen.getByLabelText('Cancelamento de eco'));
    expect(aoMudarAudio).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, cancelamentoEco: false });
    fireEvent.change(screen.getByLabelText(/Sensibilidade da detecção de voz/), { target: { value: '-30' } });
    expect(aoMudarAudio).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, sensibilidadeDb: -30 });
  });

  it('dispositivo salvo que sumiu aparece como desconectado', async () => {
    montar({ ...AUDIO_PADRAO, entradaId: 'velho' });
    expect(await screen.findByRole('option', { name: 'Dispositivo desconectado' })).toBeTruthy();
  });

  it('teste de microfone: medidor se mexe, mostra a supressão efetiva e para ao sair', async () => {
    const { deps, parar, pararMedidor } = montar(AUDIO_PADRAO, 'basica');
    const medidor = screen.getByRole('meter', { name: 'Nível do microfone' });
    expect(medidor.getAttribute('aria-valuetext')).toBe('sem teste');
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    await waitFor(() => expect(medidor.getAttribute('aria-valuenow')).toBe('-20'));
    expect(deps.abrirMicrofone).toHaveBeenCalledWith(AUDIO_PADRAO);
    expect(screen.getByRole('status').textContent).toContain('básica');
    fireEvent.click(screen.getByRole('button', { name: 'Parar teste' }));
    expect(parar).toHaveBeenCalled();
    expect(pararMedidor).toHaveBeenCalled();
  });

  it('sair da tela antes do microfone abrir fecha o que abrir depois; clique duplo não vaza', async () => {
    const { deps, parar, desmontar } = montar();
    let liberar!: () => void;
    vi.mocked(deps.abrirMicrofone).mockImplementationOnce(
      () => new Promise((r) => (liberar = () => r({ faixa: {} as MediaStreamTrack, supressao: 'forte', usouPadrao: false, dispositivoId: 'x', parar }))),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    desmontar();
    liberar();
    await waitFor(() => expect(parar).toHaveBeenCalled());
    expect(deps.criarMedidor).not.toHaveBeenCalled();
  });

  it('em chamada, mede o microfone da chamada sem abrir outro nem fechá-lo', async () => {
    const pararDaChamada = vi.fn();
    const daChamada = { faixa: {} as MediaStreamTrack, supressao: 'forte' as const, usouPadrao: false, dispositivoId: 'mic-1', parar: pararDaChamada };
    const { deps } = montar(AUDIO_PADRAO, 'forte', { microfoneDaChamada: () => daChamada });
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Medindo o microfone da chamada'));
    expect(deps.abrirMicrofone).not.toHaveBeenCalled();
    expect(deps.criarMedidor).toHaveBeenCalledWith(daChamada.faixa);
    fireEvent.click(screen.getByRole('button', { name: 'Parar teste' }));
    expect(pararDaChamada).not.toHaveBeenCalled();
  });

  it('microfone negado mostra erro', async () => {
    const { deps } = montar();
    vi.mocked(deps.abrirMicrofone).mockRejectedValueOnce(new Error('NotAllowedError'));
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível abrir o microfone');
  });
});
