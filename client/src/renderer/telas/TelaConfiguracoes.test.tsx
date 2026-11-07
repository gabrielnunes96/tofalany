// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ATALHOS_PADRAO, AUDIO_PADRAO, type PreferenciasAudio } from '@tofalando/shared';
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
    abrirMicrofone: vi.fn(async () => ({ faixa: {} as MediaStreamTrack, faixaMedicao: {} as MediaStreamTrack, portao: { definir: vi.fn(), aoMudar: () => () => undefined }, supressao, usouPadrao: false, dispositivoId: 'mic-1', parar })),
    criarMedidor: vi.fn(() => ({ nivelDb: () => -20, parar: pararMedidor })),
  };
  const aoMudarAudio = vi.fn();
  const aoMudarAtalhos = vi.fn();
  const r = render(
    <TelaConfiguracoes audio={audio} aoMudarAudio={aoMudarAudio} atalhos={ATALHOS_PADRAO} aoMudarAtalhos={aoMudarAtalhos} aoVoltar={() => undefined} deps={deps} {...extra} />,
  );
  return { deps, aoMudarAudio, aoMudarAtalhos, parar, pararMedidor, desmontar: r.unmount };
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
      () =>
        new Promise((r) =>
          (liberar = () =>
            r({ faixa: {} as MediaStreamTrack, faixaMedicao: {} as MediaStreamTrack, portao: { definir: vi.fn(), aoMudar: () => () => undefined }, supressao: 'forte', usouPadrao: false, dispositivoId: 'x', parar })),
        ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    desmontar();
    liberar();
    await waitFor(() => expect(parar).toHaveBeenCalled());
    expect(deps.criarMedidor).not.toHaveBeenCalled();
  });

  it('em chamada, mede o microfone da chamada sem abrir outro nem fechá-lo', async () => {
    const pararDaChamada = vi.fn();
    const daChamada = {
      faixa: {} as MediaStreamTrack,
      faixaMedicao: { medicao: true } as unknown as MediaStreamTrack,
      portao: { definir: vi.fn(), aoMudar: () => () => undefined },
      supressao: 'forte' as const,
      usouPadrao: false,
      dispositivoId: 'mic-1',
      parar: pararDaChamada,
    };
    const { deps } = montar(AUDIO_PADRAO, 'forte', { microfoneDaChamada: () => daChamada });
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Medindo o microfone da chamada'));
    expect(deps.abrirMicrofone).not.toHaveBeenCalled();
    expect(deps.criarMedidor).toHaveBeenCalledWith(daChamada.faixaMedicao);
    fireEvent.click(screen.getByRole('button', { name: 'Parar teste' }));
    expect(pararDaChamada).not.toHaveBeenCalled();
  });

  it('RF-14/RF-15: modo do microfone e atalhos com captura, conflito recusado e remoção', () => {
    const { aoMudarAudio, aoMudarAtalhos } = montar();
    fireEvent.click(screen.getByRole('radio', { name: /Push-to-talk/ }));
    expect(aoMudarAudio).toHaveBeenLastCalledWith({ ...AUDIO_PADRAO, modoMicrofone: 'ptt' });

    const ptt = screen.getByRole('listitem', { name: 'Push-to-talk' });
    expect(within(ptt).getByText('Nenhum')).toBeTruthy();
    fireEvent.click(within(ptt).getByRole('button', { name: 'Alterar atalho de Push-to-talk' }));
    expect(within(ptt).getByText(/Pressione a combinação/)).toBeTruthy();
    // CA-23: mesma combinação do mute é recusada.
    fireEvent.keyDown(window, { code: 'KeyM', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('alert').textContent).toBe('Ctrl+Shift+M já é o atalho de Mute (microfone).');
    expect(aoMudarAtalhos).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: 'ShiftLeft', shiftKey: true });
    fireEvent.keyDown(window, { code: 'Backquote' });
    expect(aoMudarAtalhos).toHaveBeenLastCalledWith({ ...ATALHOS_PADRAO, ptt: { codigo: 'Backquote', ctrl: false, alt: false, shift: false, meta: false } });

    fireEvent.click(screen.getByRole('button', { name: 'Remover atalho de Deafen (áudio)' }));
    expect(aoMudarAtalhos).toHaveBeenLastCalledWith({ ...ATALHOS_PADRAO, surdo: null });

    fireEvent.click(screen.getByRole('button', { name: 'Alterar atalho de Mute (microfone)' }));
    fireEvent.keyDown(window, { code: 'Escape' });
    expect(within(screen.getByRole('listitem', { name: 'Mute (microfone)' })).getByText('Ctrl+Shift+M')).toBeTruthy();
  });

  it('microfone negado mostra erro', async () => {
    const { deps } = montar();
    vi.mocked(deps.abrirMicrofone).mockRejectedValueOnce(new Error('NotAllowedError'));
    fireEvent.click(screen.getByRole('button', { name: 'Testar microfone' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível abrir o microfone');
  });

  it('backlog v2, 1e: opção de fechar para a bandeja', () => {
    const aoMudarBandeja = vi.fn();
    montar(AUDIO_PADRAO, 'forte', { fecharParaBandeja: true, aoMudarBandeja });
    const caixa = screen.getByLabelText(/deixar o ToFalany na bandeja/);
    expect(caixa).toHaveProperty('checked', true);
    fireEvent.click(caixa);
    expect(aoMudarBandeja).toHaveBeenCalledWith(false);
  });
});
