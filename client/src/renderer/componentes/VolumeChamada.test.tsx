// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VolumeChamada } from './VolumeChamada';

afterEach(cleanup);

describe('Volume da chamada no painel de voz (volume-da-voz, RF-4)', () => {
  it('abre o controle, mostra o valor e muda de 0 a 200%; Esc fecha', () => {
    const aoMudar = vi.fn();
    render(<VolumeChamada volume={1} aoMudar={aoMudar} />);
    const botao = screen.getByRole('button', { name: 'Volume da chamada' });
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(botao);
    const controle = screen.getByRole('slider', { name: 'Volume da chamada' }) as HTMLInputElement;
    expect(controle.max).toBe('200');
    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.change(controle, { target: { value: '150' } });
    expect(aoMudar).toHaveBeenLastCalledWith(1.5);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('clique fora fecha', () => {
    render(
      <>
        <VolumeChamada volume={0.5} aoMudar={vi.fn()} />
        <p>fora</p>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Volume da chamada' }));
    fireEvent.mouseDown(screen.getByText('fora'));
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
