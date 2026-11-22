// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PainelSoundboard } from './PainelSoundboard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const sons = [
  { id: 1, nome: 'Grilo', url: '/files/a.wav', duracaoMs: 1000 },
  { id: 2, nome: 'Buzina', url: '/files/b.wav', duracaoMs: 1000 },
];

describe('PainelSoundboard (RF-23, RF-24)', () => {
  it('CA-33: fora da voz os botões ficam desabilitados', () => {
    render(<PainelSoundboard sons={sons} naVoz={false} liberadoEm={0} volume={0.8} aoVolume={vi.fn()} aoTocar={vi.fn()} aoFechar={vi.fn()} />);
    expect(screen.getByText('Entre num canal de voz para tocar sons.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Grilo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('CA-34: durante o descanso os botões ficam desabilitados com o motivo; erro do servidor aparece; volume local', async () => {
    vi.useFakeTimers();
    const aoTocar = vi.fn(async () => null as string | null);
    const aoVolume = vi.fn();
    const props = { sons, naVoz: true, volume: 0.8, aoVolume, aoTocar, aoFechar: vi.fn() };
    const { rerender } = render(<PainelSoundboard {...props} liberadoEm={0} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Grilo' })));
    expect(aoTocar).toHaveBeenCalledWith(1);
    rerender(<PainelSoundboard {...props} liberadoEm={Date.now() + 3000} />);
    const buzina = screen.getByRole('button', { name: 'Buzina' }) as HTMLButtonElement;
    expect(buzina.disabled).toBe(true);
    expect(screen.getByText('Aguarde 3 s para tocar outro som.')).toBeTruthy();
    expect(buzina.getAttribute('aria-describedby')).toBe('soundboard-motivo');
    await act(async () => vi.advanceTimersByTime(3100));
    expect(buzina.disabled).toBe(false);

    aoTocar.mockResolvedValueOnce('Aguarde 1 s para tocar outro som.');
    await act(async () => fireEvent.click(buzina));
    expect(screen.getByRole('alert').textContent).toBe('Aguarde 1 s para tocar outro som.');

    fireEvent.change(screen.getByLabelText(/Volume do soundboard/), { target: { value: '0' } });
    expect(aoVolume).toHaveBeenCalledWith(0);
  });

  it('audios-na-loja CA-8/CA-9: "Meus sons" com os comprados (raridade no nome acessível); sem compra, atalho para a loja', async () => {
    const aoTocarAudio = vi.fn(async () => null as string | null);
    const aoAbrirLoja = vi.fn();
    const props = { sons, naVoz: true, liberadoEm: 0, volume: 0.8, aoVolume: vi.fn(), aoTocar: vi.fn(), aoTocarAudio, aoAbrirLoja, aoFechar: vi.fn() };
    const { rerender } = render(<PainelSoundboard {...props} meusSons={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a loja' }));
    expect(aoAbrirLoja).toHaveBeenCalled();
    rerender(<PainelSoundboard {...props} meusSons={[{ id: 3, nome: 'Trovão', url: '/files/t.wav', duracaoMs: 1000, raridade: 'raro' }]} />);
    const botao = screen.getByRole('button', { name: 'Trovão (Raro)' });
    expect(botao.className).toContain('raridade-raro');
    await act(async () => fireEvent.click(botao));
    expect(aoTocarAudio).toHaveBeenCalledWith(3);
  });

  it('servidor antigo (sem loja): sem a seção "Meus sons"', () => {
    render(<PainelSoundboard sons={sons} naVoz liberadoEm={0} volume={0.8} aoVolume={vi.fn()} aoTocar={vi.fn()} aoFechar={vi.fn()} />);
    expect(screen.queryByText('Meus sons')).toBeNull();
  });
});
