// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NOVIDADES } from '@tofalando/shared';
import { JanelaNovidades } from './JanelaNovidades';
import { tocarFanfarra } from '../servicos/fanfarra';

afterEach(cleanup);

describe('JanelaNovidades', () => {
  it('mostra a chamada e os itens, toca a fanfarra uma vez e fecha no "Entendi"', () => {
    const tocar = vi.fn();
    const aoFechar = vi.fn();
    const { rerender } = render(<JanelaNovidades notas={NOVIDADES['0.15.0']!} versao="0.15.0" aoFechar={aoFechar} tocar={tocar} />);
    const janela = screen.getByRole('dialog', { name: 'Novidades da versão 0.15.0' });
    expect(screen.getByRole('heading', { name: 'O ToFalany está de cara nova' })).toBeTruthy();
    expect(janela.textContent).toContain('Temas refeitos');
    rerender(<JanelaNovidades notas={NOVIDADES['0.15.0']!} versao="0.15.0" aoFechar={aoFechar} tocar={tocar} />);
    expect(tocar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('sem chamada, o título é "Novidades da versão"', () => {
    render(<JanelaNovidades notas={{ itens: [{ titulo: 'A', texto: 'b' }] }} versao="0.14.0" aoFechar={() => undefined} tocar={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Novidades da versão 0.14.0' })).toBeTruthy();
  });

  it('fanfarra sem áudio disponível não quebra', () => {
    expect(() =>
      tocarFanfarra(() => {
        throw new Error('sem AudioContext');
      }),
    ).not.toThrow();
  });
});
